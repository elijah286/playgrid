/**
 * New-UX preview opt-in — account-wide + persistent.
 *
 * The opt-in used to be a per-browser session cookie, which meant enabling it
 * on one device never reached another. It now lives on
 * `profiles.ux_preview_active`. These tests pin:
 *   • resolveUxPreview() gates on availability and only then honors the
 *     persisted `activePreference` (never renders the shell when not allowed).
 *   • set/getUxPreviewActiveAction read/write the caller's own profile row,
 *     and reject a signed-out caller.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

// ─── resolveUxPreview deps ────────────────────────────────────────────────
const getBetaFeaturesMock = vi.fn();
const getAllowlistMock = vi.fn();
vi.mock("@/lib/site/beta-features-config", () => ({
  getBetaFeatures: () => getBetaFeaturesMock(),
  getBetaFeatureAllowlistEmails: () => getAllowlistMock(),
}));

// ─── action deps ──────────────────────────────────────────────────────────
const userMock = vi.fn();
const profileSelectMock = vi.fn();
const profileUpdateMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: () => userMock() },
    from: () => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.maybeSingle = () => profileSelectMock();
      chain.update = (vals: unknown) => ({ eq: () => profileUpdateMock(vals) });
      return chain;
    },
  })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { resolveUxPreview } from "@/lib/site/ux-preview";
import { setUxPreviewActiveAction, getUxPreviewActiveAction } from "./ux-preview";

const ON_ALLOWLIST = "coach@example.com";

beforeEach(() => {
  getBetaFeaturesMock.mockReset();
  getAllowlistMock.mockReset();
  userMock.mockReset();
  profileSelectMock.mockReset();
  profileUpdateMock.mockReset();
  getBetaFeaturesMock.mockResolvedValue({ new_shell: "off" });
  getAllowlistMock.mockResolvedValue([ON_ALLOWLIST]);
  userMock.mockResolvedValue({ data: { user: { id: "u-1" } } });
  profileSelectMock.mockResolvedValue({ data: { ux_preview_active: false } });
  profileUpdateMock.mockResolvedValue({ error: null });
});

describe("resolveUxPreview", () => {
  const base = { isAuthed: true, userRole: null, userEmail: ON_ALLOWLIST };

  it("stays production when the flag is off, even if opted in", async () => {
    getBetaFeaturesMock.mockResolvedValue({ new_shell: "off" });
    const res = await resolveUxPreview({ ...base, activePreference: true });
    expect(res).toEqual({ allowed: false, active: false });
  });

  it("returns not-allowed for an email off the allowlist under custom scope", async () => {
    getBetaFeaturesMock.mockResolvedValue({ new_shell: "custom" });
    const res = await resolveUxPreview({
      ...base,
      userEmail: "stranger@example.com",
      activePreference: true,
    });
    expect(res).toEqual({ allowed: false, active: false });
  });

  it("honors the persisted preference once allowed (all scope)", async () => {
    getBetaFeaturesMock.mockResolvedValue({ new_shell: "all" });
    expect(await resolveUxPreview({ ...base, activePreference: true })).toEqual({
      allowed: true,
      active: true,
    });
    expect(await resolveUxPreview({ ...base, activePreference: false })).toEqual({
      allowed: true,
      active: false,
    });
  });

  it("allows an allowlisted email under custom scope", async () => {
    getBetaFeaturesMock.mockResolvedValue({ new_shell: "custom" });
    const res = await resolveUxPreview({ ...base, activePreference: true });
    expect(res).toEqual({ allowed: true, active: true });
  });

  it("keeps admins allowed under custom scope regardless of allowlist", async () => {
    getBetaFeaturesMock.mockResolvedValue({ new_shell: "custom" });
    getAllowlistMock.mockResolvedValue([]);
    const res = await resolveUxPreview({
      ...base,
      userRole: "admin",
      activePreference: true,
    });
    expect(res).toEqual({ allowed: true, active: true });
  });

  it("is never active for an unauthenticated caller", async () => {
    const res = await resolveUxPreview({
      isAuthed: false,
      userRole: null,
      userEmail: null,
      activePreference: true,
    });
    expect(res).toEqual({ allowed: false, active: false });
  });
});

describe("setUxPreviewActiveAction", () => {
  it("rejects a signed-out caller without writing", async () => {
    userMock.mockResolvedValue({ data: { user: null } });
    const res = await setUxPreviewActiveAction(true);
    expect(res.ok).toBe(false);
    expect(profileUpdateMock).not.toHaveBeenCalled();
  });

  it("persists the opt-in on the caller's profile", async () => {
    const res = await setUxPreviewActiveAction(true);
    expect(res.ok).toBe(true);
    expect(profileUpdateMock).toHaveBeenCalledWith({ ux_preview_active: true });
  });

  it("persists opting back out", async () => {
    const res = await setUxPreviewActiveAction(false);
    expect(res.ok).toBe(true);
    expect(profileUpdateMock).toHaveBeenCalledWith({ ux_preview_active: false });
  });
});

describe("getUxPreviewActiveAction", () => {
  it("reflects the persisted value", async () => {
    profileSelectMock.mockResolvedValue({ data: { ux_preview_active: true } });
    const res = await getUxPreviewActiveAction();
    expect(res).toEqual({ ok: true, active: true });
  });

  it("defaults to false when signed out", async () => {
    userMock.mockResolvedValue({ data: { user: null } });
    const res = await getUxPreviewActiveAction();
    expect(res).toEqual({ ok: true, active: false });
  });
});
