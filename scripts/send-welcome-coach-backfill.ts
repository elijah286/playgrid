// One-off: retroactively send the Team Coach welcome email to coaches who
// purchased in the last 30 days but never received it (because the welcome
// email shipped after they subscribed).
//
// Eligibility mirrors the live webhook trigger exactly:
//   tier = 'coach'  AND  status IN ('active','trialing')
//   AND welcome_email_sent_at IS NULL
//   AND created_at >= now() - 30 days   (the "recently purchased" window)
//
// The companion migration stamps welcome_email_sent_at on every coach
// subscription OLDER than 30 days, so NULL here is precisely the recent
// cohort. Each send claims the row first (UPDATE ... welcome_email_sent_at)
// so this is idempotent and safe to re-run, and it can never collide with a
// live webhook send for the same subscription.
//
// DRY RUN BY DEFAULT — prints who would be emailed and exits. Pass --send to
// actually claim rows and dispatch via Resend.
//
//   Preview:  npx tsx scripts/send-welcome-coach-backfill.ts
//   Send:     npx tsx scripts/send-welcome-coach-backfill.ts --send
//
// Resend + Supabase config come from the same places the runtime uses:
// SUPABASE env vars for the DB client, site_settings.resend_* for Resend
// (read inside sendWelcomeCoachEmail).

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { sendWelcomeCoachEmail } from "@/lib/notifications/welcome-coach-email";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const SEND = process.argv.includes("--send");
const WINDOW_DAYS = 30;

const sb = createClient(url, key, { auth: { persistSession: false } });

async function firstNameFor(userId: string): Promise<string | null> {
  const { data: prof } = await sb
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();
  const displayName = (prof?.display_name as string | null) ?? null;
  return displayName ? displayName.trim().split(/\s+/)[0] || null : null;
}

async function emailFor(userId: string): Promise<string | null> {
  const { data } = await sb.auth.admin.getUserById(userId);
  return data?.user?.email ?? null;
}

async function main() {
  const cutoff = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: rows, error } = await sb
    .from("subscriptions")
    .select("id, user_id, stripe_subscription_id, created_at, status")
    .eq("tier", "coach")
    .in("status", ["active", "trialing"])
    .is("welcome_email_sent_at", null)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const eligible = rows ?? [];
  console.log(
    `Mode: ${SEND ? "SEND" : "DRY RUN"} — ${eligible.length} eligible coach subscription(s) in the last ${WINDOW_DAYS} days.\n`,
  );

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of eligible) {
    const userId = row.user_id as string;
    const subId = row.stripe_subscription_id as string | null;
    const email = await emailFor(userId);
    if (!email) {
      console.warn(`[skip] sub=${subId ?? row.id}: no email on auth user ${userId}`);
      skipped++;
      continue;
    }
    const firstName = await firstNameFor(userId);

    if (!SEND) {
      console.log(`[dry-run] would email ${email} (first=${firstName ?? "there"}, created=${row.created_at})`);
      continue;
    }

    // Claim the row atomically before sending, exactly like the webhook, so a
    // concurrent live send or a re-run can't double-send.
    const { data: claimed, error: claimErr } = await sb
      .from("subscriptions")
      .update({ welcome_email_sent_at: new Date().toISOString() })
      .eq("id", row.id as string)
      .is("welcome_email_sent_at", null)
      .select("id")
      .maybeSingle();
    if (claimErr) {
      console.error(`[error] claim failed for ${email}: ${claimErr.message}`);
      errors++;
      continue;
    }
    if (!claimed) {
      console.log(`[skip] ${email}: already claimed (concurrent send or re-run)`);
      skipped++;
      continue;
    }

    const res = await sendWelcomeCoachEmail({ toEmail: email, firstName });
    if (!res.ok) {
      // Leave the claim in place — matches the webhook's "don't double-send on
      // transient Resend failure" stance. Re-running won't retry this row.
      console.error(`[error] send failed for ${email}: ${res.error}`);
      errors++;
      continue;
    }
    console.log(`[sent] ${email} (id=${res.messageId})`);
    sent++;
  }

  console.log("\n=== summary ===");
  console.log({ mode: SEND ? "send" : "dry-run", eligible: eligible.length, sent, skipped, errors });
  if (!SEND && eligible.length > 0) {
    console.log("\nRe-run with --send to dispatch these emails.");
  }
}

void main().then(() => process.exit(0));
