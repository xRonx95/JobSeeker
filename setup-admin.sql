-- Run in the project owner's Supabase SQL Editor after creating this Auth user.
-- This does not change any password or disable email confirmation.
begin;
do $$
declare account_id uuid;
begin
  select id into account_id from auth.users
  where lower(email) = lower('ronniemayang@gmail.com');
  if account_id is null then
    raise exception 'Create the Auth account for ronniemayang@gmail.com first';
  end if;
  insert into public.profiles(id, full_name, email, role, approval_status)
  values(account_id, 'Ronnie Mayang', 'ronniemayang@gmail.com', 'admin', 'active')
  on conflict(id) do update set role='admin', approval_status='active';
end $$;
commit;
select id, email, role, approval_status from public.profiles
where lower(email) = lower('ronniemayang@gmail.com');
