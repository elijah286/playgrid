-- Knowledge base for Coach AI: rules, schemes, terminology, tactics.
--
-- Two scopes for v1:
--   * global   — admin-curated, readable by all authenticated users
--   * playbook — coach-curated for one playbook, readable by playbook viewers
--
-- (team / user scopes can be added later if needed.)
--
-- Documents are filtered by sport_variant + game_level + sanctioning_body
-- + age_division *before* vector search to keep retrieval precise.
--
-- Revision history is append-only and mirrors the play_versions pattern.

create extension if not exists vector;

-- ── rag_documents ──────────────────────────────────────────────────
create table if not exists public.rag_documents (
  id                uuid        primary key default gen_random_uuid(),

  scope             text        not null check (scope in ('global','playbook')),
  scope_id          uuid,                                  -- null when scope='global'

  topic             text        not null,                  -- 'rules' | 'scheme' | 'terminology' | 'tactics'
  subtopic          text,                                  -- e.g. 'kickoff', 'motion', 'tampa_2'
  title             text        not null,
  content           text        not null,

  sport_variant     text,                                  -- filters: composed with playbook columns
  game_level        text,
  sanctioning_body  text,
  age_division      text,

  source            text        not null check (source in ('seed','admin_chat','coach_chat','official_pdf')),
  source_url        text,
  source_note       text,

  authoritative     boolean     not null default false,
  needs_review      boolean     not null default false,

  last_verified_at  timestamptz,
  verified_by       uuid        references auth.users(id) on delete set null,

  created_by        uuid        references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  retired_at        timestamptz,                            -- soft delete

  embedding         vector(1536),                           -- nullable until ingestion job runs

  constraint rag_documents_scope_id_check check (
    (scope = 'global'   and scope_id is null) or
    (scope = 'playbook' and scope_id is not null)
  )
);

create index if not exists rag_documents_filter_idx
  on public.rag_documents (scope, scope_id, sport_variant, sanctioning_body)
  where retired_at is null;

create index if not exists rag_documents_topic_idx
  on public.rag_documents (topic, subtopic)
  where retired_at is null;

-- ivfflat index for cosine similarity. lists=100 is a reasonable default for
-- small/medium corpora; can be tuned later. Requires ANALYZE after bulk load.
create index if not exists rag_documents_embedding_idx
  on public.rag_documents using ivfflat (embedding vector_cosine_ops)
  with (lists = 100)
  where embedding is not null and retired_at is null;

create trigger rag_documents_set_updated_at
  before update on public.rag_documents
  for each row execute function public.set_updated_at();

comment on table public.rag_documents is
  'Knowledge base chunks for Coach AI. Filter by scope + sport metadata before vector search.';
comment on column public.rag_documents.authoritative is
  'False for AI-drafted or unverified content; true once a site admin (global) or coach (playbook) confirms.';
comment on column public.rag_documents.retired_at is
  'Soft delete. Retired documents are excluded from retrieval but kept for revision history.';

-- ── rag_document_revisions ─────────────────────────────────────────
create table if not exists public.rag_document_revisions (
  id                uuid        primary key default gen_random_uuid(),
  document_id       uuid        not null references public.rag_documents(id) on delete cascade,
  revision_number   int         not null,

  -- snapshot of mutable fields at the time of the revision
  title             text        not null,
  content           text        not null,
  source            text        not null,
  source_url        text,
  source_note       text,
  authoritative     boolean     not null,
  needs_review      boolean     not null,

  change_kind       text        not null check (change_kind in ('create','edit','verify','retire','restore')),
  change_summary    text,                                   -- one-line, often LLM-written
  changed_by        uuid        references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),

  unique (document_id, revision_number)
);

create index if not exists rag_document_revisions_document_idx
  on public.rag_document_revisions (document_id, revision_number desc);

comment on table public.rag_document_revisions is
  'Append-only revision history for rag_documents. Mirrors the play_versions pattern.';

-- ── RLS ────────────────────────────────────────────────────────────
alter table public.rag_documents          enable row level security;
alter table public.rag_document_revisions enable row level security;

-- rag_documents: read
create policy rag_documents_read_global
  on public.rag_documents for select
  using (scope = 'global' and auth.uid() is not null);

create policy rag_documents_read_playbook
  on public.rag_documents for select
  using (scope = 'playbook' and public.can_view_playbook(scope_id));

-- rag_documents: write (insert/update/delete) — soft delete via retired_at
create policy rag_documents_write_global
  on public.rag_documents for all
  using      (scope = 'global' and public.is_site_admin())
  with check (scope = 'global' and public.is_site_admin());

create policy rag_documents_write_playbook
  on public.rag_documents for all
  using      (scope = 'playbook' and public.can_edit_playbook(scope_id))
  with check (scope = 'playbook' and public.can_edit_playbook(scope_id));

-- rag_document_revisions: read = same visibility as parent doc
create policy rag_document_revisions_read
  on public.rag_document_revisions for select
  using (
    exists (
      select 1 from public.rag_documents d
      where  d.id = rag_document_revisions.document_id
        and  (
              (d.scope = 'global'   and auth.uid() is not null) or
              (d.scope = 'playbook' and public.can_view_playbook(d.scope_id))
            )
    )
  );

-- rag_document_revisions: insert-only by users who can edit the parent doc
create policy rag_document_revisions_insert
  on public.rag_document_revisions for insert
  with check (
    exists (
      select 1 from public.rag_documents d
      where  d.id = rag_document_revisions.document_id
        and  (
              (d.scope = 'global'   and public.is_site_admin()) or
              (d.scope = 'playbook' and public.can_edit_playbook(d.scope_id))
            )
    )
  );
