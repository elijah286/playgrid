-- Functional testing harness: store automated end-to-end run results + the
-- screenshots captured at key workflow steps, so the Site Admin "Functional
-- Testing" tab can show whether core user workflows (invite→accept, create
-- playbook, Coach AI, print) are passing in production, how fast each step ran,
-- and what each step looked like.
--
-- Rows are written by GitHub Actions through the service-role ingest endpoint
-- (/api/functional-tests/ingest, Bearer CRON_SECRET) and read only by site
-- admins. This mirrors the system_notices / content_reports pattern: admin-only
-- SELECT via is_site_admin(); no write policy because every write is service-role
-- (which bypasses RLS), so nothing user-facing can forge a run.

-- 1) Public bucket for step screenshots. Public-read like avatars/playbook-logos
--    so the admin UI can <img src> them directly. Uploads are service-role only
--    (the ingest endpoint), so no insert/update policy is needed here.
insert into storage.buckets (id, name, public)
values ('test-screenshots', 'test-screenshots', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "test_screenshots_public_read" on storage.objects;
create policy "test_screenshots_public_read"
  on storage.objects for select
  using (bucket_id = 'test-screenshots');

-- 2) One row per test run.
create table if not exists public.functional_test_runs (
  id uuid primary key default gen_random_uuid(),
  git_sha text,
  trigger text not null default 'manual'
    check (trigger in ('post_deploy', 'nightly', 'manual')),
  status text not null check (status in ('passed', 'failed')),
  environment text,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  duration_ms integer not null default 0,
  total_steps integer not null default 0,
  failed_steps integer not null default 0,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- 3) One row per captured workflow step (screenshot + timing + status).
create table if not exists public.functional_test_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.functional_test_runs(id) on delete cascade,
  scenario text not null,
  step_name text not null,
  ordinal integer not null,
  status text not null check (status in ('passed', 'failed', 'skipped')),
  duration_ms integer,
  screenshot_url text,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists functional_test_runs_created_at_idx
  on public.functional_test_runs (created_at desc);
create index if not exists functional_test_steps_run_ordinal_idx
  on public.functional_test_steps (run_id, ordinal);

-- 4) Admin-only read. No insert/update/delete policy on purpose — the ingest
--    endpoint writes with the service-role key, which bypasses RLS.
alter table public.functional_test_runs enable row level security;
alter table public.functional_test_steps enable row level security;

drop policy if exists functional_test_runs_admin_read on public.functional_test_runs;
create policy functional_test_runs_admin_read
  on public.functional_test_runs for select
  using (public.is_site_admin());

drop policy if exists functional_test_steps_admin_read on public.functional_test_steps;
create policy functional_test_steps_admin_read
  on public.functional_test_steps for select
  using (public.is_site_admin());
