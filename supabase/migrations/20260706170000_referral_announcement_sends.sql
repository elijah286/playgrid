-- Audit + idempotency for the one-time referral-program launch email.
-- UNIQUE(user_id) makes a double-send structurally impossible, and gives a
-- durable record of exactly who was emailed and when.
create table if not exists public.referral_announcement_sends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  to_email text,
  status text not null default 'sent' check (status in ('sent', 'failed')),
  error_message text,
  sent_at timestamptz not null default now(),
  unique (user_id)
);

create index if not exists referral_announcement_sends_sent_at_idx
  on public.referral_announcement_sends (sent_at);

alter table public.referral_announcement_sends enable row level security;

-- Admin-only read for a campaign dashboard; writes are service-role only.
drop policy if exists "referral_announcement_sends admin read" on public.referral_announcement_sends;
create policy "referral_announcement_sends admin read"
  on public.referral_announcement_sends for select
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
