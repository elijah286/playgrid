/**
 * listFeedbackForAdminAction — unified feedback listing.
 *
 * The admin Feedback tab is the single home for every channel of coach
 * feedback. Beyond the widget + contact form (public.feedback), it now also
 * surfaces the in-app cancel survey's free-text (public.subscription_
 * cancellation_feedback) — the coach's "why I left", which previously only
 * showed on the Payments tab. These tests pin that merge: cancellation rows are
 * included, tagged source="cancellation", id-namespaced so they can't be
 * deleted via the feedback-table path, and interleaved newest-first.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const getUserMock = vi.fn();
const roleMock = vi.fn();
const feedbackRowsMock = vi.fn();
const cancelRowsMock = vi.fn();
const profilesMock = vi.fn();
const listUsersMock = vi.fn();

vi.mock("@/lib/supabase/config", () => ({ hasSupabaseEnv: () => true }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: () => getUserMock() },
    // profiles role check: .select("role").eq("id", uid).single()
    from: () => ({
      select: () => ({ eq: () => ({ single: () => roleMock() }) }),
    }),
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === "feedback") {
        // .select(...).order(...).limit(...)
        return { select: () => ({ order: () => ({ limit: () => feedbackRowsMock() }) }) };
      }
      if (table === "subscription_cancellation_feedback") {
        return { select: () => ({ order: () => ({ limit: () => cancelRowsMock() }) }) };
      }
      // profiles: .select(...).in(...)
      return { select: () => ({ in: () => profilesMock() }) };
    },
    auth: { admin: { listUsers: () => listUsersMock() } },
  })),
}));

import { listFeedbackForAdminAction } from "./feedback";

beforeEach(() => {
  getUserMock.mockReset();
  roleMock.mockReset();
  feedbackRowsMock.mockReset();
  cancelRowsMock.mockReset();
  profilesMock.mockReset();
  listUsersMock.mockReset();
  getUserMock.mockResolvedValue({ data: { user: { id: "admin-1" } } });
  roleMock.mockResolvedValue({ data: { role: "admin" } });
  profilesMock.mockResolvedValue({ data: [{ id: "u-cancel", display_name: "Joseph B" }] });
  listUsersMock.mockResolvedValue({
    data: { users: [{ id: "u-cancel", email: "joseph@example.com" }] },
  });
});

describe("listFeedbackForAdminAction — cancellation feedback merged in", () => {
  it("includes cancel-survey rows, tagged + id-namespaced + newest-first", async () => {
    feedbackRowsMock.mockResolvedValue({
      data: [
        { id: "fb-1", user_id: null, message: "widget note", created_at: "2026-06-20T00:00:00Z", name: "Coach A", email: "a@x.com", source: "widget" },
      ],
      error: null,
    });
    cancelRowsMock.mockResolvedValue({
      data: [
        { id: "c-1", user_id: "u-cancel", message: "Too buggy. Leaving.", created_at: "2026-06-26T00:00:00Z" },
      ],
      error: null,
    });

    const res = await listFeedbackForAdminAction();
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    // Newest-first: the 06-26 cancellation sorts above the 06-20 widget note.
    expect(res.items.map((i) => i.id)).toEqual(["cancellation:c-1", "fb-1"]);

    const cancel = res.items.find((i) => i.source === "cancellation")!;
    expect(cancel.id).toBe("cancellation:c-1"); // namespaced → not deletable via feedback path
    expect(cancel.message).toBe("Too buggy. Leaving.");
    expect(cancel.email).toBe("joseph@example.com");
    expect(cancel.displayName).toBe("Joseph B");
  });

  it("tolerates a cancellation-query error — feedback still loads", async () => {
    feedbackRowsMock.mockResolvedValue({
      data: [{ id: "fb-1", user_id: null, message: "hi", created_at: "2026-06-20T00:00:00Z", name: "A", email: "a@x.com", source: "widget" }],
      error: null,
    });
    cancelRowsMock.mockResolvedValue({ data: null, error: { message: "boom" } });

    const res = await listFeedbackForAdminAction();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.items).toHaveLength(1);
    expect(res.items[0]!.source).toBe("widget");
  });

  it("refuses non-admins", async () => {
    roleMock.mockResolvedValue({ data: { role: "user" } });
    const res = await listFeedbackForAdminAction();
    expect(res.ok).toBe(false);
  });
});
