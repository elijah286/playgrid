-- Coach AI usage tracking: messages per user per calendar month.
-- Used to display a usage meter in the chat UI and enforce soft limits.

create table public.coach_ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  month   date not null,  -- always first day of the month (YYYY-MM-01)
  message_count int not null default 0,
  primary key (user_id, month)
);

-- Users can read their own rows; service role writes via the RPC below.
alter table public.coach_ai_usage enable row level security;
create policy "users read own usage"
  on public.coach_ai_usage for select
  using (auth.uid() = user_id);

-- Atomic upsert called from the stream route handler after each successful response.
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
end;
$$;
