-- Companion to email_has_password: existence-only lookup used by the
-- unified auth flow to decide between password prompt and signup OTP.
-- The GoTrue admin `filter=email = "..."` endpoint is unreliable across
-- versions, so we go direct to auth.users.

create or replace function public.email_exists(p_email text)
returns boolean
language sql
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from auth.users where lower(email) = lower(p_email)
  );
$$;

revoke all on function public.email_exists(text) from public, anon, authenticated;
grant execute on function public.email_exists(text) to service_role;
