/**
 * Feedback → site-admin notification wiring.
 *
 * A coach's feedback used to reach the founder by email only; a missed email
 * meant a cancellable bug report sat unanswered for days. Feedback now emits a
 * `system_notices` row (kind `feedback_received`) via DB triggers, which the
 * existing admin inbox + push pipeline surfaces. These tests defend the two
 * spots that silently break that pipeline:
 *
 *   1. Push wiring — the exact `play_milestone` footgun: a DB-emitted kind that
 *      is NOT in ADMIN_PUSH_NOTICE_KINDS is written to the feed but never pushed
 *      to a device, and adminPushMessage would fall to its generic default.
 *   2. Migration shape — the constraint must admit the new kind and a trigger
 *      must fire on every feedback source, or no notice is ever written.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ADMIN_PUSH_NOTICE_KINDS,
  adminPushMessage,
} from "./inbox-dispatch";

const MIGRATION = readFileSync(
  join(process.cwd(), "supabase/migrations/20260626120000_feedback_admin_notices.sql"),
  "utf8",
);

describe("feedback → admin push wiring", () => {
  it("feedback_received is in the device-push allow-list", () => {
    // If this drops off, feedback lands in the in-app feed but never pushes —
    // the founder only sees it if they happen to open the app.
    expect(ADMIN_PUSH_NOTICE_KINDS).toContain("feedback_received");
  });

  it("adminPushMessage renders feedback_received with its own copy, not the default", () => {
    const msg = adminPushMessage({
      id: "n1",
      kind: "feedback_received",
      body: "Joseph sent feedback: “the program is great but it’s very buggy”",
      user_display_name: "Joseph",
      user_email: "joseph@example.com",
      href: "/settings?tab=feedback",
    });
    expect(msg.title).toBe("New feedback 📣");
    // Body is already self-contained (who + excerpt) — surfaced verbatim.
    expect(msg.body).toContain("Joseph sent feedback");
    expect(msg.body).toContain("very buggy");
    expect(msg.link).toBe("/settings?tab=feedback");
    // Stand-out push: must pierce Focus / DND on iOS.
    expect(msg.interruptionLevel).toBe("time-sensitive");
  });

  it("adminPushMessage falls back to a sane link when href is null", () => {
    const msg = adminPushMessage({
      id: "n2",
      kind: "feedback_received",
      body: "Someone sent feedback: “hi”",
      user_display_name: null,
      user_email: null,
      href: null,
    });
    expect(msg.link).toBe("/settings?tab=feedback");
  });
});

describe("feedback notice migration shape", () => {
  it("admits the feedback_received kind in the system_notices constraint", () => {
    expect(MIGRATION).toMatch(/add constraint system_notices_kind_check[\s\S]*'feedback_received'/);
  });

  it("fires an AFTER INSERT trigger on every feedback source", () => {
    for (const table of ["public.feedback", "public.subscription_cancellation_feedback"]) {
      expect(MIGRATION).toContain(`after insert on ${table}`);
    }
  });

  it("each trigger function writes a feedback_received notice", () => {
    const inserts = MIGRATION.match(/insert into public\.system_notices/g) ?? [];
    expect(inserts.length).toBe(2);
    const kinds = MIGRATION.match(/'feedback_received'/g) ?? [];
    // One in the constraint + one per trigger-function insert.
    expect(kinds.length).toBeGreaterThanOrEqual(3);
  });

  it("both trigger functions are SECURITY DEFINER", () => {
    // Load-bearing: system_notices has no INSERT RLS policy, so a function
    // running as the (non-admin) inserting coach would be denied. SECURITY
    // DEFINER is what lets the trigger write the notice. Two functions ->
    // two declarations (strip comments so prose mentions don't inflate count).
    const sqlOnly = MIGRATION.replace(/--[^\n]*/g, "");
    const defs = sqlOnly.match(/security definer/gi) ?? [];
    expect(defs.length).toBe(2);
  });

  it("deep-links each feedback source to the tab that actually shows it", () => {
    // Widget + contact land in the Feedback tab; cancellation free-text renders
    // on the Payments tab (CancellationFeedbackSection), not Users.
    expect(MIGRATION).toContain("'/settings?tab=feedback'");
    expect(MIGRATION).toContain("'/settings?tab=payments'");
    expect(MIGRATION).not.toContain("'/settings?tab=users'");
  });
});
