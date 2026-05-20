-- Per-user monthly image upload counter for Coach Cal image input. Images
-- incur extra vision-token cost on Anthropic and we want to cap them
-- independently of the existing text-message cap so the dials can move on
-- separate timelines. Stored on the same `coach_ai_usage` row as the
-- existing message_count to share the monthly reset cadence.

alter table public.coach_ai_usage
  add column if not exists image_count int not null default 0;

-- Atomic upsert called from the stream route handler after each successful
-- image-bearing response. The cap check happens BEFORE processing, so a
-- failed turn does NOT consume the count (matches the recordUsage pattern
-- for messages — only successful turns increment).
create or replace function public.increment_coach_ai_image_usage(
  p_user_id uuid,
  p_month   date
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.coach_ai_usage (user_id, month, image_count)
  values (p_user_id, p_month, 1)
  on conflict (user_id, month)
  do update set image_count = coach_ai_usage.image_count + 1;
end;
$$;
