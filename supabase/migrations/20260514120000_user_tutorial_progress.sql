-- Per-user progress for in-app guided tutorials.
--
-- One row per (user, tutorial_id). Status moves through:
--   not_started → in_progress → completed
--                              → dismissed   (user closed the tour; never auto-prompt again)
-- `variant` records the sport_variant snapshot at the time the tour was
-- started so that game-type-adaptive copy stays consistent if the user
-- changes teams mid-tour.

create table if not exists public.user_tutorial_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  tutorial_id text not null,
  status text not null default 'not_started' check (status in (
    'not_started',
    'in_progress',
    'completed',
    'dismissed'
  )),
  step_index int not null default 0,
  variant text,
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, tutorial_id)
);

create index if not exists user_tutorial_progress_status_idx
  on public.user_tutorial_progress (user_id, status);

alter table public.user_tutorial_progress enable row level security;

drop policy if exists user_tutorial_progress_select on public.user_tutorial_progress;
create policy user_tutorial_progress_select on public.user_tutorial_progress
  for select using (auth.uid() = user_id);

drop policy if exists user_tutorial_progress_insert on public.user_tutorial_progress;
create policy user_tutorial_progress_insert on public.user_tutorial_progress
  for insert with check (auth.uid() = user_id);

drop policy if exists user_tutorial_progress_update on public.user_tutorial_progress;
create policy user_tutorial_progress_update on public.user_tutorial_progress
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists user_tutorial_progress_delete on public.user_tutorial_progress;
create policy user_tutorial_progress_delete on public.user_tutorial_progress
  for delete using (auth.uid() = user_id);
