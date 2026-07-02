/**
 * Rating-nudge outcome → site-admin notification wiring.
 *
 * The rating nudge now reports what a coach did (left a review / dismissed) to
 * the admin inbox via a 'review_prompt' system_notices row. These tests defend
 * the two spots that silently break that:
 *
 *   1. Migration shape — the kind constraint must admit 'review_prompt', or
 *      every insert throws and no outcome is ever recorded.
 *   2. Push wiring — 'review_prompt' must stay OUT of ADMIN_PUSH_NOTICE_KINDS
 *      (it's in-app engagement telemetry like play_milestone, not a
 *      device-interrupt event) yet still render with its own inbox copy rather
 *      than the generic default.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ADMIN_PUSH_NOTICE_KINDS, adminPushMessage } from "./inbox-dispatch";

const MIGRATION = readFileSync(
  join(process.cwd(), "supabase/migrations/20260702130000_review_prompt_admin_notices.sql"),
  "utf8",
);

describe("review_prompt notice migration shape", () => {
  it("admits the review_prompt kind in the system_notices constraint", () => {
    expect(MIGRATION).toMatch(
      /add constraint system_notices_kind_check[\s\S]*'review_prompt'/,
    );
  });

  it("keeps every previously-allowed kind (constraint is a full re-add, not a shrink)", () => {
    for (const kind of [
      "user_signup",
      "subscription_purchased",
      "subscription_canceled",
      "play_milestone",
      "feedback_received",
      "functional_test_failed",
    ]) {
      expect(MIGRATION).toContain(`'${kind}'`);
    }
  });
});

describe("review_prompt push wiring", () => {
  it("is NOT in the device-push allow-list (in-app telemetry, not a phone buzz)", () => {
    expect(ADMIN_PUSH_NOTICE_KINDS).not.toContain("review_prompt");
  });

  it("adminPushMessage renders review_prompt with its own title + the notice body", () => {
    const msg = adminPushMessage({
      id: "n1",
      kind: "review_prompt",
      body: "Marcus is enjoying the app and went to leave an App Store review",
      user_display_name: "Marcus",
      user_email: "marcus@example.com",
      href: "https://apps.apple.com/app/id6776595895?see-all=reviews",
    });
    expect(msg.title).toBe("Rating nudge ⭐");
    expect(msg.body).toContain("Marcus");
    expect(msg.link).toContain("apps.apple.com");
  });
});
