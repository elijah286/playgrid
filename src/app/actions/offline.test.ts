import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Seams: the action reads playbook membership with the RLS anon client.
// Mock the client + env; mock plays.ts so importing offline.ts doesn't pull
// in the (heavy) plays action module.
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/config", () => ({ hasSupabaseEnv: vi.fn(() => true) }));
vi.mock("@/app/actions/plays", () => ({ listPlaysAction: vi.fn() }));

import { listOfflinePlaybookIdsAction } from "@/app/actions/offline";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";

function mockClient(opts: {
  user?: { id: string } | null;
  rows?: unknown[];
  error?: { message: string } | null;
}) {
  const eq = vi
    .fn()
    .mockResolvedValue({ data: opts.rows ?? [], error: opts.error ?? null });
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  const getUser = vi
    .fn()
    .mockResolvedValue({ data: { user: opts.user ?? null } });
  return { client: { from, auth: { getUser } } as never, from, select, eq };
}

beforeEach(() => {
  vi.mocked(hasSupabaseEnv).mockReturnValue(true);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("listOfflinePlaybookIdsAction", () => {
  it("errors when Supabase env is missing", async () => {
    vi.mocked(hasSupabaseEnv).mockReturnValue(false);
    const res = await listOfflinePlaybookIdsAction();
    expect(res.ok).toBe(false);
  });

  it("errors when not signed in", async () => {
    const { client } = mockClient({ user: null });
    vi.mocked(createClient).mockResolvedValue(client);
    const res = await listOfflinePlaybookIdsAction();
    expect(res.ok).toBe(false);
  });

  it("returns non-archived playbook ids the coach is a member of", async () => {
    const { client, from } = mockClient({
      user: { id: "coach-1" },
      rows: [
        { playbooks: { id: "pb-1", is_archived: false } },
        { playbooks: { id: "pb-2", is_archived: true } }, // archived → excluded
        { playbooks: { id: "pb-3", is_archived: null } }, // null → included
        { playbooks: [{ id: "pb-4", is_archived: false }] }, // array shape
        { playbooks: null }, // malformed → skipped
      ],
    });
    vi.mocked(createClient).mockResolvedValue(client);

    const res = await listOfflinePlaybookIdsAction();

    expect(from).toHaveBeenCalledWith("playbook_members");
    expect(res).toEqual({ ok: true, ids: ["pb-1", "pb-3", "pb-4"] });
  });

  it("propagates a query error", async () => {
    const { client } = mockClient({
      user: { id: "coach-1" },
      error: { message: "boom" },
    });
    vi.mocked(createClient).mockResolvedValue(client);

    const res = await listOfflinePlaybookIdsAction();

    expect(res).toEqual({ ok: false, error: "boom" });
  });
});
