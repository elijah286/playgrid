-- Per-message event log for Coach Cal usage. The existing
-- coach_ai_usage table aggregates by month and is what the cap
-- enforcement reads, so it stays. This event log lets the admin
-- monetization dashboard answer time-windowed questions
-- ("today", "this week") that monthly aggregates cannot.

create table public.coach_ai_message_events (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  occurred_at timestamptz not null default now()
);

create index coach_ai_message_events_occurred_at_idx
  on public.coach_ai_message_events (occurred_at desc);

create index coach_ai_message_events_user_occurred_idx
  on public.coach_ai_message_events (user_id, occurred_at desc);

alter table public.coach_ai_message_events enable row level security;
-- No public policies: only the service role (admin dashboard) reads this.

-- Update the existing RPC to also append an event row. Same
-- signature, called from the same place (stream route's recordUsage).
create or replace function public.increment_coach_ai_usage(
  p_user_id uuid,
  p_month   date
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.coach_ai_usage (user_id, month, message_count)
  values (p_user_id, p_month, 1)
  on conflict (user_id, month)
  do update set message_count = coach_ai_usage.message_count + 1;

  insert into public.coach_ai_message_events (user_id) values (p_user_id);
end;
$$;
