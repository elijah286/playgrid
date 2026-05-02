-- Coach AI feedback clusters: drafts surfaced from production failure signals
-- (KB misses, refusals, thumbs-down) for site-admin review.
--
-- A cluster groups N raw feedback entries that share a topic, and carries an
-- LLM-drafted KB chunk the admin can edit, approve, or reject. On approval
-- the chunk is written into rag_documents via the normal admin path.
--
-- This table is the queue + review state. It does NOT replace any existing
-- feedback tables — those remain the source of truth for individual entries.

create table if not exists public.coach_ai_feedback_clusters (
  id                uuid        primary key default gen_random_uuid(),

  -- Topic + draft KB chunk (LLM-generated; admin may edit before approving).
  topic             text        not null,
  draft_title       text        not null,
  draft_content     text        not null,
  draft_subtopic    text,

  -- Suggested KB scope facets, inferred by the clusterer from the underlying
  -- prompts. Admin can override at approval time.
  suggested_topic         text not null default 'tactics' check (
    suggested_topic in ('rules','scheme','terminology','tactics')
  ),
  suggested_sport_variant     text,
  suggested_game_level        text,
  suggested_sanctioning_body  text,
  suggested_age_division      text,

  -- Source signal mix.
  signal_kb_miss    int  not null default 0,
  signal_refusal    int  not null default 0,
  signal_thumbs_dn  int  not null default 0,
  cluster_size      int  not null,

  -- 2-3 anonymized sample prompts (LLM-selected representative quotes).
  sample_prompts    text[] not null default '{}',

  -- Lifecycle.
  status            text not null default 'pending' check (
    status in ('pending','approved','rejected')
  ),
  reviewed_at       timestamptz,
  reviewed_by       uuid references auth.users(id) on delete set null,
  rejection_reason  text,

  -- If approved, the rag_documents row that was created.
  approved_kb_id    uuid references public.rag_documents(id) on delete set null,

  -- Provenance — when the clusterer last saw these signals.
  signal_window_start timestamptz not null,
  signal_window_end   timestamptz not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists coach_ai_feedback_clusters_status_idx
  on public.coach_ai_feedback_clusters (status, created_at desc);

drop trigger if exists coach_ai_feedback_clusters_set_updated_at
  on public.coach_ai_feedback_clusters;
create trigger coach_ai_feedback_clusters_set_updated_at
  before update on public.coach_ai_feedback_clusters
  for each row execute function public.set_updated_at();

comment on table public.coach_ai_feedback_clusters is
  'Site-admin review queue for LLM-clustered Coach AI failure signals. Approval writes into rag_documents.';

-- ── RLS ────────────────────────────────────────────────────────────
alter table public.coach_ai_feedback_clusters enable row level security;

create policy coach_ai_feedback_clusters_admin_all
  on public.coach_ai_feedback_clusters for all
  using      (public.is_site_admin())
  with check (public.is_site_admin());
