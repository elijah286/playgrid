-- Version history & change management
--
-- Plays already have play_versions; this migration:
--   1. Extends play_versions with note, diff_summary, durable editor name, and kind/restore tracking.
--   2. Adds playbook_versions to capture playbook structure (groups, play ordering) snapshots.
--   3. Adds soft-delete (deleted_at) to plays and playbook_groups for the 30-day trash.
--
-- Snapshot writes always run; visibility/restore UIs are gated by the version_history beta flag at the app layer.

-- 1. Extend play_versions ----------------------------------------------------

alter table public.play_versions
  add column if not exists note text,
  add column if not exists diff_summary text,
  add column if not exists editor_name_snapshot text,
  add column if not exists kind text not null default 'edit',
  add column if not exists restored_from_version_id uuid references public.play_versions (id) on delete set null;

alter table public.play_versions
  drop constraint if exists play_versions_kind_check;
alter table public.play_versions
  add constraint play_versions_kind_check
  check (kind in ('create', 'edit', 'restore'));

create index if not exists play_versions_play_id_created_at_idx
  on public.play_versions (play_id, created_at desc);

comment on column public.play_versions.note is 'Coach-supplied "why" captured when leaving the edit canvas.';
comment on column public.play_versions.diff_summary is 'Deterministic semantic diff vs parent_version_id (LLM/RAG-friendly).';
comment on column public.play_versions.editor_name_snapshot is 'Editor display name at time of edit; durable if the user later leaves the team.';
comment on column public.play_versions.kind is 'edit | restore | create. Restore creates a new version rather than mutating history.';
comment on column public.play_versions.restored_from_version_id is 'Set only when kind = restore; references the version whose document was restored.';

-- 2. playbook_versions -------------------------------------------------------
-- document shape (denormalized snapshot of structure, not play contents):
--   {
--     "groups": [{ "id": uuid, "name": text, "sort_order": int }, ...],
--     "plays":  [{ "id": uuid, "group_id": uuid|null, "sort_order": int, "name": text }, ...]
--   }
-- Play contents stay in play_versions. Restoring playbook structure does not touch play documents.

create table if not exists public.playbook_versions (
  id uuid primary key default gen_random_uuid(),
  playbook_id uuid not null references public.playbooks (id) on delete cascade,
  schema_version int not null default 1,
  document jsonb not null,
  parent_version_id uuid references public.playbook_versions (id) on delete set null,
  note text,
  diff_summary text,
  kind text not null default 'edit' check (kind in ('create', 'edit', 'restore')),
  restored_from_version_id uuid references public.playbook_versions (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  editor_name_snapshot text,
  created_at timestamptz not null default now()
);

create index if not exists playbook_versions_playbook_id_created_at_idx
  on public.playbook_versions (playbook_id, created_at desc);

alter table public.playbook_versions enable row level security;

-- RLS: a user can read/write playbook_versions when they can read/write the parent playbook.
-- Reuses existing playbooks RLS by joining; service role bypasses RLS for snapshot workers.
create policy playbook_versions_select_via_playbook on public.playbook_versions
  for select using (
    exists (
      select 1 from public.playbooks p
      where p.id = playbook_versions.playbook_id
    )
  );

create policy playbook_versions_insert_via_playbook on public.playbook_versions
  for insert with check (
    exists (
      select 1 from public.playbooks p
      where p.id = playbook_versions.playbook_id
    )
  );

-- No update/delete policies: versions are immutable. Hard-deletes happen via cascade or admin-only paths.

comment on table public.playbook_versions is 'Versioned snapshots of playbook structure (groups + play ordering). Play contents live in play_versions.';
comment on column public.playbook_versions.document is 'Denormalized snapshot: groups + plays with ordering. See migration for shape.';

-- 3. Soft delete (30-day trash) ---------------------------------------------

alter table public.plays
  add column if not exists deleted_at timestamptz;
alter table public.playbook_groups
  add column if not exists deleted_at timestamptz;

create index if not exists plays_deleted_at_idx
  on public.plays (deleted_at) where deleted_at is not null;
create index if not exists playbook_groups_deleted_at_idx
  on public.playbook_groups (deleted_at) where deleted_at is not null;

comment on column public.plays.deleted_at is 'Soft delete. NULL = live. Non-null rows are hard-deleted by a nightly job after 30 days.';
comment on column public.playbook_groups.deleted_at is 'Soft delete. Plays inside a soft-deleted group keep deleted_at NULL — they unparent to the recovered bucket.';
