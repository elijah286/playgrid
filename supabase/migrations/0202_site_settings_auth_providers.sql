-- Site-admin toggles for OAuth sign-in providers. Off by default so a
-- misconfigured provider (missing keys, expired Apple secret, etc.) never
-- surfaces a "Continue with X" button that 400s. Google starts on because
-- it's configured in Supabase and most users prefer it; Apple stays off
-- until the Apple Developer Services ID + secret are wired up.

alter table public.site_settings
  add column if not exists apple_signin_enabled boolean not null default false,
  add column if not exists google_signin_enabled boolean not null default false;

insert into public.site_settings (id, google_signin_enabled, apple_signin_enabled)
values ('default', true, false)
on conflict (id) do update
set google_signin_enabled = true,
    apple_signin_enabled = false;
