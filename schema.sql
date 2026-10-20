-- Isabela Careers / Supabase Postgres. Run once in SQL Editor.
create extension if not exists pgcrypto;
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null default '', email text not null default '',
 role text not null default 'seeker' check(role in ('seeker','company','admin')),
 company_name text, phone text, bio text, location text default 'Isabela City, Basilan',
 approval_status text not null default 'active' check(approval_status in ('active','pending','rejected','suspended')),
 created_at timestamptz not null default now()
);
create table public.jobs (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.profiles(id) on delete cascade,
 title text not null, company_name text not null default '', category text not null, location text not null default 'Isabela City, Basilan',
 employment_type text not null check (employment_type in ('Full-time','Part-time','Contract','Internship','Remote')),
 salary text, description text not null, qualifications text not null, requirements text[] not null default '{}',
 status text not null default 'pending' check(status in ('pending','approved','rejected','closed')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.applications (
 id uuid primary key default gen_random_uuid(), job_id uuid not null references public.jobs(id) on delete cascade,
 seeker_id uuid not null references public.profiles(id) on delete cascade,
 cover_letter text not null default '', document_paths text[] not null default '{}',
 status text not null default 'submitted' check (status in ('submitted','reviewing','shortlisted','rejected','hired')),
 created_at timestamptz not null default now(), unique(job_id,seeker_id)
);
create index jobs_status_idx on public.jobs(status,created_at desc);
create index jobs_company_idx on public.jobs(company_id);
create index apps_job_idx on public.applications(job_id);
create index apps_seeker_idx on public.applications(seeker_id);

-- Trigger inserts safe profile defaults: company accounts require admin approval.
create or replace function public.create_profile_for_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare chosen_role text;
begin
 chosen_role := case when new.raw_user_meta_data->>'requested_role' = 'company' then 'company' else 'seeker' end;
 insert into public.profiles(id,full_name,email,role,company_name,approval_status)
 values (new.id,coalesce(new.raw_user_meta_data->>'full_name',''),coalesce(new.email,''),chosen_role,
 nullif(new.raw_user_meta_data->>'company_name',''),case when chosen_role='company' then 'pending' else 'active' end);
 return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.create_profile_for_new_user();

-- Helpers execute under an isolated search_path and only inspect auth.uid().
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
 select exists (select 1 from public.profiles where id=(select auth.uid()) and role='admin' and approval_status='active');
$$;
create or replace function public.is_active_company() returns boolean language sql stable security definer set search_path = '' as $$
 select exists (select 1 from public.profiles where id=(select auth.uid()) and role='company' and approval_status='active');
$$;
create or replace function public.is_active_seeker() returns boolean language sql stable security definer set search_path = '' as $$
 select exists (select 1 from public.profiles where id=(select auth.uid()) and role='seeker' and approval_status='active');
$$;
create or replace function public.owns_job(p_job_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.jobs where id=p_job_id and company_id=(select auth.uid()));
$$;

-- Employers may view contact details ONLY for applicants to their own jobs.
create or replace function public.is_my_applicant(p_profile_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.applications a join public.jobs j on j.id=a.job_id
 where a.seeker_id=p_profile_id and j.company_id=(select auth.uid()) and public.is_active_company());
$$;
alter table public.profiles enable row level security;
alter table public.jobs enable row level security;
alter table public.applications enable row level security;
create policy "Profiles visible to owner or admin" on public.profiles for select to authenticated
 using (id=(select auth.uid()) or (select public.is_admin()) or public.is_my_applicant(id));
-- Only a SECURITY DEFINER function can edit profile fields; no direct update grant.
create or replace function public.update_my_profile(p_name text,p_phone text,p_bio text,p_location text,p_company_name text)
returns void language plpgsql security definer set search_path = '' as $$
begin
 update public.profiles set full_name=left(trim(p_name),120),phone=left(p_phone,50),bio=left(p_bio,2000),
 location=left(p_location,120),company_name=case when role='company' then left(p_company_name,180) else company_name end
 where id=(select auth.uid()) and approval_status not in ('suspended','rejected');
end $$;

create policy "Public read approved jobs" on public.jobs for select to anon,authenticated
 using (status='approved' or (select public.is_admin()) or (company_id=(select auth.uid())));
create policy "Active companies post pending jobs" on public.jobs for insert to authenticated
 with check (company_id=(select auth.uid()) and (select public.is_active_company()) and status='pending');
-- Copy display-only company name to each public job so profile email and phone stay private.
create or replace function public.fill_job_company_name() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 select coalesce(company_name,full_name,'Employer') into new.company_name from public.profiles where id=new.company_id;
 return new;
end $$;
create trigger fill_job_company_name_before_insert before insert on public.jobs for each row execute function public.fill_job_company_name();
-- Companies cannot change approval status through unrestricted update: enforce trigger.
create or replace function public.protect_job_update() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if not public.is_admin() then
   if old.company_id<>new.company_id or new.company_name<>old.company_name or new.status not in ('pending','closed') then
     raise exception 'Cannot assign job ownership or approve a job';
   end if;
   -- Edited approved listings return to moderation.
   if old.status='approved' and new.status='approved' then new.status := 'pending'; end if;
 end if;
 new.updated_at := now(); return new;
end $$;
create trigger protect_job_before_update before update on public.jobs for each row execute function public.protect_job_update();
create policy "Owners edit own jobs" on public.jobs for update to authenticated
 using ((company_id=(select auth.uid()) and (select public.is_active_company())) or (select public.is_admin()))
 with check ((company_id=(select auth.uid()) and (select public.is_active_company())) or (select public.is_admin()));

create policy "Seeker and company and admin read applications" on public.applications for select to authenticated
 using (seeker_id=(select auth.uid()) or ((select public.is_active_company()) and (select public.owns_job(job_id))) or (select public.is_admin()));
create policy "Seeker submits approved job" on public.applications for insert to authenticated
 with check(seeker_id=(select auth.uid()) and (select public.is_active_seeker()) and
 exists(select 1 from public.jobs where id=job_id and status='approved'));
-- Only the status may be changed by employer/admin, protected by trigger.
create or replace function public.protect_application_update() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if old.id<>new.id or old.job_id<>new.job_id or old.seeker_id<>new.seeker_id or
 old.cover_letter is distinct from new.cover_letter or old.document_paths is distinct from new.document_paths then
 raise exception 'Only application status can be changed'; end if;
 return new;
end $$;
create trigger protect_app_before_update before update on public.applications for each row execute function public.protect_application_update();
create policy "Companies manage their applicants" on public.applications for update to authenticated
 using (((select public.is_active_company()) and (select public.owns_job(job_id))) or (select public.is_admin()))
 with check (((select public.is_active_company()) and (select public.owns_job(job_id))) or (select public.is_admin()));

-- Admin-only controlled changes; do not grant direct profile update permissions.
create or replace function public.admin_set_profile_status(p_id uuid,p_status text) returns void
language plpgsql security definer set search_path = '' as $$
begin
 if not public.is_admin() then raise exception 'Not authorized'; end if;
 if p_status not in ('active','pending','rejected','suspended') then raise exception 'Invalid status'; end if;
 if p_id=(select auth.uid()) then raise exception 'Cannot suspend own admin account'; end if;
 update public.profiles set approval_status=p_status where id=p_id and role<>'admin';
end $$;
create or replace function public.admin_set_job_status(p_id uuid,p_status text) returns void
language plpgsql security definer set search_path = '' as $$
begin
 if not public.is_admin() then raise exception 'Not authorized'; end if;
 if p_status not in ('approved','rejected','closed','pending') then raise exception 'Invalid status'; end if;
 update public.jobs set status=p_status where id=p_id;
end $$;

-- Private storage bucket; files only accessible to applicant, relevant employer, and admin.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('application-documents','application-documents',false,5242880,
array['application/pdf','image/jpeg','image/png','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict(id) do update set public=false,file_size_limit=5242880,allowed_mime_types=excluded.allowed_mime_types;
-- Path: user-uuid/application-uuid/filename
create policy "Applicant uploads own documents" on storage.objects for insert to authenticated
 with check (bucket_id='application-documents' and (storage.foldername(name))[1]=(select auth.uid())::text
 and exists(select 1 from public.applications a where a.id::text=(storage.foldername(name))[2]
 and a.seeker_id=(select auth.uid())));
create policy "Authorized users read documents" on storage.objects for select to authenticated
 using (bucket_id='application-documents' and (
 (storage.foldername(name))[1]=(select auth.uid())::text or (select public.is_admin()) or
 exists(select 1 from public.applications a join public.jobs j on j.id=a.job_id
 where a.id::text=(storage.foldername(name))[2] and j.company_id=(select auth.uid()) and (select public.is_active_company()))));

revoke all on public.profiles,public.jobs,public.applications from anon,authenticated;
grant select on public.profiles to authenticated;
grant select on public.jobs to anon,authenticated;
grant insert,update on public.jobs to authenticated;
grant select,insert,update on public.applications to authenticated;
grant execute on function public.is_admin(),public.is_active_company(),public.is_active_seeker(),public.owns_job(uuid),
public.is_my_applicant(uuid), public.update_my_profile(text,text,text,text,text), public.admin_set_profile_status(uuid,text),public.admin_set_job_status(uuid,text) to authenticated;

-- AFTER creating your OWN account via the app, run this ONCE (replace email):
-- update public.profiles set role='admin', approval_status='active' where email='YOUR_EMAIL@example.com';
-- IMPORTANT: Only run this in Supabase SQL Editor as project owner. NEVER expose service_role secret in frontend.
-- Securely append paths after uploads. Uploads must already exist in private bucket.
create or replace function public.attach_application_document(p_application uuid,p_path text)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if not exists (select 1 from public.applications where id=p_application and seeker_id=(select auth.uid())) then
 raise exception 'Application not owned'; end if;
 if left(p_path,length((select auth.uid())::text || '/' || p_application::text || '/'))
    <> (select auth.uid())::text || '/' || p_application::text || '/' then
 raise exception 'Invalid document path'; end if;
 if not exists(select 1 from storage.objects where bucket_id='application-documents' and name=p_path) then
 raise exception 'Document not found'; end if;
 update public.applications set document_paths=array_append(document_paths,p_path)
 where id=p_application and not p_path=any(document_paths);
end $$;
grant execute on function public.attach_application_document(uuid,text) to authenticated;
