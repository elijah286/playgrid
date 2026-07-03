-- Photo import jobs: server-persisted extraction runs so a coach can
-- leave the page (or background the app on a phone) while the 20-60s
-- vision read runs, then resume from "Recent imports" on the import
-- page. Field feedback 2026-07-03: staring at a spinner for a minute
-- is unreasonable.
--
-- Privacy/retention: crop_base64 holds the photographed panel ONLY
-- while a job is live — rows (crop included) are lazily deleted 24
-- hours after creation by the jobs list endpoint. No RLS policies on
-- purpose: only the API routes (service role) touch this table, and
-- they filter by user_id explicitly.

create table if not exists public.photo_import_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  playbook_id uuid not null references public.playbooks(id) on delete cascade,
  label text not null default 'Imported play',
  status text not null default 'running' check (status in ('running', 'done', 'error')),
  attempts int not null default 1,
  -- The cropped panel sent to the vision model (JPEG base64), kept so a
  -- stalled/errored job can retry without re-uploading and the review
  -- screen can show the photo after a resume. Deleted with the row.
  crop_base64 text,
  media_type text,
  extraction jsonb,
  spec jsonb,
  mapping jsonb,
  warnings jsonb,
  variant_mismatch jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists photo_import_jobs_user_created_idx
  on public.photo_import_jobs (user_id, created_at desc);

alter table public.photo_import_jobs enable row level security;
