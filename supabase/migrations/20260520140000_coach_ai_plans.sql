-- Coach Cal Plans: a multi-step checklist Cal proposes for complex
-- requests (install 6 plays, edit a batch of plays, add defense to N
-- plays). Each step is executed in its own chat turn so the work
-- doesn't blow the SSE timeout / tool-turn budget, the coach sees
-- progress between turns, and a failure is "retry step N" instead of
-- "save those" (the existing batch-retry mechanism).
--
-- Surfaced 2026-05-20: a coach's 6-play install saved 1 of 6 because
-- Cal crammed everything into one mega-turn, hand-authored 5 fences
-- after the first compose_play, and 5 plays failed save-time
-- validation. Phase 1 (already shipped) capped catalog-concept fences
-- at 3 per reply and added a markdown checklist convention. Phase 2
-- (this migration) gives the checklist persistent state so Cal can
-- resume a specific step after errors and the UI can render the plan
-- with status icons.

create table public.coach_ai_plans (
  id uuid primary key default gen_random_uuid(),
  -- Thread the plan belongs to. Plans don't outlive their thread; if
  -- the user deletes the thread, the plan goes with it.
  thread_id uuid not null references public.coach_ai_threads(id) on delete cascade,
  -- Owner of the plan — matches the thread's user_id. Duplicated here
  -- so RLS can scope without a join.
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Coach-facing title (e.g. "Install 6 plays from drawing").
  title text not null check (length(title) between 1 and 200),
  -- Lifecycle state. 'active' means Cal is working through the steps;
  -- 'completed' means every step finished (or was skipped); 'cancelled'
  -- means the coach told Cal to stop.
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  -- Array of step objects. Each step is shaped like:
  --   {
  --     "title": "Compose Mesh play",
  --     "description": "compose_play(concept: Mesh)",
  --     "status": "pending" | "in_progress" | "completed" | "failed" | "skipped",
  --     "result": "play://uuid" | "<error message>" | null,
  --     "completed_at": "2026-05-20T..." | null
  --   }
  -- Stored as JSONB so we can update individual steps via jsonb_set
  -- without rewriting the whole array.
  steps jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One active plan per thread. Cal can't propose a second plan while
-- one is still in flight — the coach would lose track. To start a
-- new plan, the current one must be marked completed or cancelled.
create unique index if not exists coach_ai_plans_one_active_per_thread
  on public.coach_ai_plans (thread_id)
  where status = 'active';

create index if not exists coach_ai_plans_thread_idx
  on public.coach_ai_plans (thread_id, created_at desc);

-- updated_at maintained via trigger so we don't have to remember to
-- set it on every UPDATE in application code.
create or replace function public.coach_ai_plans_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger coach_ai_plans_updated_at_trg
  before update on public.coach_ai_plans
  for each row
  execute function public.coach_ai_plans_set_updated_at();

-- RLS: a coach can read/update their own plans only. Matches the
-- pattern for coach_ai_threads / coach_ai_turns — auth.uid() must
-- equal the row's user_id.
alter table public.coach_ai_plans enable row level security;

create policy "coach_ai_plans_owner_select"
  on public.coach_ai_plans for select
  using (auth.uid() = user_id);

create policy "coach_ai_plans_owner_insert"
  on public.coach_ai_plans for insert
  with check (auth.uid() = user_id);

create policy "coach_ai_plans_owner_update"
  on public.coach_ai_plans for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "coach_ai_plans_owner_delete"
  on public.coach_ai_plans for delete
  using (auth.uid() = user_id);

-- Service-role bypass policy isn't needed here — the server uses the
-- service-role client which bypasses RLS by default. RLS protects the
-- direct-client browser path.
