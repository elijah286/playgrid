-- Coach AI refusals: log when Coach AI cannot fulfill a request
-- (missing playbook, permission denied, invalid input, etc).
-- Combined with KB misses, this shows the admin where feature gaps exist.

create table public.coach_ai_refusals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_request text not null,
  refusal_reason text not null,
  playbook_id uuid references public.playbooks(id) on delete set null,
  sport_variant text,
  sanctioning_body text,
  game_level text,
  age_division text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index coach_ai_refusals_created_at_idx
  on public.coach_ai_refusals (created_at desc);

create index coach_ai_refusals_unreviewed_idx
  on public.coach_ai_refusals (created_at desc)
  where reviewed_at is null;

alter table public.coach_ai_refusals enable row level security;

-- Only admins can read / mutate.
create policy "admins read refusals"
  on public.coach_ai_refusals for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "admins mark refusal reviewed"
  on public.coach_ai_refusals for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "admins delete refusals"
  on public.coach_ai_refusals for delete
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- RPC for logging refusals
create or replace function public.log_coach_ai_refusal(
  p_user_request text,
  p_refusal_reason text,
  p_playbook_id uuid,
  p_sport_variant text,
  p_sanctioning_body text,
  p_game_level text,
  p_age_division text
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
  insert into public.coach_ai_refusals (
    user_id, user_request, refusal_reason, playbook_id,
    sport_variant, sanctioning_body, game_level, age_division
  ) values (
    v_uid, p_user_request, p_refusal_reason, p_playbook_id,
    p_sport_variant, p_sanctioning_body, p_game_level, p_age_division
  );
end;
$$;
