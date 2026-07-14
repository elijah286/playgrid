#!/usr/bin/env node
/**
 * Send a TEST push notification to every site admin — a quick way to confirm
 * the native push path (and the new app-icon badge) is working end to end.
 *
 * Runs the REAL production send path (`sendPushToUsers`), so the notification
 * that lands is byte-for-byte what a coach would get, badge included. Because
 * the send is best-effort and idempotent, it's safe to re-run.
 *
 * Reads prod credentials from ~/playbook/.env.local (same as the other
 * test-send scripts) — SUPABASE_SERVICE_ROLE_KEY + the APNs/FCM config it
 * loads from the DB. NEVER commit those; this only reads them at runtime.
 *
 * SAFETY: dry-run by default — it prints who it *would* notify and exits.
 * Pass --send to actually deliver.
 *
 *   npx tsx scripts/send-admin-test-notification.ts            # dry run (lists admins)
 *   npx tsx scripts/send-admin-test-notification.ts --send     # really send to all admins
 *
 * NOTE ON THE RED BANG: the app-icon badge mirrors the COACH inbox (RSVPs,
 * join/coach requests, roster claims, shares, billing) — not admin operational
 * notices. So this push shows a banner, and its badge number equals each
 * admin's own coach-inbox count. To see the red bang increment specifically,
 * create a coach inbox item (e.g. send yourself a playbook copy, or have a
 * second account request to join a playbook you own).
 */
import { readFileSync } from "node:fs";

// Load ~/playbook/.env.local into process.env (without clobbering anything
// already set), mirroring scripts/reengagement-test-send.mjs.
try {
  const envPath = `${process.env.HOME}/playbook/.env.local`;
  const env = Object.fromEntries(
    readFileSync(envPath, "utf8")
      .split("\n")
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, "")];
      }),
  );
  for (const [k, v] of Object.entries(env)) {
    if (!process.env[k]) process.env[k] = v;
  }
} catch {
  // No local env file — fall back to whatever is already in process.env.
}

const send = process.argv.includes("--send");

async function main() {
  const { createServiceRoleClient } = await import("../src/lib/supabase/admin");
  const { sendPushToUsers } = await import("../src/lib/notifications/push");

  const admin = createServiceRoleClient();

  const { data: admins, error } = await admin
    .from("profiles")
    .select("id, display_name")
    .eq("role", "admin");
  if (error) {
    console.error("Failed to load admins:", error.message);
    process.exit(1);
  }
  const adminIds = (admins ?? []).map((a: { id: string }) => a.id);
  if (adminIds.length === 0) {
    console.error("No site admins found (profiles.role = 'admin').");
    process.exit(1);
  }

  console.log(`Found ${adminIds.length} site admin(s):`);
  for (const a of admins ?? []) {
    console.log(`  - ${(a as { display_name: string | null }).display_name ?? "(no name)"} [${(a as { id: string }).id}]`);
  }

  const message = {
    title: "🔔 Test notification",
    body: "Test of XO Gridmaker push + app-icon badge — you can ignore this.",
    link: "/admin/users",
  };

  if (!send) {
    console.log("\nDRY RUN — nothing sent. Re-run with --send to deliver.");
    console.log("Payload:", JSON.stringify(message));
    return;
  }

  const res = await sendPushToUsers({
    admin,
    userIds: adminIds,
    category: "admin_ops",
    message,
  });
  console.log(
    `\nSent. configured=${res.configured} delivered=${res.delivered} device(s).`,
  );
  if (!res.configured) {
    console.log(
      "Push isn't configured in this env (no APNs config in site_settings and no FCM creds) — nothing was delivered.",
    );
  } else if (res.delivered === 0) {
    console.log(
      "0 devices — admins may have no registered device tokens, or opted out of the 'admin_ops' category.",
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
