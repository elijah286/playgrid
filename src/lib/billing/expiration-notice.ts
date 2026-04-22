import { createClient } from "@/lib/supabase/server";
import type { SubscriptionTier } from "@/lib/billing/entitlement";

export type ExpirationNotice = {
  tier: SubscriptionTier;
  source: "comp" | "stripe";
  expiresAt: string;
  state: "expiring" | "expired";
  daysLeft: number;
};

const WINDOW_DAYS = 14;

/**
 * Returns a banner notice if the current user's paid plan is within the 14-day
 * window before it ends (stripe: only when cancel_at_period_end; comp: always).
 * Also fires for the first 14 days AFTER a paid plan lapsed (source becomes free
 * but a recent subscription or comp grant is still on file).
 */
export async function getExpirationNotice(): Promise<ExpirationNotice | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: ent } = await supabase
    .from("user_entitlements")
    .select("tier, source, expires_at, subscription_id, comp_grant_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const now = Date.now();
  const windowMs = WINDOW_DAYS * 24 * 60 * 60 * 1000;

  if (ent && (ent.source === "comp" || ent.source === "stripe") && ent.expires_at) {
    const expMs = new Date(ent.expires_at as string).getTime();
    if (!Number.isNaN(expMs)) {
      const diff = expMs - now;
      if (ent.source === "comp") {
        if (diff <= windowMs && diff > 0) {
          return {
            tier: ent.tier as SubscriptionTier,
            source: "comp",
            expiresAt: ent.expires_at as string,
            state: "expiring",
            daysLeft: Math.max(1, Math.ceil(diff / (24 * 60 * 60 * 1000))),
          };
        }
      } else if (ent.source === "stripe" && ent.subscription_id) {
        const { data: sub } = await supabase
          .from("subscriptions")
          .select("cancel_at_period_end, current_period_end, status")
          .eq("id", ent.subscription_id as string)
          .maybeSingle();
        if (sub?.cancel_at_period_end && diff <= windowMs && diff > 0) {
          return {
            tier: ent.tier as SubscriptionTier,
            source: "stripe",
            expiresAt: ent.expires_at as string,
            state: "expiring",
            daysLeft: Math.max(1, Math.ceil(diff / (24 * 60 * 60 * 1000))),
          };
        }
      }
    }
  }

  if (!ent || ent.tier === "free" || ent.source === "free") {
    const [{ data: recentComp }, { data: recentSub }] = await Promise.all([
      supabase
        .from("comp_grants")
        .select("tier, expires_at, revoked_at")
        .eq("user_id", user.id)
        .not("expires_at", "is", null)
        .order("expires_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("subscriptions")
        .select("tier, current_period_end, status")
        .eq("user_id", user.id)
        .in("status", ["canceled", "incomplete_expired", "unpaid"])
        .order("current_period_end", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const candidates: Array<{
      tier: SubscriptionTier;
      source: "comp" | "stripe";
      endedAt: string;
    }> = [];
    if (recentComp?.expires_at) {
      const endedMs = new Date(recentComp.expires_at as string).getTime();
      if (!Number.isNaN(endedMs) && endedMs <= now && now - endedMs <= windowMs) {
        candidates.push({
          tier: recentComp.tier as SubscriptionTier,
          source: "comp",
          endedAt: recentComp.expires_at as string,
        });
      }
    }
    if (recentSub?.current_period_end) {
      const endedMs = new Date(recentSub.current_period_end as string).getTime();
      if (!Number.isNaN(endedMs) && endedMs <= now && now - endedMs <= windowMs) {
        candidates.push({
          tier: recentSub.tier as SubscriptionTier,
          source: "stripe",
          endedAt: recentSub.current_period_end as string,
        });
      }
    }
    const newest = candidates.sort((a, b) =>
      a.endedAt < b.endedAt ? 1 : -1,
    )[0];
    if (newest) {
      return {
        tier: newest.tier,
        source: newest.source,
        expiresAt: newest.endedAt,
        state: "expired",
        daysLeft: 0,
      };
    }
  }

  return null;
}
