-- Free Coach Cal prompt allowance: let non-subscribed (free) users actually
-- TRY Cal for a small, fixed number of successful turns before the paywall,
-- instead of only ever seeing an "Upgrade to Team Coach" ad. The wedge only
-- converts if people can feel it once.
--
-- Two pieces:
--   1. site_settings.coach_cal_free_prompt_allowance — admin-tunable count of
--      free lifetime Cal prompts a free user gets. Default 5.
--   2. profiles.coach_cal_free_prompts_used — per-user lifetime counter of
--      successful free Cal turns. Only incremented when a turn COMPLETES
--      successfully (errors/failed turns never count — parallels how
--      increment_coach_ai_usage is called only in the stream route's success
--      branch).
--
-- A free user may chat with Cal while used < allowance; the stream route's
-- cost caps ($1/5h, $2.50/24h, $5/mo) still bound spend, so the allowance is a
-- funnel lever, not the abuse guard.

alter table public.site_settings
  add column if not exists coach_cal_free_prompt_allowance integer not null default 5
  check (coach_cal_free_prompt_allowance between 0 and 1000);

update public.site_settings
  set coach_cal_free_prompt_allowance = 5
  where id = 'default' and coach_cal_free_prompt_allowance is null;

alter table public.profiles
  add column if not exists coach_cal_free_prompts_used integer not null default 0;

-- Atomic increment called from the stream route after a successful free turn.
-- Returns the new count so the caller can log/telemeter without a re-read.
create or replace function public.increment_coach_cal_free_prompts(
  p_user_id uuid
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
begin
  update public.profiles
    set coach_cal_free_prompts_used = coach_cal_free_prompts_used + 1
    where id = p_user_id
    returning coach_cal_free_prompts_used into new_count;
  return coalesce(new_count, 0);
end;
$$;
