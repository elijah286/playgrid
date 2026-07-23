-- Opt-in play sharing: coaches control what players/parents (viewer role) see.
--
-- Motivation
-- ----------
-- Today any playbook member — including a `viewer` (player/parent) — can read
-- EVERY play in the playbook (RLS gate: can_view_playbook). Coaches want to use
-- the app for schedule/communication without exposing the playbook, or to share
-- only a hand-picked subset. This migration makes plays opt-in for viewers while
-- keeping coaches' full access.
--
-- Model
-- -----
-- Two additive boolean flags, both defaulting TRUE so existing teams see NO
-- behavior change (a live viewer keeps seeing every play until a coach opts out):
--   * playbooks.plays_shared_with_players — master switch for the whole book.
--   * plays.shared_with_players           — per-play override.
-- A viewer sees a play iff  (playbook master) AND (per-play).  Owners/editors
-- (coaches) and org owners ignore both flags and always see everything.
--
-- Enforcement
-- -----------
-- RLS is PERMISSIVE (policies OR together), so a viewer's visibility can only be
-- restricted by REPLACING the member-select policy, not by adding one. We drop
-- and recreate plays_member_select / play_versions_member_select (from 0017) with
-- a coach/viewer split. The other SELECT grants are unaffected and intentionally
-- kept: plays_all (org owner, 0001), plays_admin_examples_select (0063),
-- plays_public_example_select (0065) — none of which grant a team viewer, so the
-- restriction holds.

alter table public.playbooks
  add column if not exists plays_shared_with_players boolean not null default true;

comment on column public.playbooks.plays_shared_with_players is
  'Master switch: when false, players/parents (viewer role) see NO plays regardless of per-play flags. Coaches (owner/editor) always see all. Toggle via setPlaybookPlaysSharedAction.';

alter table public.plays
  add column if not exists shared_with_players boolean not null default true;

comment on column public.plays.shared_with_players is
  'Per-play override for viewer visibility. A viewer sees a play iff the playbook master (plays_shared_with_players) AND this flag are both true. Coaches ignore it. Toggle via setPlaySharedAction.';

-- Index the viewer read path: viewers filter plays by (playbook_id, shared_with_players).
create index if not exists plays_shared_with_players_idx
  on public.plays (playbook_id, shared_with_players);

-- ---------------------------------------------------------------------------
-- Replace the two member-select policies with the coach/viewer split.
-- (Drop is policy-only — no data is touched.)
-- ---------------------------------------------------------------------------

drop policy if exists plays_member_select on public.plays;

create policy plays_member_select on public.plays
  for select using (
    -- Coaches (owner/editor members) + org owners: full visibility.
    public.can_edit_playbook(playbook_id)
    -- Viewers (and any other member): only plays shared with players, gated by
    -- both the playbook master switch and the per-play override.
    or (
      public.can_view_playbook(playbook_id)
      and coalesce(
        (select pb.plays_shared_with_players from public.playbooks pb where pb.id = playbook_id),
        true
      )
      and shared_with_players
    )
  );

drop policy if exists play_versions_member_select on public.play_versions;

create policy play_versions_member_select on public.play_versions
  for select using (
    exists (
      select 1
      from public.plays p
      where p.id = play_id
        and (
          public.can_edit_playbook(p.playbook_id)
          or (
            public.can_view_playbook(p.playbook_id)
            and coalesce(
              (select pb.plays_shared_with_players from public.playbooks pb where pb.id = p.playbook_id),
              true
            )
            and p.shared_with_players
          )
        )
    )
  );
