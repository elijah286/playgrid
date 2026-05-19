-- Per-user onboarding state for the activation checklist on /home.
--
-- The five checklist items (build_play, show_vs_defense, save_formation,
-- practice_plan, print_share) are derived at query time from existing DB
-- facts (plays, formations, practice_plans, share_links) — we do NOT
-- stamp per-item completion here, so deleting a play or formation is
-- naturally reflected in the checklist state. The only state we
-- persist is:
--
--   dismissed     : the user clicked "Dismiss" on the home banner.
--                   Banner hides on /home; checklist remains reachable
--                   from the Get Started menu (Chunk F).
--   completed_at  : timestamp the 5th item flipped true. Used by the
--                   confetti / "you're set" toast (Chunk H) to fire
--                   exactly once.
--   last_seen_at  : updated each time we render the banner. Helps us
--                   spot users who never engage with it.
--
-- Default state for a new user = no row in this table. Absence is
-- interpreted as "fresh user, nothing dismissed, never completed."
-- Server actions upsert the row on first dismissal or completion.

create table if not exists public.onboarding_progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  dismissed boolean not null default false,
  completed_at timestamptz,
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.onboarding_progress enable row level security;

drop policy if exists onboarding_progress_select on public.onboarding_progress;
create policy onboarding_progress_select on public.onboarding_progress
  for select using (auth.uid() = user_id);

drop policy if exists onboarding_progress_insert on public.onboarding_progress;
create policy onboarding_progress_insert on public.onboarding_progress
  for insert with check (auth.uid() = user_id);

drop policy if exists onboarding_progress_update on public.onboarding_progress;
create policy onboarding_progress_update on public.onboarding_progress
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists onboarding_progress_delete on public.onboarding_progress;
create policy onboarding_progress_delete on public.onboarding_progress
  for delete using (auth.uid() = user_id);
