-- Upgrade an existing Isabela Careers database after schema.sql.
-- Run this complete file in Supabase SQL Editor. Safe to rerun.
begin;

alter table public.jobs add column if not exists audiences text[] not null default '{}';
do $$ begin
  if not exists (select 1 from pg_constraint where conname='jobs_audiences_allowed' and conrelid='public.jobs'::regclass) then
    alter table public.jobs add constraint jobs_audiences_allowed check (audiences <@ array['pwd','overseas','high-school','government']::text[]);
  end if;
end $$;

create table if not exists public.saved_jobs (
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id,job_id)
);
alter table public.saved_jobs enable row level security;
drop policy if exists "Users read own saved jobs" on public.saved_jobs;
create policy "Users read own saved jobs" on public.saved_jobs for select to authenticated using(user_id=(select auth.uid()));
drop policy if exists "Users save approved jobs" on public.saved_jobs;
create policy "Users save approved jobs" on public.saved_jobs for insert to authenticated
  with check(user_id=(select auth.uid()) and exists(select 1 from public.jobs where id=job_id and status='approved'));
drop policy if exists "Users remove own saved jobs" on public.saved_jobs;
create policy "Users remove own saved jobs" on public.saved_jobs for delete to authenticated using(user_id=(select auth.uid()));
revoke all on public.saved_jobs from anon,authenticated;
grant select,insert,delete on public.saved_jobs to authenticated;

create table if not exists public.career_resources (
  id uuid primary key default gen_random_uuid(),
  kind text not null check(kind in ('fair','training','advice')),
  title text not null check(length(trim(title)) between 1 and 180),
  description text not null default '' check(length(description)<=500),
  body text not null default '' check(length(body)<=16000),
  location text not null default '' check(length(location)<=200),
  starts_at timestamptz,
  registration_url text check(registration_url is null or registration_url ~ '^https://'),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  check(kind='advice' or starts_at is not null)
);
create index if not exists career_resources_kind_date_idx on public.career_resources(kind,published,starts_at);
alter table public.career_resources enable row level security;
drop policy if exists "Public reads published career resources" on public.career_resources;
create policy "Public reads published career resources" on public.career_resources for select to anon,authenticated using(published or (select public.is_admin()));
drop policy if exists "Admins manage career resources" on public.career_resources;
create policy "Admins manage career resources" on public.career_resources for all to authenticated using((select public.is_admin())) with check((select public.is_admin()));
revoke all on public.career_resources from anon,authenticated;
grant select on public.career_resources to anon,authenticated;
grant insert,update,delete on public.career_resources to authenticated;

-- Return business display fields only, without exposing profile emails or phone numbers.
create or replace function public.list_approved_employers()
returns table(id uuid,company_name text,location text,bio text,open_jobs bigint)
language sql stable security definer set search_path = '' as $$
 select p.id, coalesce(nullif(p.company_name,''),'Employer'), p.location, p.bio,
   (select count(*) from public.jobs j where j.company_id=p.id and j.status='approved')
 from public.profiles p where p.role='company' and p.approval_status='active'
 order by lower(coalesce(p.company_name,'')),p.id;
$$;
revoke all on function public.list_approved_employers() from public;
grant execute on function public.list_approved_employers() to anon,authenticated;

-- The existing attachment RPC appends document_paths, which the old trigger
-- rejected. Allow verified, append-only attachment changes for the applicant.
create or replace function public.protect_application_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 if old.id is distinct from new.id or old.job_id is distinct from new.job_id
 or old.seeker_id is distinct from new.seeker_id or old.created_at is distinct from new.created_at
 or old.cover_letter is distinct from new.cover_letter then
   raise exception 'Application identity and submission details cannot be changed';
 end if;
 if old.document_paths is distinct from new.document_paths then
   if new.seeker_id is distinct from (select auth.uid()) or old.status is distinct from new.status
      or not old.document_paths <@ new.document_paths then
     raise exception 'Only the applicant can append verified documents';
   end if;
   if exists(select 1 from unnest(new.document_paths) as paths(path)
      where left(path,length(new.seeker_id::text || '/' || new.id::text || '/'))
            <> new.seeker_id::text || '/' || new.id::text || '/'
      or not exists(select 1 from storage.objects o where o.bucket_id='application-documents' and o.name=paths.path)) then
     raise exception 'Invalid application document';
   end if;
 end if;
 return new;
end $$;

notify pgrst, 'reload schema';
commit;
