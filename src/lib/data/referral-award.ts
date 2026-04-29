// Award referral credit when a new user claims a sender's copy link.
//
// Idempotency: referral_awards.recipient_id is unique. If a recipient
// has already minted any referral award (from any sender, any source),
// no further award is created. This kills both farming paths:
//   - sender re-sending to the same recipient
//   - recipient claiming multiple copy links from different senders
// First valid claim wins; later ones silently no-op.
//
// "New user" definition lives here, not the schema: a recipient counts
// as new iff they own zero non-default playbooks at the moment they
// claim. The new playbook from the claim hasn't been counted yet — the
// caller invokes this AFTER inserting it. We pass the post-claim count
// so we don't have to time the call against the insert.
//
// Self-referral guard: senders cannot earn credit by claiming their own
// link. Hard-coded — no admin toggle, no edge case.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getReferralConfig } from "@/lib/site/referral-config";

export type ReferralAwardResult =
  | { awarded: true; daysAdded: number; compGrantId: string }
  | { awarded: false; reason: string };

/**
 * Try to award a referral credit. Safe to call after every successful
 * copy-link claim — silently no-ops when the feature is off, the
 * recipient isn't new, the pair has already minted an award, or the
 * sender has hit the lifetime cap.
 *
 * Must be called with a service-role client — the recipient lacks
 * permissions to insert into comp_grants or referral_awards. Awarding
 * runs after the claim finishes so a failure here never blocks the
 * recipient from getting their playbook.
 */
export async function awardReferralIfApplicable(
  serviceClient: SupabaseClient,
  args: {
    senderId: string;
    recipientId: string;
    /** Owned non-default playbooks the recipient had BEFORE this claim. */
    recipientOwnedBeforeClaim: number;
  },
): Promise<ReferralAwardResult> {
  const { senderId, recipientId, recipientOwnedBeforeClaim } = args;

  if (senderId === recipientId) {
    return { awarded: false, reason: "self-referral" };
  }

  const config = await getReferralConfig();
  if (!config.enabled) return { awarded: false, reason: "disabled" };

  if (recipientOwnedBeforeClaim > 0) {
    return { awarded: false, reason: "recipient-not-new" };
  }

  // Idempotent: the unique constraint will reject duplicates anyway, but
  // checking first lets us return a clean reason instead of bubbling a
  // 23505 error. Race: if two claims sneak through between check and
  // insert, the unique constraint is the actual guarantee.
  const existing = await serviceClient
    .from("referral_awards")
    .select("id")
    .eq("recipient_id", recipientId)
    .maybeSingle();
  if (existing.data) {
    return { awarded: false, reason: "recipient-already-credited" };
  }

  // Cap check: cumulative days awarded to this sender so far.
  let awardDays = config.daysPerAward;
  if (config.capDays !== null) {
    const totals = await serviceClient
      .from("referral_awards")
      .select("days_awarded")
      .eq("sender_id", senderId);
    const earned = (totals.data ?? []).reduce(
      (acc, row: { days_awarded: number | null }) =>
        acc + (row.days_awarded ?? 0),
      0,
    );
    const remaining = config.capDays - earned;
    if (remaining <= 0) {
      return { awarded: false, reason: "sender-at-cap" };
    }
    awardDays = Math.min(config.daysPerAward, remaining);
  }

  // Find the sender's most-distant active referral comp_grant. If one
  // exists and isn't expired, extend it. Otherwise mint a new one. This
  // keeps the entitlement view (which picks the latest expires_at)
  // accurate and prevents earlier grants from going unused.
  const nowIso = new Date().toISOString();
  const existingGrant = await serviceClient
    .from("comp_grants")
    .select("id, expires_at")
    .eq("user_id", senderId)
    .eq("tier", "coach")
    .is("revoked_at", null)
    .like("note", "Referral credit%")
    .order("expires_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  let compGrantId: string;
  const addMs = awardDays * 24 * 60 * 60 * 1000;

  if (
    existingGrant.data &&
    existingGrant.data.expires_at &&
    new Date(existingGrant.data.expires_at as string).getTime() > Date.now()
  ) {
    const newExpiry = new Date(
      new Date(existingGrant.data.expires_at as string).getTime() + addMs,
    ).toISOString();
    const { error: updErr } = await serviceClient
      .from("comp_grants")
      .update({ expires_at: newExpiry })
      .eq("id", existingGrant.data.id);
    if (updErr) {
      return { awarded: false, reason: `extend-grant-failed: ${updErr.message}` };
    }
    compGrantId = existingGrant.data.id as string;
  } else {
    const newExpiry = new Date(Date.now() + addMs).toISOString();
    const { data: grant, error: insErr } = await serviceClient
      .from("comp_grants")
      .insert({
        user_id: senderId,
        tier: "coach",
        note: `Referral credit (+${awardDays}d)`,
        granted_at: nowIso,
        expires_at: newExpiry,
      })
      .select("id")
      .single();
    if (insErr || !grant) {
      return { awarded: false, reason: `insert-grant-failed: ${insErr?.message}` };
    }
    compGrantId = grant.id as string;
  }

  const { error: awardErr } = await serviceClient
    .from("referral_awards")
    .insert({
      sender_id: senderId,
      recipient_id: recipientId,
      days_awarded: awardDays,
      comp_grant_id: compGrantId,
      source: "copy_link",
    });
  if (awardErr) {
    // Unique-violation on recipient_id means a concurrent claim beat us
    // here. The grant we just minted is technically a leak, but small
    // (one extension's worth of days) and only happens under a real
    // race — not worth a transaction round-trip to compensate.
    return { awarded: false, reason: `award-insert-failed: ${awardErr.message}` };
  }

  return { awarded: true, daysAdded: awardDays, compGrantId };
}
