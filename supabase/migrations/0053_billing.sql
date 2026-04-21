-- Monetization: subscriptions, comp grants, gift codes.
-- Entitlement precedence (resolved in app code, src/lib/billing/entitlement.ts):
--   1. Active comp_grant  (admin-issued, revocable)
--   2. Active subscription (Stripe)
--   3. Free tier (default)
--
-- Existing users at migration time are grandfathered with a permanent comp at
-- the 'coach' tier so nobody hits a new paywall on launch day. Admins can
-- revoke any comp from the admin UI.

-- 1) Tier enum
do $$ begin
  create type public.subscription_tier as enum ('free', 'coach', 'coach_ai');
exception when duplicate_object then null; end $$;

-- 2) Subscriptions (one active row per user; history preserved via status)
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  tier public.subscription_tier not null,
  status text not null check (status in (
    'active', 'trialing', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid', 'paused'
  )),
  stripe_customer_id text,
  stripe_subscription_id text unique,
  stripe_price_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  billing_interval text check (billing_interval in ('month', 'year')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_user_id_idx on public.subscriptions (user_id);
create index if not exists subscriptions_active_idx
  on public.subscriptions (user_id)
  where status in ('active', 'trialing', 'past_due');
create index if not exists subscriptions_customer_idx on public.subscriptions (stripe_customer_id);

alter table public.subscriptions enable row level security;

drop policy if exists "subscriptions self read" on public.subscriptions;
create policy "subscriptions self read"
  on public.subscriptions for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "subscriptions admin all" on public.subscriptions;
create policy "subscriptions admin all"
  on public.subscriptions for all
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- 3) Comp grants (admin gifts). expires_at NULL = permanent. revoked_at sets inactive.
create table if not exists public.comp_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  tier public.subscription_tier not null,
  note text,
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id) on delete set null
);

create index if not exists comp_grants_user_id_idx on public.comp_grants (user_id);
create index if not exists comp_grants_active_idx
  on public.comp_grants (user_id)
  where revoked_at is null;

alter table public.comp_grants enable row level security;

drop policy if exists "comp_grants self read" on public.comp_grants;
create policy "comp_grants self read"
  on public.comp_grants for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "comp_grants admin all" on public.comp_grants;
create policy "comp_grants admin all"
  on public.comp_grants for all
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- 4) Gift codes. Multi-use supported via max_uses + used_count.
create table if not exists public.gift_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  tier public.subscription_tier not null,
  duration_days integer,
  max_uses integer not null default 1 check (max_uses > 0),
  used_count integer not null default 0 check (used_count >= 0),
  note text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  check (code = upper(code) and char_length(code) between 6 and 64),
  check (used_count <= max_uses)
);

create index if not exists gift_codes_code_idx on public.gift_codes (code);

alter table public.gift_codes enable row level security;

drop policy if exists "gift_codes admin all" on public.gift_codes;
create policy "gift_codes admin all"
  on public.gift_codes for all
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- 5) Gift redemptions (audit trail; each redemption creates a comp_grant).
create table if not exists public.gift_redemptions (
  id uuid primary key default gen_random_uuid(),
  code_id uuid not null references public.gift_codes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  comp_grant_id uuid references public.comp_grants (id) on delete set null,
  redeemed_at timestamptz not null default now(),
  unique (code_id, user_id)
);

create index if not exists gift_redemptions_user_idx on public.gift_redemptions (user_id);

alter table public.gift_redemptions enable row level security;

drop policy if exists "gift_redemptions self read" on public.gift_redemptions;
create policy "gift_redemptions self read"
  on public.gift_redemptions for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "gift_redemptions admin all" on public.gift_redemptions;
create policy "gift_redemptions admin all"
  on public.gift_redemptions for all
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- 6) Entitlement view: single source of truth for "what tier is this user on?".
-- Precedence: active comp grant > active subscription > free.
create or replace view public.user_entitlements
with (security_invoker = true)
as
select
  u.id as user_id,
  coalesce(comp.tier, sub.tier, 'free'::public.subscription_tier) as tier,
  case
    when comp.tier is not null then 'comp'
    when sub.tier is not null then 'stripe'
    else 'free'
  end as source,
  case
    when comp.tier is not null then comp.expires_at
    when sub.tier is not null then sub.current_period_end
    else null
  end as expires_at,
  comp.id as comp_grant_id,
  sub.id as subscription_id
from auth.users u
left join lateral (
  select cg.id, cg.tier, cg.expires_at
  from public.comp_grants cg
  where cg.user_id = u.id
    and cg.revoked_at is null
    and (cg.expires_at is null or cg.expires_at > now())
  order by
    case cg.tier when 'coach_ai' then 2 when 'coach' then 1 else 0 end desc,
    cg.granted_at desc
  limit 1
) comp on true
left join lateral (
  select s.id, s.tier, s.current_period_end
  from public.subscriptions s
  where s.user_id = u.id
    and s.status in ('active', 'trialing', 'past_due')
  order by
    case s.tier when 'coach_ai' then 2 when 'coach' then 1 else 0 end desc,
    s.current_period_end desc nulls last
  limit 1
) sub on true;

grant select on public.user_entitlements to authenticated;

-- 7) updated_at trigger for subscriptions
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- 8) GRANDFATHER: every existing auth user gets a permanent 'coach' comp.
-- Safe to re-run: the unique partial index below prevents dup grandfather grants.
create unique index if not exists comp_grants_grandfather_unique
  on public.comp_grants (user_id)
  where note = 'grandfathered at launch' and revoked_at is null;

insert into public.comp_grants (user_id, tier, note, granted_by, expires_at)
select u.id, 'coach'::public.subscription_tier, 'grandfathered at launch', null, null
from auth.users u
on conflict do nothing;
