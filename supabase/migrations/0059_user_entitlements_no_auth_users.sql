-- 0058: Rebuild user_entitlements view so it doesn't read auth.users.
--
-- The previous definition (0053) selected FROM auth.users u with
-- security_invoker=true. Under PostgREST (and even for service_role in some
-- configurations) the invoker can't SELECT from auth.users, so the whole view
-- returned "permission denied for table users" and the admin Plan column
-- treated every user as Free even when a comp_grant existed.
--
-- The row set is now derived from comp_grants ∪ subscriptions (the only
-- tables that can produce a non-free entitlement). Users with no grant and
-- no subscription simply don't appear in the view — callers already default
-- those to 'free'.

create or replace view public.user_entitlements
with (security_invoker = true)
as
with user_ids as (
  select user_id from public.comp_grants where revoked_at is null
  union
  select user_id from public.subscriptions
    where status in ('active', 'trialing', 'past_due')
)
select
  u.user_id,
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
  select s.id, s.tier, s.current_period_end
  from public.subscriptions s
  where s.user_id = u.user_id
    and s.status in ('active', 'trialing', 'past_due')
  order by
    case s.tier when 'coach_ai' then 2 when 'coach' then 1 else 0 end desc,
    s.current_period_end desc nulls last
  limit 1
) sub on true;

grant select on public.user_entitlements to authenticated;
