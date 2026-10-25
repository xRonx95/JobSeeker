-- Apply after migration 005. Personal records remain owner-only in direct queries.
begin;
create or replace function public.get_application_seeker_information(p_application_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare applicant uuid; result jsonb;
begin
  select a.seeker_id into applicant
  from public.applications a join public.jobs j on j.id=a.job_id
  where a.id=p_application_id and (
    public.is_admin() or (public.is_active_company() and j.company_id=auth.uid())
  );
  if applicant is null then
    raise exception 'You do not have permission to view this applicant' using errcode='42501';
  end if;
  select jsonb_build_object(
    'full_name',p.full_name,'email',p.email,'phone',p.phone,'location',p.location,'bio',p.bio,
    'personal',coalesce(i.personal,'{}'::jsonb),'education',coalesce(i.education,'{}'::jsonb),
    'family',coalesce(i.family,'{}'::jsonb),'background',coalesce(i.background,'{}'::jsonb),
    'updated_at',i.updated_at
  ) into result from public.profiles p
  left join public.seeker_information i on i.user_id=p.id where p.id=applicant;
  return result;
end $$;
revoke all on function public.get_application_seeker_information(uuid) from public,anon;
grant execute on function public.get_application_seeker_information(uuid) to authenticated;
commit;
