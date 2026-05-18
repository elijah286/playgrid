-- Capture cancellation signal from two sources:
--
-- 1) Stripe's billing portal already collects a structured reason +
--    free-text comment when a user cancels. We add columns on
--    public.subscriptions so the webhook can persist them.
--
-- 2) Our own pre-portal in-app survey, where any paid user heading to
--    "Manage billing" can leave free-text feedback before being redirected.
--    Lives in public.subscription_cancellation_feedback (append-only).
--
-- Admin reads both via the site admin UI.

-- 1) Stripe-sourced reason + comment on the sub row itself
alter table public.subscriptions
  add column if not exists stripe_cancellation_reason text,
  add column if not exists stripe_cancellation_feedback text,
  add column if not exists stripe_cancellation_comment text,
  add column if not exists cancel_at timestamptz;

-- 2) Our own free-text survey table
create table if not exists public.subscription_cancellation_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  message text not null check (char_length(message) between 1 and 4000),
  stripe_subscription_id text,
  created_at timestamptz not null default now()
);

create index if not exists subscription_cancellation_feedback_created_at_idx
  on public.subscription_cancellation_feedback (created_at desc);

create index if not exists subscription_cancellation_feedback_user_id_idx
  on public.subscription_cancellation_feedback (user_id);

alter table public.subscription_cancellation_feedback enable row level security;

drop policy if exists "scf insert own" on public.subscription_cancellation_feedback;
create policy "scf insert own"
  on public.subscription_cancellation_feedback
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "scf self read" on public.subscription_cancellation_feedback;
create policy "scf self read"
  on public.subscription_cancellation_feedback
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "scf admin read" on public.subscription_cancellation_feedback;
create policy "scf admin read"
  on public.subscription_cancellation_feedback
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );
