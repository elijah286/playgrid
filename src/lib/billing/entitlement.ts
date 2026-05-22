import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export type SubscriptionTier = "free" | "coach" | "coach_ai";
export type EntitlementSource = "comp" | "stripe" | "free";

export type Entitlement = {
  userId: string;
  tier: SubscriptionTier;
  source: EntitlementSource;
  expiresAt: string | null;
  compGrantId: string | null;
  subscriptionId: string | null;
};

const FREE: Omit<Entitlement, "userId"> = {
  tier: "free",
  source: "free",
  expiresAt: null,
  compGrantId: null,
  subscriptionId: null,
};

function fromRow(userId: string, row: Record<string, unknown> | null): Entitlement {
  if (!row) return { userId, ...FREE };
  return {
    userId,
    tier: (row.tier as SubscriptionTier) ?? "free",
    source: (row.source as EntitlementSource) ?? "free",
    expiresAt: (row.expires_at as string | null) ?? null,
    compGrantId: (row.comp_grant_id as string | null) ?? null,
    subscriptionId: (row.subscription_id as string | null) ?? null,
  };
}

/** Entitlement for the currently authenticated user. Returns free if unauthenticated. */
export async function getCurrentEntitlement(): Promise<Entitlement | null> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return null;
  const { data } = await supabase
    .from("user_entitlements")
    .select("tier, source, expires_at, comp_grant_id, subscription_id")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  return fromRow(auth.user.id, data);
}

/** Entitlement for any user (admin/server use). Uses service role — never call from client code paths that leak data. */
export async function getUserEntitlement(userId: string): Promise<Entitlement> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("user_entitlements")
    .select("tier, source, expires_at, comp_grant_id, subscription_id")
    .eq("user_id", userId)
    .maybeSingle();
  return fromRow(userId, data);
}

/**
 * True iff this user has ever had a `coach_ai` Stripe subscription (any
 * status — `active`, `canceled`, `trialing`, `incomplete_expired`, etc.).
 *
 * This is the same gate `createCheckoutSessionAction` uses to decide
 * whether to grant the Coach Pro free trial — once you've held the
 * subscription once you can't get the trial again. Pulled out so the
 * UI can mirror the gate and hide trial CTAs / "no charge today"
 * footnotes from users who'd be billed in full at checkout.
 *
 * Returns false on any error so we err on the side of *showing* trial
 * copy — Stripe will still refuse to grant the trial server-side, but
 * the UI won't have over-promised.
 */
export async function hasUsedCoachProTrial(userId: string): Promise<boolean> {
  try {
    const admin = createServiceRoleClient();
    const { data } = await admin
      .from("subscriptions")
      .select("id")
      .eq("user_id", userId)
      .eq("tier", "coach_ai")
      .limit(1)
      .maybeSingle();
    return Boolean(data);
  } catch {
    return false;
  }
}
