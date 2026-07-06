// Referral awards — minted when an ATTRIBUTED new user ACTIVATES.
//
// Redesign (2026-07, per the referral audit). The old model awarded only on a
// copy-link claim by a zero-playbook user, and paid the sender comp days that
// were worthless to the ~10 paying coaches who were the only eligible senders.
// This version fixes all three flaws:
//
//   * Attribution — profiles.referred_by is the canonical sender edge, set once
//     at signup (?ref= / copy-link / invite) or backfilled at first copy-claim
//     / invite-accept (see setReferredByIfEmpty). One referrer per user.
//
//   * Qualifying event — the referred user ACTIVATES: owns >=1 non-tutorial
//     play, or is an active member of a playbook they don't own (team-graph
//     activation). Fires for copy links, ?ref= site links, AND invites — not
//     just the rare zero-playbook copy claim.
//
//   * Reward — a PAYING sender (active Stripe sub) gets a Stripe balance credit
//     (~one month); a comp grant would be worthless to them. A FREE sender gets
//     comp Team Coach days (a real unlock). The recipient is double-sided: a new
//     coach gets Team Coach trial days (time, not content).
//
// Idempotency: referral_awards.recipient_id is UNIQUE. We RESERVE that row
// before any money moves, so a race or replay can never double-credit. First
// activation wins; the unique constraint is the hard guarantee.

import { createServiceRoleClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getReferralConfig,
  isReferralActiveForUser,
  type ReferralConfig,
} from "@/lib/site/referral-config";
import { getStripeClient } from "@/lib/billing/stripe";
import { getStripeConfig } from "@/lib/site/stripe-config";
import { notifyUser } from "@/lib/notifications/inbox-dispatch";

type Admin = SupabaseClient;

export type ReferralAwardResult =
  | {
      awarded: true;
      rewardKind: "comp_days" | "stripe_credit";
      senderDays: number;
      senderCreditCents: number;
      recipientDays: number;
    }
  | { awarded: false; reason: string };

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type RewardDecision =
  | { award: false; reason: string }
  | {
      award: true;
      kind: "stripe_credit";
      creditCents: number;
      compDays: 0;
      recipientDays: number;
    }
  | {
      award: true;
      kind: "comp_days";
      creditCents: 0;
      compDays: number;
      recipientDays: number;
    };

/**
 * Pure reward decision — no DB, no Stripe, fully unit-testable. Given the config
 * and the sender's context, decide WHAT to award (or why not). The orchestrator
 * gathers the context and executes the decision; this holds the money math so it
 * can be tested in isolation.
 *
 * A paying sender earns a Stripe credit; a free sender earns comp days. If a
 * payer has no usable credit amount (no fixed cents, no price), we fall back to
 * comp days rather than award $0. Caps: capAwards bounds the count for both
 * kinds; capDays additionally bounds cumulative comp days for the free branch.
 */
export function decideReferralReward(
  config: ReferralConfig,
  ctx: {
    isPayer: boolean;
    /** coach monthly price in cents, for a payer on the "auto" credit setting. */
    autoPriceCents: number | null;
    /** rewarded referrals this sender already has (for capAwards). */
    priorAwardCount: number;
    /** comp days this sender already earned (for the legacy capDays). */
    priorCompDaysAwarded: number;
  },
): RewardDecision {
  if (
    config.capAwards !== null &&
    ctx.priorAwardCount >= config.capAwards
  ) {
    return { award: false, reason: "sender-at-award-cap" };
  }

  const recipientDays = Math.max(0, config.recipientTrialDays);

  if (ctx.isPayer) {
    const amount =
      config.payerCreditCents !== null
        ? config.payerCreditCents
        : ctx.autoPriceCents;
    if (amount && amount > 0) {
      return {
        award: true,
        kind: "stripe_credit",
        creditCents: amount,
        compDays: 0,
        recipientDays,
      };
    }
    // No usable price → fall through to comp days rather than a $0 credit.
  }

  let compDays = config.daysPerAward;
  if (config.capDays !== null) {
    const remaining = config.capDays - ctx.priorCompDaysAwarded;
    if (remaining <= 0) return { award: false, reason: "sender-at-day-cap" };
    compDays = Math.min(config.daysPerAward, remaining);
  }
  return {
    award: true,
    kind: "comp_days",
    creditCents: 0,
    compDays,
    recipientDays,
  };
}

/**
 * Set profiles.referred_by only if it's currently null (first referrer wins)
 * and the referrer isn't the user themselves. Used by the copy-claim and
 * invite-accept flows to backfill attribution for users who signed up without
 * a ?ref= (e.g. via ChatGPT) and only later claimed a specific coach's link.
 */
export async function setReferredByIfEmpty(
  admin: Admin,
  userId: string,
  referrerId: string | null | undefined,
): Promise<void> {
  if (!referrerId || referrerId === userId) return;
  try {
    await admin
      .from("profiles")
      .update({ referred_by: referrerId })
      .eq("id", userId)
      .is("referred_by", null);
  } catch {
    // Best-effort — attribution backfill must never block the claim/accept.
  }
}

/** True iff the user has done something real: owns a non-tutorial play, or is
 *  an active non-owner member of a playbook (invited coach / player). */
async function isActivated(admin: Admin, userId: string): Promise<boolean> {
  const { data: mem } = await admin
    .from("playbook_members")
    .select("playbook_id, role")
    .eq("user_id", userId)
    .eq("status", "active");
  const rows = mem ?? [];
  if (rows.some((r) => (r.role as string) !== "owner")) return true;
  const ownedPlaybookIds = rows
    .filter((r) => (r.role as string) === "owner")
    .map((r) => r.playbook_id as string);
  if (ownedPlaybookIds.length === 0) return false;
  const { data: play } = await admin
    .from("plays")
    .select("id")
    .in("playbook_id", ownedPlaybookIds)
    .eq("is_tutorial", false)
    .limit(1)
    .maybeSingle();
  return Boolean(play);
}

/** The sender's Stripe customer id iff they hold an active PAYING subscription
 *  (so a balance credit will actually offset a future invoice). Null → treat as
 *  a free sender and award comp days instead. */
async function payingCustomerId(
  admin: Admin,
  senderId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("subscriptions")
    .select("stripe_customer_id, tier, status, current_period_end")
    .eq("user_id", senderId)
    .in("status", ["active", "trialing", "past_due"])
    .not("stripe_customer_id", "is", null)
    .in("tier", ["coach", "coach_ai"])
    .order("current_period_end", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  return (data?.stripe_customer_id as string | null) ?? null;
}

/** One month of the coach monthly price, in cents, from Stripe. Null if the
 *  price isn't configured or Stripe is unreachable. */
async function coachMonthPriceCents(): Promise<number | null> {
  try {
    const cfg = await getStripeConfig();
    const priceId = cfg.priceIds.coach_month;
    if (!priceId) return null;
    const { stripe } = await getStripeClient();
    const price = await stripe.prices.retrieve(priceId);
    return typeof price.unit_amount === "number" ? price.unit_amount : null;
  } catch {
    return null;
  }
}

/** Mint (or extend the latest active referral) comp_grant of Team Coach days.
 *  Mirrors the pre-redesign stacking behavior for the free-sender branch. */
async function grantCompDays(
  admin: Admin,
  userId: string,
  days: number,
  notedReason: string,
): Promise<string | null> {
  const addMs = days * MS_PER_DAY;
  const { data: existing } = await admin
    .from("comp_grants")
    .select("id, expires_at")
    .eq("user_id", userId)
    .eq("tier", "coach")
    .is("revoked_at", null)
    .like("note", `${notedReason}%`)
    .order("expires_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (
    existing?.expires_at &&
    new Date(existing.expires_at as string).getTime() > Date.now()
  ) {
    const newExpiry = new Date(
      new Date(existing.expires_at as string).getTime() + addMs,
    ).toISOString();
    const { error } = await admin
      .from("comp_grants")
      .update({ expires_at: newExpiry })
      .eq("id", existing.id);
    if (error) throw new Error(`extend-grant-failed: ${error.message}`);
    return existing.id as string;
  }

  const { data: grant, error } = await admin
    .from("comp_grants")
    .insert({
      user_id: userId,
      tier: "coach",
      note: `${notedReason} (+${days}d)`,
      granted_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + addMs).toISOString(),
    })
    .select("id")
    .single();
  if (error || !grant) {
    throw new Error(`insert-grant-failed: ${error?.message ?? "no row"}`);
  }
  return grant.id as string;
}

/**
 * Attempt to award a referral because `recipientId` just activated. Safe to
 * call after any activation event (play created, copy claimed, invite accepted)
 * — no-ops when the feature is off, the user wasn't referred, they've already
 * minted an award, they aren't actually activated, or the sender is at cap.
 *
 * Creates its own service-role client (comp_grants / referral_awards / Stripe
 * are not reachable from an RLS session). Never throws — callers fire it
 * best-effort so a reward failure can't block the user's action.
 */
export async function maybeAwardReferralOnActivation(args: {
  recipientId: string;
  /** Which activation fired this attempt — recorded as the award source for
   *  the Virality tab. Defaults to "activation". */
  trigger?: "play_created" | "copy_claim" | "invite_accept";
}): Promise<ReferralAwardResult> {
  const { recipientId, trigger } = args;
  try {
    const config = await getReferralConfig();
    // Fast path: fully off (no global toggle, no staged test cohort) → nothing
    // to do, and no extra queries on the hot play-creation path.
    if (!config.enabled && config.testEmails.length === 0) {
      return { awarded: false, reason: "disabled" };
    }

    const admin = createServiceRoleClient();

    // Who referred this user?
    const { data: profile } = await admin
      .from("profiles")
      .select("referred_by")
      .eq("id", recipientId)
      .maybeSingle();
    const senderId = (profile?.referred_by as string | null) ?? null;
    if (!senderId) return { awarded: false, reason: "no-referrer" };
    if (senderId === recipientId) return { awarded: false, reason: "self-referral" };

    // The program must be active for THIS sender: either globally enabled, or
    // the sender is in the staged-rollout test cohort. Lets us validate the
    // real reward paths with a few accounts before enabling for everyone.
    if (!(await isReferralActiveForUser(config, senderId))) {
      return { awarded: false, reason: "not-active-for-sender" };
    }

    // Already credited? (recipient_id is unique — cheap pre-check for a clean
    // reason; the constraint is the real guarantee at reserve time.)
    const { data: existingAward } = await admin
      .from("referral_awards")
      .select("id")
      .eq("recipient_id", recipientId)
      .maybeSingle();
    if (existingAward) return { awarded: false, reason: "already-credited" };

    if (!(await isActivated(admin, recipientId))) {
      return { awarded: false, reason: "not-activated" };
    }

    // Gather context for the pure reward decision. Decide the branch (and
    // enforce caps) BEFORE reserving — a reserved-but-unrewarded slot would
    // waste the recipient's one-shot.
    let priorAwardCount = 0;
    if (config.capAwards !== null) {
      const { count } = await admin
        .from("referral_awards")
        .select("id", { count: "exact", head: true })
        .eq("sender_id", senderId);
      priorAwardCount = count ?? 0;
    }

    const customerId = await payingCustomerId(admin, senderId);
    const isPayer = customerId !== null;
    const autoPriceCents =
      isPayer && config.payerCreditCents === null
        ? await coachMonthPriceCents()
        : null;

    let priorCompDaysAwarded = 0;
    if (!isPayer && config.capDays !== null) {
      const { data: totals } = await admin
        .from("referral_awards")
        .select("days_awarded")
        .eq("sender_id", senderId);
      priorCompDaysAwarded = (totals ?? []).reduce(
        (acc, r: { days_awarded: number | null }) => acc + (r.days_awarded ?? 0),
        0,
      );
    }

    const decision = decideReferralReward(config, {
      isPayer,
      autoPriceCents,
      priorAwardCount,
      priorCompDaysAwarded,
    });
    if (!decision.award) return { awarded: false, reason: decision.reason };

    const source = trigger ?? "activation";

    // RESERVE the one-per-recipient slot before any money moves. A unique
    // violation here means a concurrent activation beat us — bail cleanly.
    const { data: reservation, error: reserveErr } = await admin
      .from("referral_awards")
      .insert({
        sender_id: senderId,
        recipient_id: recipientId,
        days_awarded: 0,
        source,
      })
      .select("id")
      .single();
    if (reserveErr || !reservation) {
      return { awarded: false, reason: "reserve-failed-or-race" };
    }

    const useStripe = decision.kind === "stripe_credit";
    let rewardCommitted = false;
    try {
      let compGrantId: string | null = null;
      let stripeTxnId: string | null = null;

      if (useStripe && customerId) {
        const { stripe } = await getStripeClient();
        const txn = await stripe.customers.createBalanceTransaction(customerId, {
          amount: -decision.creditCents, // negative = credit toward future invoices
          currency: "usd",
          description: "Referral reward — thanks for bringing a coach to XO Gridmaker",
          metadata: {
            reason: "referral_reward",
            sender_id: senderId,
            recipient_id: recipientId,
          },
        });
        stripeTxnId = txn.id;
        rewardCommitted = true; // money has moved — do NOT roll back past here
      } else {
        compGrantId = await grantCompDays(
          admin,
          senderId,
          decision.compDays,
          "Referral credit",
        );
        rewardCommitted = true;
      }

      // Recipient side (double-sided). Non-fatal: a failure here shouldn't undo
      // the sender's reward.
      let recipientDays = 0;
      let recipientGrantId: string | null = null;
      if (decision.recipientDays > 0) {
        try {
          recipientGrantId = await grantCompDays(
            admin,
            recipientId,
            decision.recipientDays,
            "Referral welcome trial",
          );
          recipientDays = decision.recipientDays;
        } catch {
          recipientDays = 0;
          recipientGrantId = null;
        }
      }

      await admin
        .from("referral_awards")
        .update({
          days_awarded: decision.compDays,
          reward_kind: decision.kind,
          credit_cents: useStripe ? decision.creditCents : null,
          stripe_balance_txn_id: stripeTxnId,
          comp_grant_id: compGrantId,
          recipient_days_awarded: recipientDays,
          recipient_comp_grant_id: recipientGrantId,
        })
        .eq("id", reservation.id);

      await notifyReferralMinted(admin, senderId, {
        useStripe,
        compDays: decision.compDays,
        creditCents: decision.creditCents,
      }).catch(() => {});
      await recordAwardEvent(admin, senderId, recipientId, {
        useStripe,
        compDays: decision.compDays,
        creditCents: decision.creditCents,
        recipientDays,
      }).catch(() => {});

      return {
        awarded: true,
        rewardKind: decision.kind,
        senderDays: decision.compDays,
        senderCreditCents: useStripe ? decision.creditCents : 0,
        recipientDays,
      };
    } catch (err) {
      // Only roll back the reservation if NO reward was committed — otherwise
      // freeing the slot would let a retry double-spend the credit we just gave.
      if (!rewardCommitted) {
        try {
          await admin.from("referral_awards").delete().eq("id", reservation.id);
        } catch {
          /* leave the reservation; a stuck slot is safer than a double-spend */
        }
      }
      return {
        awarded: false,
        reason: `reward-failed: ${err instanceof Error ? err.message : "unknown"}`,
      };
    }
  } catch {
    return { awarded: false, reason: "unexpected-error" };
  }
}

/** Best-effort push to the sender that a reward landed (R6). */
async function notifyReferralMinted(
  admin: Admin,
  senderId: string,
  reward: { useStripe: boolean; compDays: number; creditCents: number },
): Promise<void> {
  const body = reward.useStripe
    ? `A coach you referred just got started — $${(reward.creditCents / 100).toFixed(0)} credit applied to your next invoice.`
    : `A coach you referred just got started — ${reward.compDays} days of Team Coach added to your account.`;
  await notifyUser({
    admin,
    userId: senderId,
    category: "account",
    message: { title: "Referral reward earned 🎉", body, link: "/account" },
  });
}

/** Best-effort funnel event for the admin Virality tab (R7). */
async function recordAwardEvent(
  admin: Admin,
  senderId: string,
  recipientId: string,
  reward: {
    useStripe: boolean;
    compDays: number;
    creditCents: number;
    recipientDays: number;
  },
): Promise<void> {
  await admin.from("ui_events").insert({
    session_id: `server:referral:${recipientId}`,
    user_id: senderId,
    path: "/account",
    event_name: "referral_award_minted",
    metadata: {
      recipient_id: recipientId,
      reward_kind: reward.useStripe ? "stripe_credit" : "comp_days",
      sender_days: reward.useStripe ? 0 : reward.compDays,
      sender_credit_cents: reward.useStripe ? reward.creditCents : 0,
      recipient_days: reward.recipientDays,
    },
  });
}
