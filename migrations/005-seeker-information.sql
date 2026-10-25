-- Run after schema.sql and migration 004. Safe to rerun on an existing database.
begin;
create table if not exists public.seeker_information (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  personal jsonb not null default '{}'::jsonb,
  education jsonb not null default '{}'::jsonb,
  family jsonb not null default '{}'::jsonb,
  background jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint seeker_information_objects check (
    jsonb_typeof(personal)='object' and jsonb_typeof(education)='object'
    and jsonb_typeof(family)='object' and jsonb_typeof(background)='object'),
  constraint seeker_information_size check (
    octet_length(personal::text)+octet_length(education::text)+octet_length(family::text)+octet_length(background::text)<=16000)
);
alter table public.seeker_information enable row level security;
revoke all on public.seeker_information from anon, authenticated;
grant select on public.seeker_information to authenticated;
drop policy if exists "Seekers read their own private information" on public.seeker_information;
create policy "Seekers read their own private information" on public.seeker_information for select to authenticated
using (user_id=(select auth.uid()) and (select public.is_active_seeker()));

create or replace function public.save_my_seeker_information(
  p_name text, p_phone text, p_location text, p_bio text,
  p_personal jsonb, p_education jsonb, p_family jsonb, p_background jsonb
) returns void language plpgsql security definer set search_path='' as $$
declare
  caller uuid := auth.uid(); item jsonb; key_name text; item_value jsonb;
begin
  if caller is null or not public.is_active_seeker() then
    raise exception 'Only active job seekers can save personal information' using errcode='42501';
  end if;
  if p_name is null or length(trim(p_name))=0 or length(p_name)>120
    or length(coalesce(p_phone,''))>50 or length(coalesce(p_location,''))>120 or length(coalesce(p_bio,''))>2000 then
    raise exception 'Enter valid personal and contact details' using errcode='22023';
  end if;
  foreach item in array array[p_personal,p_education,p_family,p_background] loop
    if item is null or jsonb_typeof(item)<>'object' or octet_length(item::text)>8000 then
      raise exception 'Invalid personal information section' using errcode='22023';
    end if;
    for key_name,item_value in select * from jsonb_each(item) loop
      if jsonb_typeof(item_value)<>'string' or length(item_value#>>'{}')>2000 then
        raise exception 'Information fields must be text of at most 2000 characters' using errcode='22023';
      end if;
    end loop;
  end loop;
  if p_personal - array['birth_date','nationality','civil_status'] <> '{}'::jsonb
    or p_education - array['attainment','school','course','graduation_year','certifications'] <> '{}'::jsonb
    or p_family - array['guardian_name','partner_name','dependants','emergency_name','emergency_relationship','emergency_phone'] <> '{}'::jsonb
    or p_background - array['recent_position','recent_employer','experience_years','availability','skills','languages','experience_summary'] <> '{}'::jsonb then
    raise exception 'Unsupported personal information field' using errcode='22023';
  end if;
  if nullif(p_personal->>'birth_date','')::date>current_date then
    raise exception 'Date of birth cannot be in the future' using errcode='22023';
  end if;
  if nullif(p_education->>'graduation_year','')::integer not between 1900 and 2100
    or nullif(p_family->>'dependants','')::integer not between 0 and 99
    or nullif(p_background->>'experience_years','')::numeric not between 0 and 80 then
    raise exception 'Check the graduation year, dependants, and years of experience' using errcode='22023';
  end if;
  update public.profiles set full_name=trim(p_name),phone=p_phone,location=p_location,bio=p_bio where id=caller;
  insert into public.seeker_information(user_id,personal,education,family,background,updated_at)
  values(caller,p_personal,p_education,p_family,p_background,now())
  on conflict(user_id) do update set personal=excluded.personal,education=excluded.education,
    family=excluded.family,background=excluded.background,updated_at=excluded.updated_at;
end $$;
revoke all on function public.save_my_seeker_information(text,text,text,text,jsonb,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.save_my_seeker_information(text,text,text,text,jsonb,jsonb,jsonb,jsonb) to authenticated;
commit;
