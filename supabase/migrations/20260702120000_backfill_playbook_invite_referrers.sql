-- Backfill invited_by_* detail on historical playbook-invite signup notices.
--
-- enrichSignupNotice() (src/lib/attribution/snapshot.ts) now records who sent
-- a playbook invite (playbook_invites.created_by) into
-- system_notices.detail.invited_by_* at signup time. Notices written before
-- that change only carry detail.signup_source_kind = 'playbook_invite' and
-- detail.share_token, with no invited_by_* fields — so the admin inbox's
-- "Referred by <name>" link has nothing to render for them. This backfills
-- every resolvable historical row in one pass.
--
-- Idempotent: only touches rows where invited_by_email is still unset, so a
-- repeat run (or a future `supabase db push`) is a no-op. Rows whose invite
-- token no longer resolves to a playbook_invites row (e.g. the playbook was
-- deleted, cascading the invite) are left as-is — nothing to backfill from.
update public.system_notices sn
set detail = sn.detail
  || jsonb_build_object(
       'invited_by_user_id', pi.created_by,
       'invited_by_email', au.email,
       'invited_by_name', nullif(trim(coalesce(pr.display_name, '')), '')
     )
from public.playbook_invites pi
left join public.profiles pr on pr.id = pi.created_by
left join auth.users au on au.id = pi.created_by
where sn.kind = 'user_signup'
  and sn.detail ->> 'signup_source_kind' = 'playbook_invite'
  and sn.detail ->> 'share_token' = pi.token
  and (sn.detail ->> 'invited_by_email') is null
returning sn.id, sn.user_email, sn.user_display_name;
