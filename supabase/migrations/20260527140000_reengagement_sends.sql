-- Re-engagement email tracking + runtime toggle.
--
-- We send a "you started a playbook, here are 3 plays to keep going"
-- nudge to users who got to 1 play and stalled. Two emails per user:
--   3d  — 3 days after last activity, single play still on the board
--   10d — 10 days after last activity (final nudge), single play still
--
-- This table is the idempotency record: one row per (user, kind). The
-- unique constraint enforces "exactly one of each kind, ever". The
-- cron route writes the row after Resend confirms send.

create table if not exists public.reengagement_sends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('3d', '10d')),
  sent_at timestamptz not null default now(),
  play_count_at_send int,
  sport_variant text,
  to_email text,
  unique (user_id, kind)
);

create index if not exists reengagement_sends_user_id_idx
  on public.reengagement_sends (user_id);

create index if not exists reengagement_sends_sent_at_idx
  on public.reengagement_sends (sent_at desc);

alter table public.reengagement_sends enable row level security;

-- Service-role only. No user-facing read/write surface.
revoke all on public.reengagement_sends from public, authenticated, anon;

-- Runtime kill switch. Cron route no-ops while false. The test-send
-- script bypasses this flag — it's per-recipient and never reads from
-- the production funnel.
alter table public.site_settings
  add column if not exists reengagement_enabled boolean not null default false;

-- Per-category email opt-outs. Apple/Gmail's bulk-mail policy (RFC 8058)
-- requires a one-click List-Unsubscribe path on any bulk/promotional
-- send — missing it puts us in Junk on iCloud. The unsubscribe endpoint
-- inserts here; the cron route excludes anyone with a matching row.
-- Categories are namespaced strings ("reengagement", future: "digest",
-- "product_news") so a coach can opt out of nudges without losing
-- transactional/security mail.
create table if not exists public.email_opt_outs (
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  opted_out_at timestamptz not null default now(),
  source text,
  primary key (user_id, category)
);

create index if not exists email_opt_outs_category_idx
  on public.email_opt_outs (category);

alter table public.email_opt_outs enable row level security;
revoke all on public.email_opt_outs from public, authenticated, anon;
