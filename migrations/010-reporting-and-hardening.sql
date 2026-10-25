begin;
create or replace function public.list_public_jobs() returns setof public.jobs language sql stable security definer set search_path='' as $$select j.* from public.jobs j where public.job_is_eligible(j.id) order by j.created_at desc$$;
create or replace function public.workflow_metrics() returns jsonb language plpgsql stable security definer set search_path='' as $$declare result jsonb;admin boolean;begin
perform public.require_workflow_access();admin:=public.is_admin();if not admin and not public.is_active_company() then raise exception 'Recruiter reports only' using errcode='42501';end if;
select jsonb_build_object('metrics',jsonb_build_object(
'registered_seekers',case when admin then (select count(*) from public.profiles where role='seeker') else 0 end,
'registered_companies',case when admin then (select count(*) from public.profiles where role='company') else 1 end,
'pending_employers',case when admin then (select count(*) from public.profiles where role='company' and approval_status='pending') else 0 end,
'approved_employers',case when admin then (select count(*) from public.profiles where role='company' and approval_status='active') else 1 end,
'pending_vacancies',(select count(*) from public.jobs where (admin or company_id=auth.uid()) and status='pending'),
'active_vacancies',(select count(*) from public.jobs where (admin or company_id=auth.uid()) and public.job_is_eligible(id)),
'expired_vacancies',(select count(*) from public.jobs where (admin or company_id=auth.uid()) and deadline<=now()),
'closed_vacancies',(select count(*) from public.jobs where (admin or company_id=auth.uid()) and status='closed'),
'applications',(select count(*) from public.applications a join public.jobs j on j.id=a.job_id where admin or j.company_id=auth.uid()),
'new_applications',(select count(*) from public.applications a join public.jobs j on j.id=a.job_id where (admin or j.company_id=auth.uid()) and a.status='submitted'),
'shortlisted',(select count(*) from public.applications a join public.jobs j on j.id=a.job_id where (admin or j.company_id=auth.uid()) and a.status='shortlisted'),
'interviews',(select count(*) from public.interviews i join public.applications a on a.id=i.application_id join public.jobs j on j.id=a.job_id where (admin or j.company_id=auth.uid()) and i.status in('scheduled','rescheduled')),
'offers',(select count(*) from public.job_offers o join public.applications a on a.id=o.application_id join public.jobs j on j.id=a.job_id where admin or j.company_id=auth.uid()),
'hired',(select count(*) from public.applications a join public.jobs j on j.id=a.job_id where (admin or j.company_id=auth.uid()) and a.status='hired'),
'reported_concerns',case when admin then (select count(*) from public.complaints where status in('open','reviewing')) else 0 end
),'trends',jsonb_build_object(
'Monthly applications',coalesce((select jsonb_agg(x) from(select to_char(a.created_at at time zone 'Asia/Manila','YYYY-MM') label,count(*) count from public.applications a join public.jobs j on j.id=a.job_id where admin or j.company_id=auth.uid() group by 1 order by 1)x),'[]'),
'Employer',coalesce((select jsonb_agg(x) from(select j.company_name label,count(*) count from public.applications a join public.jobs j on j.id=a.job_id where admin or j.company_id=auth.uid() group by 1 order by 2 desc)x),'[]'),
'Category',coalesce((select jsonb_agg(x) from(select j.category label,count(*) count from public.jobs j where admin or j.company_id=auth.uid() group by 1 order by 2 desc)x),'[]'),
'Location',coalesce((select jsonb_agg(x) from(select j.location label,count(*) count from public.jobs j where admin or j.company_id=auth.uid() group by 1 order by 2 desc)x),'[]')
)) into result;return result;end$$;
-- Expiry and employer suspension are enforced in the existing public directory RPC too.
create or replace function public.list_approved_employers() returns table(id uuid,company_name text,location text,bio text,open_jobs bigint) language sql stable security definer set search_path='' as $$select p.id,coalesce(nullif(p.company_name,''),'Employer'),p.location,p.bio,(select count(*) from public.jobs j where j.company_id=p.id and public.job_is_eligible(j.id)) from public.profiles p where p.role='company' and p.approval_status='active' order by lower(p.company_name),p.id$$;
-- Preserve existing applications and legacy documents. New staged documents cannot be attached after submission.
create or replace function public.protect_application_update() returns trigger language plpgsql security definer set search_path='' as $$begin
if (new.id,new.job_id,new.seeker_id,new.created_at,new.cover_letter,new.document_paths,new.reference,new.profile_snapshot,new.submission_key) is distinct from (old.id,old.job_id,old.seeker_id,old.created_at,old.cover_letter,old.document_paths,old.reference,old.profile_snapshot,old.submission_key) then raise exception 'Submission records and documents are immutable';end if;return new;end$$;
-- Every published/reviewed job status change gets a durable audit record and alerts are opt-in.
create or replace function public.audit_job_change() returns trigger language plpgsql security definer set search_path='' as $$begin
insert into public.audit_logs(actor_id,action,entity_id,details) values(auth.uid(),'vacancy_'||lower(tg_op),new.id,jsonb_build_object('status',new.status));
if new.status='approved' and (tg_op='INSERT' or old.status is distinct from new.status) then
insert into public.notifications(user_id,kind,message,entity_id)
select user_id,'job_alert','New approved vacancy: '||new.title,new.id from public.job_alerts a where enabled
and (coalesce(a.preferences->>'location','')='' or new.location ilike '%'||(a.preferences->>'location')||'%')
and (coalesce(a.preferences->>'employment_type','')='' or new.employment_type=a.preferences->>'employment_type')
and (coalesce(a.preferences->>'category','')='' or new.category=a.preferences->>'category');end if;return new;end$$;
drop trigger if exists audit_jobs on public.jobs;
create trigger audit_jobs after insert or update on public.jobs for each row execute function public.audit_job_change();
create or replace function public.audit_career_change() returns trigger language plpgsql security definer set search_path='' as $$begin
perform public.require_workflow_access();if not public.is_admin() then raise exception 'Administrator required';end if;
insert into public.audit_logs(actor_id,action,entity_id) values(auth.uid(),'career_'||lower(tg_op),coalesce(new.id,old.id));return coalesce(new,old);end$$;
drop trigger if exists career_audit on public.career_resources;
create trigger career_audit before insert or update or delete on public.career_resources for each row execute function public.audit_career_change();
drop policy if exists "Public reads published career resources" on public.career_resources;
create policy "Public reads published career resources" on public.career_resources for select to anon,authenticated using((published and not archived) or public.is_admin());
-- A separate private CV library is never implicitly shared with employers.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('profile-documents','profile-documents',false,5242880,array['application/pdf','image/jpeg','image/png','application/vnd.openxmlformats-officedocument.wordprocessingml.document']) on conflict(id) do update set public=false,file_size_limit=5242880,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists profile_files_read on storage.objects;
create policy profile_files_read on storage.objects for select to authenticated using(bucket_id='profile-documents' and (storage.foldername(name))[1]=auth.uid()::text and public.has_current_session_ack());
drop policy if exists profile_files_upload on storage.objects;
create policy profile_files_upload on storage.objects for insert to authenticated with check(bucket_id='profile-documents' and (storage.foldername(name))[1]=auth.uid()::text and public.is_active_seeker() and public.has_current_session_ack());
drop policy if exists profile_files_delete on storage.objects;
create policy profile_files_delete on storage.objects for delete to authenticated using(bucket_id='profile-documents' and (storage.foldername(name))[1]=auth.uid()::text and public.has_current_session_ack());
drop policy if exists company_files_read on storage.objects;
create policy company_files_read on storage.objects for select to authenticated using(bucket_id='company-verification' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin()) and public.has_current_session_ack());
drop policy if exists company_files_upload on storage.objects;
create policy company_files_upload on storage.objects for insert to authenticated with check(bucket_id='company-verification' and (storage.foldername(name))[1]=auth.uid()::text and exists(select 1 from public.profiles where id=auth.uid() and role='company' and approval_status in('active','pending')) and public.has_current_session_ack());
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('company-verification','company-verification',false,5242880,array['application/pdf','image/jpeg','image/png']) on conflict(id) do update set public=false;
revoke all on function public.list_public_jobs(),public.workflow_metrics() from public,anon,authenticated;
grant execute on function public.list_public_jobs() to anon,authenticated;
grant execute on function public.workflow_metrics() to authenticated;
-- Revoke anonymous execution on legacy privileged RPCs; policies still use safe helpers.
revoke execute on function public.update_my_profile(text,text,text,text,text),public.save_my_seeker_information(text,text,text,text,jsonb,jsonb,jsonb,jsonb),public.get_application_seeker_information(uuid) from public,anon;
notify pgrst,'reload schema';
commit;
