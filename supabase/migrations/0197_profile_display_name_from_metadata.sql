-- Fix the new-user → profile pipeline so a coach who signs up via an
-- invite link shows up in rosters by name instead of email.
--
-- Two issues today:
--
-- 1. AuthFlow stores the user's name in auth.users.raw_user_meta_data
--    as `display_name`. The handle_new_user() trigger only reads
--    `full_name` (or falls back to email). Result: profiles.display_name
--    is the email, not the name they typed.
--
-- 2. The trigger fires on INSERT, but AuthFlow.completeNewUserProfile
--    sets the metadata via auth.updateUser() AFTER signup. Even if the
--    trigger reads the right key, the metadata isn't there yet.
--
-- Fixes here:
--   - Update handle_new_user() to prefer display_name → full_name → email.
--     Catches signups where metadata is provided at the auth.signUp call.
--   - One-shot backfill of existing rows where profiles.display_name
--     looks like an email (i.e. matches the user's auth email) but the
--     metadata holds a real name from a later updateUser call.
--
-- The AuthFlow client patch handles the live path (write to profiles
-- directly after auth.updateUser). This migration covers the trigger
-- path and existing affected rows.

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
      nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
      new.email
    )
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- Backfill: any profile whose display_name is null OR equals the user's
-- auth email gets overwritten with the metadata display_name when one
-- exists. This rescues every coach who already signed up under the bug.
update public.profiles p
set display_name = nullif(trim(u.raw_user_meta_data->>'display_name'), '')
from auth.users u
where p.id = u.id
  and nullif(trim(u.raw_user_meta_data->>'display_name'), '') is not null
  and (
    p.display_name is null
    or lower(p.display_name) = lower(u.email)
  );
