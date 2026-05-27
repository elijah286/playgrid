-- Grandfather existing users to the free-play cap that was in effect when
-- their account was created.
--
-- Today the cap is a single global on site_settings.free_max_plays_per_playbook
-- and every free user reads it live. Lowering it would shrink every free
-- account's allowance retroactively. We want lowering the global to affect
-- only future signups; raising it should still benefit everyone.
--
-- Strategy:
--   - Add profiles.free_play_cap (nullable int). Null = "use global".
--   - Backfill every existing profile with the current global value so
--     they are locked in at the cap they had when this migration runs.
--   - handle_new_user() reads the current global at signup time and stamps
--     the new profile.
--   - App code computes effective cap = max(profile.free_play_cap, global)
--     so raises still flow through, but lowers don't.

alter table public.profiles
  add column if not exists free_play_cap integer;

-- Backfill: lock every existing user in at today's global cap. We read
-- site_settings live; fall back to 16 (the documented default) if the
-- row is missing for any reason.
update public.profiles p
set free_play_cap = coalesce(
  (select free_max_plays_per_playbook from public.site_settings where id = 'default'),
  16
)
where p.free_play_cap is null;

-- Update the signup trigger to stamp the cap at account-creation time.
-- Preserves the display_name logic from 0197.
create or replace function public.handle_new_user()
returns trigger as $$
declare
  v_cap integer;
begin
  select free_max_plays_per_playbook into v_cap
    from public.site_settings where id = 'default';

  insert into public.profiles (id, display_name, free_play_cap)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
      nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
      new.email
    ),
    coalesce(v_cap, 16)
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;
