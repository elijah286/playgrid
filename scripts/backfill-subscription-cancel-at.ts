// One-off: reconcile public.subscriptions.cancel_at with Stripe.
//
// Before migration 20260518140000, we silently dropped Stripe's
// `subscription.cancel_at` field. This script walks every DB subscription
// row that has a stripe_subscription_id, retrieves the current Stripe state,
// and updates cancel_at + cancel_at_period_end if they differ.
//
// Idempotent — only writes rows where the values actually differ. Safe to
// re-run.
//
// Run with: npx tsx scripts/backfill-subscription-cancel-at.ts
//
// Stripe secret is read from site_settings.stripe_secret_key (matches the
// runtime webhook path), not from env.

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import Stripe from "stripe";

config({ path: "/Users/elijahkerry/playbook/.env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE env vars");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  const { data: settings, error: settingsErr } = await sb
    .from("site_settings")
    .select("stripe_secret_key")
    .eq("id", "default")
    .maybeSingle();
  if (settingsErr) throw settingsErr;
  const stripeSecret = settings?.stripe_secret_key as string | null;
  if (!stripeSecret) {
    console.error("No stripe_secret_key in site_settings");
    process.exit(1);
  }
  const stripe = new Stripe(stripeSecret);

  const { data: rows, error } = await sb
    .from("subscriptions")
    .select(
      "id, stripe_subscription_id, status, cancel_at, cancel_at_period_end",
    )
    .not("stripe_subscription_id", "is", null)
    .order("created_at", { ascending: true });
  if (error) throw error;

  let scanned = 0;
  let updated = 0;
  let unchanged = 0;
  let missingInStripe = 0;
  let errors = 0;
  const changes: Array<{
    sub: string;
    before: { cancel_at: string | null; cancel_at_period_end: boolean };
    after: { cancel_at: string | null; cancel_at_period_end: boolean };
  }> = [];

  for (const row of rows ?? []) {
    scanned++;
    const subId = row.stripe_subscription_id as string;
    let stripeSub: Stripe.Subscription;
    try {
      stripeSub = await stripe.subscriptions.retrieve(subId);
    } catch (e) {
      if (e instanceof Stripe.errors.StripeError && e.code === "resource_missing") {
        missingInStripe++;
        console.warn(`[skip] ${subId}: not found in Stripe`);
        continue;
      }
      errors++;
      console.error(`[error] ${subId}:`, e instanceof Error ? e.message : e);
      continue;
    }

    const dbCancelAt = (row.cancel_at as string | null) ?? null;
    const dbCancelAtPeriodEnd = Boolean(row.cancel_at_period_end);
    const stripeCancelAt = stripeSub.cancel_at
      ? new Date(stripeSub.cancel_at * 1000).toISOString()
      : null;
    const stripeCancelAtPeriodEnd = stripeSub.cancel_at_period_end ?? false;

    const cancelAtDiffers = dbCancelAt !== stripeCancelAt;
    const periodEndFlagDiffers = dbCancelAtPeriodEnd !== stripeCancelAtPeriodEnd;
    if (!cancelAtDiffers && !periodEndFlagDiffers) {
      unchanged++;
      continue;
    }

    const { error: uErr } = await sb
      .from("subscriptions")
      .update({
        cancel_at: stripeCancelAt,
        cancel_at_period_end: stripeCancelAtPeriodEnd,
      })
      .eq("id", row.id as string);
    if (uErr) {
      errors++;
      console.error(`[update failed] ${subId}: ${uErr.message}`);
      continue;
    }
    updated++;
    changes.push({
      sub: subId,
      before: { cancel_at: dbCancelAt, cancel_at_period_end: dbCancelAtPeriodEnd },
      after: { cancel_at: stripeCancelAt, cancel_at_period_end: stripeCancelAtPeriodEnd },
    });
    console.log(
      `[updated] ${subId}: cancel_at ${dbCancelAt ?? "null"} → ${stripeCancelAt ?? "null"}, cancel_at_period_end ${dbCancelAtPeriodEnd} → ${stripeCancelAtPeriodEnd}`,
    );
  }

  console.log("\n=== summary ===");
  console.log({ scanned, updated, unchanged, missingInStripe, errors });
  if (changes.length > 0) {
    console.log("\nChanged rows:");
    for (const c of changes) console.log(JSON.stringify(c));
  }
}

void main().then(() => process.exit(0));
