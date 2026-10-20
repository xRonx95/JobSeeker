-- Run as project owner after schema.sql. Safe to rerun. Existing users are unchanged.
-- Also disable "Allow new users to sign up" in Supabase Authentication settings.
begin;
create or replace function public.require_admin_created_account() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- app_metadata is controlled by the Auth admin API, never public signup data.
  if new.raw_app_meta_data->>'portal_created_by_admin' is distinct from 'true' then
    raise exception 'Account creation is managed by an administrator';
  end if;
  return new;
end $$;
drop trigger if exists require_admin_created_account on auth.users;
create trigger require_admin_created_account before insert on auth.users
for each row execute function public.require_admin_created_account();

create or replace function public.create_profile_for_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare chosen_role text;
begin
  chosen_role := new.raw_app_meta_data->>'portal_role';
  if new.raw_app_meta_data->>'portal_created_by_admin' is distinct from 'true'
     or chosen_role is null or chosen_role not in ('seeker','company','admin') then
    raise exception 'A valid administrator-assigned role is required';
  end if;
  insert into public.profiles(id,full_name,email,role,company_name,approval_status)
  values(new.id,left(coalesce(new.raw_user_meta_data->>'full_name',''),120),coalesce(new.email,''),chosen_role,
    case when chosen_role='company' then left(nullif(new.raw_user_meta_data->>'company_name',''),180) else null end,'active');
  return new;
end $$;
commit;
