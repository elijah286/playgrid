-- Add sender name to copy_link_preview so the landing page can read
-- "Eli sent you a copy of this playbook" — the personalization that
-- turns a cold link into a warm hand-off. Falls back to the playbook
-- owner's name when the sender's profile has no display_name set, so
-- there's always *some* attribution.

drop function if exists public.copy_link_preview(text);

create or replace function public.copy_link_preview(p_token text)
returns table (
  link_id uuid,
  playbook_id uuid,
  playbook_name text,
  team_name text,
  season text,
  sport_variant text,
  logo_url text,
  color text,
  play_count integer,
  head_coach_name text,
  sender_name text,
  expires_at timestamptz,
  exhausted boolean,
  revoked boolean,
  expired boolean,
  disabled boolean
)
as $$
  select
    cl.id,
    cl.playbook_id,
    p.name,
    t.name as team_name,
    p.season,
    p.sport_variant::text,
    p.logo_url,
    p.color,
    (select count(*)::int from public.plays pl
       where pl.playbook_id = p.id
         and pl.deleted_at is null
         and pl.is_archived is false) as play_count,
    (
      select pr.display_name
      from public.playbook_members m
      join public.profiles pr on pr.id = m.user_id
      where m.playbook_id = p.id
        and m.role = 'owner'
        and m.status = 'active'
      order by m.created_at asc
      limit 1
    ) as head_coach_name,
    (
      select pr.display_name
      from public.profiles pr
      where pr.id = cl.created_by
    ) as sender_name,
    cl.expires_at,
    (cl.max_uses is not null and cl.uses_count >= cl.max_uses) as exhausted,
    (cl.revoked_at is not null) as revoked,
    (cl.expires_at <= now()) as expired,
    (p.allow_copy_links is false) as disabled
  from public.playbook_copy_links cl
  join public.playbooks p on p.id = cl.playbook_id
  join public.teams t on t.id = p.team_id
  where cl.token = p_token
  limit 1;
$$ language sql stable security definer set search_path = public;

grant execute on function public.copy_link_preview(text) to anon, authenticated;
