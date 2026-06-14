import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  getUserEntitlement,
  type EntitlementSource,
  type SubscriptionTier,
} from "./entitlement";

// Cross-store billing snapshot. The single helper both the web checkout guard
// and the iOS purchase offer consult so a user is never billed on two stores at
// once, and the "manage plan" surface knows where to send them.

const ACTIVE_STRIPE_STATUSES = ["active", "trialing", "past_due"];
const ACTIVE_APPLE_STATUSES = ["active", "trialing", "in_grace_period"];

export type BillingStatus = {
  tier: SubscriptionTier;
  source: EntitlementSource;
  hasActiveStripe: boolean;
  hasActiveApple: boolean;
  hasComp: boolean;
  /**
   * True when there is no active *paid* subscription on either store, so a new
   * checkout/purchase won't double-bill. Comp grants don't bill, so they do NOT
   * block a user from converting to a real paid plan.
   */
  canStartPaidCheckout: boolean;
  /** Which store manages the active paid sub — drives the "manage plan" branch. */
  managedBy: "stripe" | "apple" | null;
};

export async function getBillingStatus(userId: string): Promise<BillingStatus> {
  const admin = createServiceRoleClient();
  const [entitlement, stripeRes, appleRes] = await Promise.all([
    getUserEntitlement(userId),
    admin
      .from("subscriptions")
      .select("id")
      .eq("user_id", userId)
      .in("status", ACTIVE_STRIPE_STATUSES)
      .limit(1)
      .maybeSingle(),
    admin
      .from("iap_subscriptions")
      .select("id")
      .eq("user_id", userId)
      .in("status", ACTIVE_APPLE_STATUSES)
      .limit(1)
      .maybeSingle(),
  ]);

  const hasActiveStripe = Boolean(stripeRes.data);
  const hasActiveApple = Boolean(appleRes.data);

  return {
    tier: entitlement.tier,
    source: entitlement.source,
    hasActiveStripe,
    hasActiveApple,
    hasComp: entitlement.source === "comp",
    canStartPaidCheckout: !hasActiveStripe && !hasActiveApple,
    // Prefer stripe when (defensively) both exist — matches the entitlement
    // view's tie-break and keeps users on the richer self-serve portal.
    managedBy: hasActiveStripe ? "stripe" : hasActiveApple ? "apple" : null,
  };
}
