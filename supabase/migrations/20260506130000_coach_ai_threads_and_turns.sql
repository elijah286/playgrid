-- Server-side persistence for Coach Cal chat history.
--
-- Why
-- ---
-- Until this migration, every turn lived in the browser's localStorage and
-- the streaming response carried the assistant's reply through the request
-- lifecycle. Closing the chat window mid-stream killed the SSE connection,
-- which propagated to the agent loop, which lost the in-flight reply with
-- nowhere to recover from — even though Cal had been thinking for 30s and
-- was about to return something useful. The coach reopens and sees their
-- own message hanging unanswered.
--
-- This adds the two tables needed to (a) keep Cal running server-side
-- after the connection drops and (b) let the chat client read the result
-- back when the coach returns.
--
-- Threads scope to (user, mode, playbook). That mirrors the existing
-- localStorage key shape (`coach-ai:chat:v1:<mode>:<playbookId|global>`)
-- so existing behavior carries over: each playbook gets its own thread,
-- admin-training mode is a separate global thread.
--
-- Turns are 1:1 with the existing `CoachAiTurn` shape — one row per
-- user/assistant message. Status flips from 'running' → 'done'/'errored'
-- when the detached agent promise completes. Polling the row from the
-- client is what closes the loop on reopen.

create table public.coach_ai_threads (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  mode            text not null check (mode in ('normal', 'admin_training')),
  playbook_id     uuid references public.playbooks(id) on delete cascade,
  last_message_at timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

-- Postgres treats NULL as distinct in unique constraints, so we need
-- two partial indexes to enforce one thread per (user, mode, playbook-or-null).
create unique index coach_ai_threads_user_mode_playbook_unique
  on public.coach_ai_threads (user_id, mode, playbook_id)
  where playbook_id is not null;

create unique index coach_ai_threads_user_mode_global_unique
  on public.coach_ai_threads (user_id, mode)
  where playbook_id is null;

create index coach_ai_threads_user_idx
  on public.coach_ai_threads (user_id, last_message_at desc);

alter table public.coach_ai_threads enable row level security;

-- Reads only — writes go through the service role from the API route, so
-- only a SELECT policy is needed for the user.
create policy coach_ai_threads_select_own
  on public.coach_ai_threads for select
  using (auth.uid() = user_id);

create table public.coach_ai_turns (
  id                  uuid primary key default gen_random_uuid(),
  thread_id           uuid not null references public.coach_ai_threads(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade, -- denormalized for RLS
  role                text not null check (role in ('user', 'assistant')),
  status              text not null default 'done' check (status in ('running', 'done', 'errored')),
  text                text not null default '',
  tool_calls          jsonb,
  playbook_chips      jsonb,
  note_proposals      jsonb,
  note_proposal_state jsonb,
  mutated             boolean not null default false,
  -- Anchored play at the time the turn was sent. Only used for client-side
  -- context (e.g. rendering "this turn referenced Play X"); not load-bearing.
  play_id             uuid references public.plays(id) on delete set null,
  error               text,
  created_at          timestamptz not null default now(),
  ended_at            timestamptz
);

create index coach_ai_turns_thread_created_idx
  on public.coach_ai_turns (thread_id, created_at);

create index coach_ai_turns_user_idx
  on public.coach_ai_turns (user_id);

-- Find the running assistant turn(s) for a thread quickly — the polling
-- path on reopen reads this. Partial index keeps it small.
create index coach_ai_turns_running_idx
  on public.coach_ai_turns (thread_id, created_at desc)
  where status = 'running';

alter table public.coach_ai_turns enable row level security;

create policy coach_ai_turns_select_own
  on public.coach_ai_turns for select
  using (auth.uid() = user_id);

comment on table public.coach_ai_threads is
  'One Coach Cal chat thread per (user, mode, playbook). Source of truth for chat history; localStorage is now a transient cache.';
comment on table public.coach_ai_turns is
  'Individual user/assistant turns within a Coach Cal thread. Assistant turns flip from running → done/errored when the detached agent promise completes.';
