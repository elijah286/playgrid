-- 2026-05-05: Owner-controlled policy for whether players (viewers) can
-- invite other players to a playbook. Three values:
--   'disabled' (default) — only owner/editor can invite anyone
--   'approval'           — viewers can issue player-invite links; new
--                          joiners land in pending status until the
--                          owner approves them in the Roster tab
--   'open'               — viewers can issue player-invite links; new
--                          joiners get active status immediately
--
-- Default is 'disabled' so existing playbooks behave exactly as they do
-- today — owners must explicitly opt in. Stored as a top-level column on
-- playbooks for symmetry with the existing duplication-control flags
-- (see 0050_playbook_split_duplication_flags.sql) and so RLS policies
-- can reference it without parsing JSON.

alter table public.playbooks
  add column if not exists player_invite_policy text not null default 'disabled'
    check (player_invite_policy in ('disabled', 'approval', 'open'));

comment on column public.playbooks.player_invite_policy is
  'Whether viewer-role members can invite other players. disabled (default) | approval | open. See migration 20260505120000.';
