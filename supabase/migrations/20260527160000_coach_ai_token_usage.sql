-- Per-turn token + cost log for Coach Cal.
--
-- Separate from the existing `coach_ai_usage` table (which holds monthly
-- message counts for the soft-limit meter). This table is the source of
-- truth for *what Cal actually costs us* — one row per SDK call, with
-- token counts split out and a precomputed cost in micro-USD (millionths
-- of a dollar) so monthly aggregates don't accumulate float error.
--
-- Reads: Site Admin → "Cal usage" tab aggregates by user_id over the
-- current calendar month. Users do NOT see this data; the existing
-- message-count meter is sufficient for the in-product UX.

create table public.coach_ai_token_usage (
  id            bigserial primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  occurred_at   timestamptz not null default now(),
  model_id      text not null,
  -- Cal call-site identifier so we can attribute spend to chat vs. the
  -- vision pipeline (which uses the much more expensive Opus path).
  -- Values: 'chat' | 'vision_pass' | 'layout_detection' | 'diagram_crop'.
  context       text not null,
  input_tokens                  int not null default 0,
  output_tokens                 int not null default 0,
  cache_read_input_tokens       int not null default 0,
  cache_creation_input_tokens   int not null default 0,
  -- Cost in micro-USD (1e-6 dollars). bigint to avoid float drift across
  -- monthly aggregates. A $5 budget = 5_000_000 micros.
  cost_micros   bigint not null default 0
);

create index coach_ai_token_usage_user_time_idx
  on public.coach_ai_token_usage (user_id, occurred_at desc);

alter table public.coach_ai_token_usage enable row level security;

-- Service role writes (no policy needed; service role bypasses RLS).
-- No user-facing read policy yet — admin-only consumption goes through
-- the service-role-backed admin route.
