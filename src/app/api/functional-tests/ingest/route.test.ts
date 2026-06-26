/**
 * Functional-test ingest endpoint — auth + validation + failure-notice guard.
 *
 * The endpoint is the only way CI writes runs to prod, so its Bearer-CRON_SECRET
 * gate is security-critical, and the failure path must raise a
 * `functional_test_failed` system_notice (which ADMIN_PUSH_NOTICE_KINDS pushes).
 * These tests pin all three so a refactor can't silently open the door or drop
 * the alert.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const runInsert = vi.fn(() => ({
  select: () => ({ single: () => Promise.resolve({ data: { id: "run-1" }, error: null }) }),
}));
const stepsInsert = vi.fn(() => Promise.resolve({ error: null }));
const noticeInsert = vi.fn((_row: { kind: string; href: string; body: string }) =>
  Promise.resolve({ error: null }),
);
const upload = vi.fn(() => Promise.resolve({ error: null }));
const getPublicUrl = vi.fn(() => ({ data: { publicUrl: "https://cdn/x.png" } }));

const mockAdmin = {
  from: (table: string) => {
    if (table === "functional_test_runs") return { insert: runInsert };
    if (table === "functional_test_steps") return { insert: stepsInsert };
    if (table === "system_notices") return { insert: noticeInsert };
    return { insert: vi.fn(() => Promise.resolve({ error: null })) };
  },
  storage: { from: () => ({ upload, getPublicUrl }) },
};

vi.mock("@/lib/supabase/config", () => ({ hasSupabaseEnv: () => true }));
vi.mock("@/lib/supabase/admin", () => ({ createServiceRoleClient: () => mockAdmin }));
vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      body,
    }),
  },
}));

import { POST } from "./route";

const SECRET = "cron-secret-xyz";

function req(body: unknown, auth: string | null): Request {
  return new Request("http://localhost/api/functional-tests/ingest", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(auth ? { authorization: auth } : {}),
    },
    body: JSON.stringify(body),
  });
}

const passingRun = {
  status: "passed",
  startedAt: "2026-06-26T00:00:00Z",
  finishedAt: "2026-06-26T00:00:10Z",
  durationMs: 10_000,
  steps: [{ scenario: "print-playsheet", stepName: "render", ordinal: 1, status: "passed", durationMs: 900 }],
};

beforeEach(() => {
  runInsert.mockClear();
  stepsInsert.mockClear();
  noticeInsert.mockClear();
  upload.mockClear();
  process.env.CRON_SECRET = SECRET;
});

describe("functional-tests ingest auth", () => {
  it("401s with no Authorization header", async () => {
    const res = (await POST(req(passingRun, null))) as unknown as { status: number };
    expect(res.status).toBe(401);
    expect(runInsert).not.toHaveBeenCalled();
  });

  it("401s with the wrong bearer token", async () => {
    const res = (await POST(req(passingRun, "Bearer nope"))) as unknown as { status: number };
    expect(res.status).toBe(401);
    expect(runInsert).not.toHaveBeenCalled();
  });
});

describe("functional-tests ingest validation", () => {
  it("400s when steps is missing", async () => {
    const res = (await POST(
      req({ status: "passed", startedAt: "x", finishedAt: "y" }, `Bearer ${SECRET}`),
    )) as unknown as { status: number };
    expect(res.status).toBe(400);
  });

  it("400s on an unknown status", async () => {
    const res = (await POST(
      req({ ...passingRun, status: "weird" }, `Bearer ${SECRET}`),
    )) as unknown as { status: number };
    expect(res.status).toBe(400);
  });
});

describe("functional-tests ingest happy paths", () => {
  it("inserts a run + steps and does NOT raise a notice when passing", async () => {
    const res = (await POST(req(passingRun, `Bearer ${SECRET}`))) as unknown as {
      status: number;
      body: { ok: boolean; runId: string };
    };
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(runInsert).toHaveBeenCalledTimes(1);
    expect(stepsInsert).toHaveBeenCalledTimes(1);
    expect(noticeInsert).not.toHaveBeenCalled();
  });

  it("raises a functional_test_failed notice when a run fails", async () => {
    const failingRun = {
      ...passingRun,
      status: "failed",
      steps: [
        { scenario: "invite-accept", stepName: "accept", ordinal: 1, status: "failed", durationMs: 4000, errorMessage: "boom" },
      ],
    };
    const res = (await POST(req(failingRun, `Bearer ${SECRET}`))) as unknown as { status: number };
    expect(res.status).toBe(200);
    expect(noticeInsert).toHaveBeenCalledTimes(1);
    const arg = noticeInsert.mock.calls[0]![0];
    expect(arg.kind).toBe("functional_test_failed");
    expect(arg.href).toBe("/settings?tab=functional_tests");
    expect(arg.body).toMatch(/invite-accept/);
  });
});
