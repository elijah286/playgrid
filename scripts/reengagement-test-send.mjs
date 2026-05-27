#!/usr/bin/env node
/**
 * Test-send a re-engagement email.
 *
 * Sends ONE email to the target address (default: elijahkerry@icloud.com)
 * using a synthetic stalled-1-play user payload. Bypasses the cron's
 * eligibility query, the `reengagement_enabled` site flag, and the
 * `reengagement_sends` idempotency table — this script is for design
 * review, not for production sends.
 *
 * Defaults match a typical flag_5v5 coach who drew one Mesh play three
 * days ago. Override via flags if you want to preview the 10d variant
 * or a different sport variant.
 *
 *   node scripts/reengagement-test-send.mjs
 *   node scripts/reengagement-test-send.mjs --kind=10d
 *   node scripts/reengagement-test-send.mjs --variant=tackle_11
 *   node scripts/reengagement-test-send.mjs --to=somebody@example.com
 */
import { readFileSync } from "node:fs";

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

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith("--"))
    .map((a) => {
      const eq = a.indexOf("=");
      return eq === -1 ? [a.slice(2), "true"] : [a.slice(2, eq), a.slice(eq + 1)];
    }),
);

const toEmail = args.to ?? "elijahkerry@icloud.com";
const kind = (args.kind ?? "3d");
if (kind !== "3d" && kind !== "10d") {
  console.error(`Invalid --kind: ${kind} (expected 3d or 10d)`);
  process.exit(1);
}
const variant = args.variant ?? "flag_5v5";
const existingPlay = args.existingPlay ?? "Mesh";

// Run via `npx tsx scripts/reengagement-test-send.mjs` so the TS
// imports resolve. This shares the actual production email + recs
// builders — avoids drift between test-send and the cron route.
const [{ sendReengagementEmail, startedOnLabel }, { buildRecommendations }] = await Promise.all([
  import("../src/lib/notifications/reengagement-email.ts"),
  import("../src/lib/notifications/reengagement-recs.ts"),
]);

const playCreatedAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
const recommendations = buildRecommendations({
  sportVariant: variant,
  excludeConcept: existingPlay,
});

if (recommendations.length === 0) {
  console.error("No recommendations resolved — check learnLink registry.");
  process.exit(1);
}

// Synthetic userId for the test send. The unsubscribe link will fail
// HMAC verification against the real user (since no such user exists),
// but the List-Unsubscribe headers will still be present — which is
// what the spam-filter check actually cares about.
const testUserId = args.userId ?? "00000000-0000-0000-0000-000000000000";

const res = await sendReengagementEmail({
  toEmail,
  userId: testUserId,
  firstName: "Coach",
  startedOnLabel: startedOnLabel(playCreatedAt),
  existingPlayName: existingPlay,
  playbookUrl: `${process.env.NEXT_PUBLIC_SITE_URL || "https://www.xogridmaker.com"}/playbooks/00000000-0000-0000-0000-000000000000`,
  recommendations,
  kind,
});

if (!res.ok) {
  console.error("Send failed:", res.error);
  process.exit(1);
}
console.log(`✓ Sent ${kind} re-engagement to ${toEmail}`);
console.log(`  variant=${variant}  existingPlay=${existingPlay}`);
console.log(`  recommendations: ${recommendations.map((r) => r.name).join(", ")}`);
console.log(`  messageId: ${res.messageId}`);
