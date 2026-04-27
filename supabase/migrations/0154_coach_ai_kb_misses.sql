-- Coach AI feedback: log every chat turn that fell back to general LLM
-- knowledge instead of the seeded RAG knowledge base. Lets the site admin
-- see which topics to seed next.
--
-- Logging is gated by a per-user opt-in flag on profiles.ai_feedback_optin
-- (null = never asked, false = declined, true = consenting). The agent
-- only writes a row when the user has opted in.

create table public.coach_ai_kb_misses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topic text not null,
  user_question text not null,
  reason text not null,
  playbook_id uuid references public.playbooks(id) on delete set null,
  sport_variant text,
  sanctioning_body text,
  game_level text,
  age_division text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index coach_ai_kb_misses_created_at_idx
  on public.coach_ai_kb_misses (created_at desc);

create index coach_ai_kb_misses_unreviewed_idx
  on public.coach_ai_kb_misses (created_at desc)
  where reviewed_at is null;

alter table public.coach_ai_kb_misses enable row level security;

-- Only admins can read / mutate. Inserts come from the agent via a
-- security-definer RPC (below) so the row is attributable to the user
-- without granting users a generic INSERT policy on the table.
create policy "admins read kb misses"
  on public.coach_ai_kb_misses for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "admins mark reviewed"
  on public.coach_ai_kb_misses for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "admins delete kb misses"
  on public.coach_ai_kb_misses for delete
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Per-user opt-in for AI feedback collection. NULL = never prompted,
-- false = declined, true = consenting. The Coach AI chat shows a one-time
-- modal on first use when this is null.
alter table public.profiles
  add column if not exists ai_feedback_optin boolean;

-- Insert RPC — runs as definer so the agent's per-request session can
-- write a row attributed to the calling user without exposing the table.
-- Returns void; failures are swallowed by the caller (logging must never
-- break the chat flow).
create or replace function public.log_coach_ai_kb_miss(
  p_topic           text,
  p_user_question   text,
  p_reason          text,
  p_playbook_id     uuid,
  p_sport_variant   text,
  p_sanctioning_body text,
  p_game_level      text,
  p_age_division    text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_optin boolean;
begin
  if v_uid is null then
    return;
  end if;
  select ai_feedback_optin into v_optin from public.profiles where id = v_uid;
  if v_optin is not true then
    -- User has not opted in; silently no-op.
    return;
  end if;
  insert into public.coach_ai_kb_misses (
    user_id, topic, user_question, reason, playbook_id,
    sport_variant, sanctioning_body, game_level, age_division
  ) values (
    v_uid, p_topic, p_user_question, p_reason, p_playbook_id,
    p_sport_variant, p_sanctioning_body, p_game_level, p_age_division
  );
end;
$$;

-- Let the user read + update their own opt-in flag (the existing profiles
-- policies already cover this — this comment is here as a reminder, not
-- a policy change).
