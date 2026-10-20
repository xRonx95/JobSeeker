-- Latest signup policy: public seeker/company signup, admin roles remain privileged.
-- Run after schema.sql and any previous migrations. Safe to rerun.
-- Enable "Allow new users to sign up" in Supabase Authentication settings.
begin;
drop trigger if exists require_admin_created_account on auth.users;
create or replace function public.create_profile_for_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare chosen_role text; admin_created boolean;
begin
  admin_created := coalesce(new.raw_app_meta_data->>'portal_created_by_admin'='true',false);
  if admin_created then
    chosen_role := new.raw_app_meta_data->>'portal_role';
    if chosen_role is null or chosen_role not in ('seeker','company','admin') then
      raise exception 'Invalid administrator-assigned role';
    end if;
  else
    chosen_role := coalesce(new.raw_user_meta_data->>'requested_role','seeker');
    if chosen_role not in ('seeker','company') then
      raise exception 'Public signup is limited to job seekers and companies';
    end if;
  end if;
  insert into public.profiles(id,full_name,email,role,company_name,phone,approval_status)
  values(new.id,left(trim(coalesce(new.raw_user_meta_data->>'full_name','')),120),coalesce(new.email,''),chosen_role,
    case when chosen_role='company' then left(nullif(new.raw_user_meta_data->>'company_name',''),180) else null end,
    left(coalesce(new.raw_user_meta_data->>'phone',''),50),
    case when chosen_role='company' and not admin_created then 'pending' else 'active' end);
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.create_profile_for_new_user();
commit;
