/**
 * enrichSignupNotice — playbook-invite referrer resolution.
 *
 * When a signup's first-touch landing path is `/invite/<token>`, the admin
 * inbox should be able to show who sent that invite, not just that "someone
 * signed up via playbook invite". This mirrors the existing copy_link sender
 * lookup (playbook_copy_links.created_by) but reads playbook_invites, and
 * stores the result under system_notices.detail.invited_by_* — separate from
 * the body string — so the UI can render it as a clickable link rather than
 * splicing a name into opaque text.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { enrichSignupNotice } from "./snapshot";

const noticeSelectMock = vi.fn();
const noticeUpdateMock = vi.fn();
const inviteSelectMock = vi.fn();
const profileSelectMock = vi.fn();
const getUserByIdMock = vi.fn();

function buildAdmin() {
  return {
    from: (table: string) => {
      if (table === "system_notices") {
        return {
          // .select(...).eq(...).eq(...).order(...).limit(...).maybeSingle()
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => ({ maybeSingle: () => noticeSelectMock() }),
                }),
              }),
            }),
          }),
          // .update(payload).eq("id", ...)
          update: (payload: unknown) => {
            noticeUpdateMock(payload);
            return { eq: () => Promise.resolve({ data: null, error: null }) };
          },
        };
      }
      if (table === "playbook_invites") {
        // .select("created_by").eq("token", ...).maybeSingle()
        return {
          select: () => ({ eq: () => ({ maybeSingle: () => inviteSelectMock() }) }),
        };
      }
      if (table === "profiles") {
        // .select("display_name").eq("id", ...).maybeSingle()
        return {
          select: () => ({ eq: () => ({ maybeSingle: () => profileSelectMock() }) }),
        };
      }
      // playbook_copy_links / playbooks — unused by the playbook_invite path.
      return {
        select: () => ({
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
        }),
      };
    },
    auth: { admin: { getUserById: (id: string) => getUserByIdMock(id) } },
  } as unknown as Parameters<typeof enrichSignupNotice>[0];
}

const BASE_PAYLOAD = {
  ts: "2026-07-01T00:00:00.000Z",
  utm_source: null,
  utm_medium: null,
  utm_campaign: null,
  utm_content: null,
  utm_term: null,
  referrer: null,
  landing_path: "/invite/invite-token-123",
  country: null,
  region: null,
  city: null,
  ref: null,
};

beforeEach(() => {
  noticeSelectMock.mockReset();
  noticeUpdateMock.mockReset();
  inviteSelectMock.mockReset();
  profileSelectMock.mockReset();
  getUserByIdMock.mockReset();
  noticeSelectMock.mockResolvedValue({
    data: {
      id: "notice-1",
      body: "placeholder",
      user_display_name: null,
      user_email: "new@user.com",
    },
    error: null,
  });
});

describe("enrichSignupNotice — playbook invite referrer", () => {
  it("resolves the inviter's email + display name into detail", async () => {
    inviteSelectMock.mockResolvedValue({ data: { created_by: "inviter-1" }, error: null });
    profileSelectMock.mockResolvedValue({ data: { display_name: "Alice Coach" }, error: null });
    getUserByIdMock.mockResolvedValue({ data: { user: { email: "alice@example.com" } } });

    await enrichSignupNotice(buildAdmin(), "new-user-1", BASE_PAYLOAD);

    expect(noticeUpdateMock).toHaveBeenCalledTimes(1);
    const payload = noticeUpdateMock.mock.calls[0]![0] as { detail: Record<string, unknown> };
    expect(payload.detail.invited_by_user_id).toBe("inviter-1");
    expect(payload.detail.invited_by_email).toBe("alice@example.com");
    expect(payload.detail.invited_by_name).toBe("Alice Coach");
  });

  it("falls back to email when the inviter has no display name", async () => {
    inviteSelectMock.mockResolvedValue({ data: { created_by: "inviter-2" }, error: null });
    profileSelectMock.mockResolvedValue({ data: { display_name: null }, error: null });
    getUserByIdMock.mockResolvedValue({ data: { user: { email: "bob@example.com" } } });

    await enrichSignupNotice(buildAdmin(), "new-user-2", BASE_PAYLOAD);

    const payload = noticeUpdateMock.mock.calls[0]![0] as { detail: Record<string, unknown> };
    expect(payload.detail.invited_by_name).toBeNull();
    expect(payload.detail.invited_by_email).toBe("bob@example.com");
  });

  it("leaves invited_by fields null when the invite token can't be resolved", async () => {
    inviteSelectMock.mockResolvedValue({ data: null, error: null });

    await enrichSignupNotice(buildAdmin(), "new-user-3", BASE_PAYLOAD);

    const payload = noticeUpdateMock.mock.calls[0]![0] as { detail: Record<string, unknown> };
    expect(payload.detail.invited_by_user_id).toBeNull();
    expect(payload.detail.invited_by_email).toBeNull();
    expect(payload.detail.invited_by_name).toBeNull();
    expect(getUserByIdMock).not.toHaveBeenCalled();
  });

  it("does not populate invited_by fields for a non-invite landing", async () => {
    await enrichSignupNotice(buildAdmin(), "new-user-4", {
      ...BASE_PAYLOAD,
      landing_path: "/",
    });

    const payload = noticeUpdateMock.mock.calls[0]![0] as { detail: Record<string, unknown> };
    expect(payload.detail.invited_by_user_id).toBeNull();
    expect(payload.detail.signup_source_kind).toBe("home");
    expect(inviteSelectMock).not.toHaveBeenCalled();
  });
});
