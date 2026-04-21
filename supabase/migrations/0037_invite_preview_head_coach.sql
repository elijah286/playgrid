-- Extend invite_preview so the invite landing page can show the playbook's
-- head coach (if set). Joins playbook_members (flagged head coach) to
-- profiles.display_name. Returns NULL when no head coach is designated.

drop function if exists public.invite_preview(text);

create or replace function public.invite_preview(p_token text)
returns table (
  invite_id uuid,
  playbook_id uuid,
  playbook_name text,
  team_name text,
  season text,
  logo_url text,
  color text,
  play_count integer,
  head_coach_name text,
  role public.playbook_role,
  expires_at timestamptz,
  exhausted boolean,
  revoked boolean,
  expired boolean
)
as $$
  select
    i.id,
    i.playbook_id,
    p.name,
    t.name as team_name,
    p.season,
    p.logo_url,
    p.color,
    (select count(*)::int from public.plays pl where pl.playbook_id = p.id) as play_count,
    (
      select pr.display_name
      from public.playbook_members pm
      left join public.profiles pr on pr.id = pm.user_id
      where pm.playbook_id = p.id and pm.is_head_coach
      limit 1
    ) as head_coach_name,
    i.role,
    i.expires_at,
    (i.max_uses is not null and i.uses_count >= i.max_uses) as exhausted,
    (i.revoked_at is not null) as revoked,
    (i.expires_at <= now()) as expired
  from public.playbook_invites i
  join public.playbooks p on p.id = i.playbook_id
  join public.teams t on t.id = p.team_id
  where i.token = p_token
  limit 1;
$$ language sql stable security definer set search_path = public;

grant execute on function public.invite_preview(text) to anon, authenticated;
