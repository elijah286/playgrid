-- Lookup helper for direct-share by email: returns the auth user id for
-- an email, or null if the address isn't registered. Paired with
-- email_exists/email_has_password from 0046/0047.

create or replace function public.email_to_user_id(p_email text)
returns uuid
language sql
security definer
set search_path = public, auth
as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;

revoke all on function public.email_to_user_id(text) from public, anon, authenticated;
grant execute on function public.email_to_user_id(text) to service_role;
