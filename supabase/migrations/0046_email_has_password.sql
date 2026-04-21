-- Lookup helper for the unified auth flow: lets the server decide
-- whether to route an existing email to the password step or straight
-- to an OTP code. OTP-only accounts (never set a password) should skip
-- the password prompt entirely.

create or replace function public.email_has_password(p_email text)
returns boolean
language sql
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from auth.users
    where lower(email) = lower(p_email)
      and encrypted_password is not null
      and length(encrypted_password) > 0
  );
$$;

revoke all on function public.email_has_password(text) from public, anon, authenticated;
grant execute on function public.email_has_password(text) to service_role;
