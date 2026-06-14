-- Apple In-App Purchase subscriptions (via RevenueCat).
--
-- Mirror of the Stripe `subscriptions` table for the App Store billing path.
-- Kept SEPARATE from `subscriptions` on purpose: that table + all its machinery
-- (webhook upsert, upgrade/downgrade schedules, seat sync, hasUsedCoachProTrial,
-- admin revenue analytics) is Stripe-API-shaped and must not learn about Apple.
-- The ONLY place the two billing sources merge is the user_entitlements view
-- below, which already merged comp ∪ stripe and now merges comp ∪ stripe ∪ apple.
--
-- Apple/RevenueCat owns this subscription's lifecycle: plan changes, cancels,
-- and renewals all happen in Apple's UI; we only mirror state in via the
-- RevenueCat webhook (src/app/api/revenuecat/webhook). `original_transaction_id`
-- is Apple's stable id across renewals — the upsert/dedupe key, analogous to
-- `stripe_subscription_id`.

create table if not exists public.iap_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- 'apple' today; 'google' reserved for a future Play Billing path on the same shape.
  provider text not null default 'apple' check (provider in ('apple', 'google')),
  tier public.subscription_tier not null,
  -- Normalized from RevenueCat. in_grace_period/billing_retry still entitle the
  -- user (Apple is retrying the charge); canceled means auto-renew off but still
  -- entitled until current_period_end; expired/paused do not entitle.
  status text not null check (status in (
    'active', 'trialing', 'in_grace_period', 'billing_retry', 'canceled', 'expired', 'paused'
  )),
  store_product_id text not null,
  rc_app_user_id text,
  rc_entitlement_id text,
  original_transaction_id text not null unique,
  current_period_end timestamptz,
  billing_interval text check (billing_interval in ('month', 'year')),
  environment text not null default 'production' check (environment in ('sandbox', 'production')),
  auto_renew_status boolean not null default true,
  last_event_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists iap_subscriptions_user_id_idx on public.iap_subscriptions (user_id);
-- Powers the entitlement view's active-row lateral join (mirrors subscriptions_active_idx).
create index if not exists iap_subscriptions_active_idx
  on public.iap_subscriptions (user_id)
  where status in ('active', 'trialing', 'in_grace_period');

alter table public.iap_subscriptions enable row level security;

drop policy if exists "iap_subscriptions self read" on public.iap_subscriptions;
create policy "iap_subscriptions self read"
  on public.iap_subscriptions for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "iap_subscriptions admin all" on public.iap_subscriptions;
create policy "iap_subscriptions admin all"
  on public.iap_subscriptions for all
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Writes happen only via the service-role RevenueCat webhook, so no insert/update
-- policy is needed for authenticated users (RLS denies by default).

drop trigger if exists iap_subscriptions_set_updated_at on public.iap_subscriptions;
create trigger iap_subscriptions_set_updated_at
  before update on public.iap_subscriptions
  for each row execute function public.set_updated_at();

-- Rebuild user_entitlements to merge the Apple source in alongside Stripe.
-- Precedence: comp_grant > paid(stripe|apple) > free. Between stripe and apple
-- (which should never both be active — the purchase guards prevent double-billing)
-- the higher tier wins; on a tie, stripe wins (richer self-serve management).
-- tier / source / expires_at all key off the SAME stripe-wins predicate so they
-- can never disagree. Preserves security_invoker=true and the comp/stripe columns.
create or replace view public.user_entitlements
with (security_invoker = true)
as
with user_ids as (
  select user_id from public.comp_grants where revoked_at is null
  union
  select user_id from public.subscriptions
    where status in ('active', 'trialing', 'past_due')
  union
  select user_id from public.iap_subscriptions
    where status in ('active', 'trialing', 'in_grace_period')
)
select
  u.user_id,
  case
    when comp.tier is not null then comp.tier
    when sub.tier is not null and (iap.tier is null or sub.rnk >= iap.rnk) then sub.tier
    when iap.tier is not null then iap.tier
    else 'free'::public.subscription_tier
  end as tier,
  case
    when comp.tier is not null then 'comp'
    when sub.tier is not null and (iap.tier is null or sub.rnk >= iap.rnk) then 'stripe'
    when iap.tier is not null then 'apple'
    else 'free'
  end as source,
  case
    when comp.tier is not null then comp.expires_at
    when sub.tier is not null and (iap.tier is null or sub.rnk >= iap.rnk) then sub.current_period_end
    when iap.tier is not null then iap.current_period_end
    else null
  end as expires_at,
  comp.id as comp_grant_id,
  sub.id as subscription_id,
  iap.id as iap_subscription_id
from user_ids u
left join lateral (
  select cg.id, cg.tier, cg.expires_at
  from public.comp_grants cg
  where cg.user_id = u.user_id
    and cg.revoked_at is null
    and (cg.expires_at is null or cg.expires_at > now())
  order by
    case cg.tier when 'coach_ai' then 2 when 'coach' then 1 else 0 end desc,
    cg.granted_at desc
  limit 1
) comp on true
left join lateral (
  select s.id, s.tier, s.current_period_end,
    case s.tier when 'coach_ai' then 2 when 'coach' then 1 else 0 end as rnk
  from public.subscriptions s
  where s.user_id = u.user_id
    and s.status in ('active', 'trialing', 'past_due')
  order by
    case s.tier when 'coach_ai' then 2 when 'coach' then 1 else 0 end desc,
    s.current_period_end desc nulls last
  limit 1
) sub on true
left join lateral (
  select i.id, i.tier, i.current_period_end,
    case i.tier when 'coach_ai' then 2 when 'coach' then 1 else 0 end as rnk
  from public.iap_subscriptions i
  where i.user_id = u.user_id
    and i.status in ('active', 'trialing', 'in_grace_period')
  order by
    case i.tier when 'coach_ai' then 2 when 'coach' then 1 else 0 end desc,
    i.current_period_end desc nulls last
  limit 1
) iap on true;

grant select on public.user_entitlements to authenticated;
