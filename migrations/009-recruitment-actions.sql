begin;
create or replace function public.workflow_action(p_action text,p_id uuid default null,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.applications;j public.jobs;i public.interviews;o public.job_offers;dest uuid;next text;reason text;rid uuid;begin
if p_action='privacy_request' then
if auth.uid() is null then raise exception 'Authenticated identity required for this request' using errcode='42501';end if;
if length(coalesce(p_data->>'body','')) not between 1 and 4000 then raise exception 'Describe your request';end if;
if (select count(*) from public.privacy_requests where user_id=auth.uid() and created_at>now()-interval '1 hour')>=5 then raise exception 'Please wait before sending another request';end if;
insert into public.privacy_requests(user_id,kind,body) values(auth.uid(),p_data->>'kind',p_data->>'body') returning id into rid;return jsonb_build_object('id',rid);end if;
-- Pending employers may complete onboarding without being allowed to publish.
if p_action='save_company' then
if not public.has_current_session_ack() or not exists(select 1 from public.profiles where id=auth.uid() and role='company' and approval_status in('active','pending')) then raise exception 'Eligible employer required';end if;
else perform public.require_workflow_access();end if;
if jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>30000 then raise exception 'Invalid request';end if;reason:=left(coalesce(p_data->>'reason',''),2000);
if p_action='read_notification' then update public.notifications set read_at=coalesce(read_at,now()) where user_id=auth.uid() and (p_id is null or id=p_id);
elsif p_action='save_alerts' then insert into public.job_alerts(user_id,enabled,preferences) values(auth.uid(),coalesce((p_data->>'enabled')::boolean,false),p_data-'enabled') on conflict(user_id) do update set enabled=excluded.enabled,preferences=excluded.preferences,updated_at=now();
elsif p_action='save_company' then
if length(coalesce(p_data->>'business_name',''))<2 or coalesce(p_data->>'website','')<>'' and p_data->>'website' !~ '^https://' or p_data->>'authorized' is distinct from 'true' then raise exception 'Business name, authorization, and valid HTTPS website required';end if;
if public.current_policy('employer') is null or p_data->>'employer_policy' is distinct from public.current_policy('employer')::text then raise exception 'Review current Employer Responsibilities';end if;
insert into public.company_details(company_id,details) values(auth.uid(),p_data) on conflict(company_id) do update set details=excluded.details,updated_at=now();
update public.profiles set company_name=p_data->>'business_name',approval_status='pending' where id=auth.uid();
insert into public.company_verifications(company_id,decision,reason,reviewer_id) values(auth.uid(),'submitted','Company details submitted for review',auth.uid());
insert into public.notifications(user_id,kind,message) select id,'verification','An employer submitted verification details.' from public.profiles where role='admin' and approval_status='active';
elsif p_action='verify_company' then
if not public.is_admin() or p_data->>'status' not in('active','rejected','pending','suspended') or reason='' then raise exception 'Administrator and decision reason required';end if;
update public.profiles set approval_status=p_data->>'status' where id=p_id and role='company';if not found then raise exception 'Employer not found';end if;
insert into public.company_verifications(company_id,decision,reason,reviewer_id) values(p_id,p_data->>'status',reason,auth.uid());insert into public.notifications(user_id,kind,message) values(p_id,'verification','Employer review: '||(p_data->>'status')||'. '||reason);
elsif p_action='moderate_job' then
if not public.is_admin() or reason='' or p_data->>'status' not in('approved','rejected','corrections','closed','pending') then raise exception 'Administrator and moderation reason required';end if;
select * into j from public.jobs where id=p_id for update;if not found then raise exception 'Vacancy not found';end if;
if p_data->>'status'='approved' and (not exists(select 1 from public.profiles where id=j.company_id and approval_status='active') or j.deadline<=now()) then raise exception 'Employer or vacancy is not eligible';end if;
if p_data->>'status'='approved' and 'overseas'=any(j.audiences) and (coalesce(j.details->>'license','')='' or coalesce(j.details->>'job_order','')='' or p_data->>'overseas_verified' is distinct from 'true') then raise exception 'Confirm overseas license and job-order verification';end if;
update public.jobs set status=p_data->>'status',moderation_reason=reason,published_at=case when p_data->>'status'='approved' then now() else published_at end where id=p_id;
insert into public.notifications(user_id,kind,message,entity_id) values(j.company_id,'vacancy','Vacancy review: '||(p_data->>'status')||'. '||reason,p_id);
elsif p_action='complaint' then
if length(coalesce(p_data->>'subject','')) not between 1 and 180 or length(coalesce(p_data->>'body','')) not between 1 and 4000 then raise exception 'Subject and description required';end if;
if (select count(*) from public.complaints where reporter_id=auth.uid() and created_at>now()-interval '1 hour')>=5 then raise exception 'Please wait before reporting again';end if;
insert into public.complaints(reporter_id,kind,subject,body) values(auth.uid(),left(p_data->>'kind',80),p_data->>'subject',p_data->>'body') returning id into rid;
elsif p_action in('resolve_complaint','resolve_privacy') then
if not public.is_admin() or reason='' then raise exception 'Administrator and resolution required';end if;
if p_action='resolve_complaint' then update public.complaints set status=p_data->>'status',assigned_to=auth.uid(),resolution=reason,updated_at=now() where id=p_id returning reporter_id into dest;
else update public.privacy_requests set status=p_data->>'status',response=reason,updated_at=now() where id=p_id returning user_id into dest;end if;
if dest is null then raise exception 'Request not found';end if;insert into public.notifications(user_id,kind,message,entity_id) values(dest,'decision',reason,p_id);
elsif p_action in('application_status','withdraw','message','schedule_interview','issue_offer') then
select * into a from public.applications where id=p_id for update;if not found then raise exception 'Application not found';end if;
if p_action='withdraw' then
if a.seeker_id<>auth.uid() or a.status in('withdrawn','hired','rejected') then raise exception 'This application cannot be withdrawn';end if;update public.applications set status='withdrawn',decision_reason=reason where id=p_id;
elsif p_action='message' then
if not public.can_read_application(p_id) or length(coalesce(p_data->>'body','')) not between 1 and 4000 then raise exception 'Authorized participant and message required';end if;
insert into public.application_messages(application_id,sender_id,body) values(p_id,auth.uid(),p_data->>'body');select case when a.seeker_id=auth.uid() then company_id else a.seeker_id end into dest from public.jobs where id=a.job_id;
insert into public.notifications(user_id,kind,message,entity_id) values(dest,'message','New recruitment message for '||a.reference,p_id);
else
if not public.can_review_application(p_id) or a.status in('withdrawn','rejected','hired') then raise exception 'Application not eligible';end if;
if p_action='application_status' then
next:=p_data->>'status';
if not ((a.status='submitted' and next in('reviewing','shortlisted','rejected')) or (a.status='reviewing' and next in('shortlisted','rejected')) or (a.status='shortlisted' and next in('reviewing','rejected')) or (a.status='interview' and next in('shortlisted','rejected')) or (a.status='offered' and next in('hired','rejected'))) then raise exception 'Invalid recruitment status transition';end if;
if next='rejected' and reason='' then raise exception 'Rejection reason required';end if;
if next='hired' and not exists(select 1 from public.job_offers where application_id=p_id and status='accepted') then raise exception 'Accepted offer required before hiring';end if;
update public.applications set status=next,decision_reason=reason where id=p_id;
elsif p_action='schedule_interview' then
if a.status not in('reviewing','shortlisted','interview') or nullif(p_data->>'starts_at','') is null or (p_data->>'starts_at')::timestamptz<=now() or coalesce(p_data->>'venue','')='' then raise exception 'Future interview date, venue, and eligible application required';end if;
if p_data->>'type'='online' and p_data->>'venue' !~ '^https://' then raise exception 'HTTPS meeting link required';end if;
insert into public.interviews(application_id,starts_at,interview_type,venue,instructions) values(p_id,(p_data->>'starts_at')::timestamptz,p_data->>'type',p_data->>'venue',coalesce(p_data->>'instructions','')) returning id into rid;
update public.applications set status='interview' where id=p_id;insert into public.notifications(user_id,kind,message,entity_id) values(a.seeker_id,'interview','Interview scheduled for '||a.reference,rid);
elsif p_action='issue_offer' then
if a.status not in('shortlisted','interview') or length(coalesce(p_data->>'terms','')) not between 1 and 8000 or nullif(p_data->>'expires_at','')::timestamptz<=now() then raise exception 'Valid offer terms and expiry required';end if;
insert into public.job_offers(application_id,terms,expires_at) values(p_id,p_data->>'terms',nullif(p_data->>'expires_at','')::timestamptz) returning id into rid;update public.applications set status='offered' where id=p_id;end if;end if;
elsif p_action in('respond_interview','update_interview') then
select * into i from public.interviews where id=p_id for update;select * into a from public.applications where id=i.application_id;if a.id is null then raise exception 'Interview not found';end if;
if p_action='respond_interview' then
if a.seeker_id<>auth.uid() or i.status not in('scheduled','rescheduled') then raise exception 'Applicant response not allowed';end if;insert into public.interview_responses(interview_id,user_id,response,note) values(i.id,auth.uid(),p_data->>'response',reason);
else
if not public.can_review_application(a.id) then raise exception 'Recruiter required';end if;next:=p_data->>'status';
if next='rescheduled' and (nullif(p_data->>'starts_at','') is null or (p_data->>'starts_at')::timestamptz<=now()) then raise exception 'Future interview date required';end if;
if next='completed' and reason='' then raise exception 'Record interview outcome';end if;
update public.interviews set status=next,starts_at=case when next='rescheduled' then (p_data->>'starts_at')::timestamptz else starts_at end,outcome=reason,updated_at=now() where id=i.id;end if;
insert into public.notifications(user_id,kind,message,entity_id) values(a.seeker_id,'interview','Interview updated: '||coalesce(p_data->>'status',p_data->>'response'),i.id);
elsif p_action='respond_offer' then
select * into o from public.job_offers where id=p_id for update;select * into a from public.applications where id=o.application_id;
if a.seeker_id is distinct from auth.uid() or o.status<>'issued' or o.expires_at<=now() or p_data->>'status' not in('accepted','declined') then raise exception 'Offer response not permitted';end if;
update public.job_offers set status=p_data->>'status',updated_at=now() where id=p_id;select company_id into dest from public.jobs where id=a.job_id;insert into public.notifications(user_id,kind,message,entity_id) values(dest,'offer','Offer response: '||(p_data->>'status'),a.id);
else raise exception 'Unknown workflow action';end if;
insert into public.audit_logs(actor_id,action,entity_id,details) values(auth.uid(),p_action,coalesce(p_id,rid),jsonb_build_object('status',p_data->>'status','reason',reason));return jsonb_build_object('id',coalesce(rid,p_id),'ok',true);end$$;
create or replace function public.admin_set_profile_status(p_id uuid,p_status text) returns void language plpgsql security definer set search_path='' as $$begin
perform public.require_workflow_access();if not public.is_admin() or p_id=auth.uid() then raise exception 'Not authorized';end if;
if exists(select 1 from public.profiles where id=p_id and role='company') then raise exception 'Use employer verification and record a reason';end if;
if p_status not in('active','suspended','rejected','pending') then raise exception 'Invalid status';end if;
update public.profiles set approval_status=p_status where id=p_id and role<>'admin';insert into public.audit_logs(actor_id,action,entity_id,details) values(auth.uid(),'account_status',p_id,jsonb_build_object('status',p_status));insert into public.notifications(user_id,kind,message) values(p_id,'account','Account status updated: '||p_status);end$$;
create or replace function public.admin_set_job_status(p_id uuid,p_status text) returns void language plpgsql security definer set search_path='' as $$begin raise exception 'Use vacancy moderation and record a reason';end$$;
create or replace function public.protect_job_update() returns trigger language plpgsql security definer set search_path='' as $$begin
perform public.require_workflow_access();if not public.is_admin() then
if new.company_id<>old.company_id or new.id<>old.id or new.created_at<>old.created_at or new.company_name<>old.company_name then raise exception 'Job ownership cannot change';end if;
if new.status not in('draft','pending','closed') then if new.status=old.status and old.status='approved' then new.status:='pending';else raise exception 'Only administrators publish vacancies';end if;end if;
if new.moderation_reason<>old.moderation_reason or new.published_at is distinct from old.published_at then raise exception 'Moderation fields are protected';end if;end if;new.updated_at:=now();return new;end$$;
drop policy if exists "Active companies post pending jobs" on public.jobs;
create policy "Active companies post pending jobs" on public.jobs for insert to authenticated with check(company_id=auth.uid() and public.is_active_company() and public.has_current_session_ack() and status in('draft','pending') and moderation_reason='' and published_at is null);
revoke all on function public.workflow_action(text,uuid,jsonb),public.admin_set_profile_status(uuid,text),public.admin_set_job_status(uuid,text) from public,anon,authenticated;
grant execute on function public.workflow_action(text,uuid,jsonb),public.admin_set_profile_status(uuid,text),public.admin_set_job_status(uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
