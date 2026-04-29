-- Referral rewards: when a coach sends a copy of their playbook and a NEW
-- user claims it, the sender earns Team Coach days as a thank-you. Off by
-- default; admin enables and tunes from Site Admin.
--
-- Design notes
--
--   * Per-award amount and the lifetime cap are admin-configurable — we
--     don't bake numbers into the schema. `referral_cap_days` null means
--     "no cap" (the admin's "no cap" checkbox).
--
--   * Idempotency hinges on (recipient_id) being unique. Once a recipient
--     has minted *any* referral award, no further sender can claim them.
--     This kills two abuse paths in one constraint: the same coach
--     re-sending and double-booking, and a recipient farming credits for
--     multiple senders by claiming many copy links.
--
--   * Awards are recorded against a comp_grant — the grant is the actual
--     entitlement carrier. Stacking is handled by extending the latest
--     active referral comp_grant's expires_at instead of creating new
--     grants per award (otherwise the entitlement view would resolve to
--     the longest-expiring grant and earlier ones would just sit unused).
--
--   * "New user" is defined at the application layer, not the schema —
--     we need access to the recipient's owned-playbook count at claim
--     time, which is cheaper to check there than to reproduce in a
--     trigger. The unique (recipient_id) is the schema-level guard
--     against the same recipient generating multiple rewards.

alter table public.site_settings
  add column if not exists referral_enabled boolean not null default false,
  add column if not exists referral_days_per_award integer not null default 30
    check (referral_days_per_award >= 1 and referral_days_per_award <= 3650),
  add column if not exists referral_cap_days integer
    check (referral_cap_days is null or (referral_cap_days >= 1 and referral_cap_days <= 3650));

create table if not exists public.referral_awards (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users (id) on delete cascade,
  recipient_id uuid not null references auth.users (id) on delete cascade unique,
  days_awarded integer not null check (days_awarded >= 0),
  comp_grant_id uuid references public.comp_grants (id) on delete set null,
  -- Open-ended for future referral channels (direct invite, gift, etc).
  source text not null default 'copy_link',
  awarded_at timestamptz not null default now()
);

create index if not exists referral_awards_sender_idx on public.referral_awards (sender_id);
create index if not exists referral_awards_awarded_at_idx on public.referral_awards (awarded_at);

alter table public.referral_awards enable row level security;

-- Senders can read their own awards (drives the Share dialog summary).
drop policy if exists "referral_awards self read" on public.referral_awards;
create policy "referral_awards self read"
  on public.referral_awards for select
  to authenticated
  using (sender_id = auth.uid());

-- Admins can read everything for monitoring / dispute resolution.
drop policy if exists "referral_awards admin read" on public.referral_awards;
create policy "referral_awards admin read"
  on public.referral_awards for select
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Inserts are server-side only (security-definer RPC below). No direct
-- INSERT policy — anonymous users can't write at all, regular users
-- can't bypass cap/idempotency checks, admins can still insert via the
-- service role for manual adjustments.
