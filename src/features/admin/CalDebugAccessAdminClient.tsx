"use client";

import { useEffect, useState, useTransition } from "react";

import {
  grantCalDebugAccessAction,
  listCalDebugAccessAction,
  revokeCalDebugAccessAction,
  type CalDebugAccessRow,
} from "@/app/actions/coach-cal-debug-access";

type Msg = { kind: "error" | "success"; text: string } | null;

export function CalDebugAccessAdminClient() {
  const [items, setItems] = useState<CalDebugAccessRow[]>([]);
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();

  function refresh() {
    startTransition(async () => {
      const res = await listCalDebugAccessAction();
      if (res.ok) setItems(res.items);
      else setMsg({ kind: "error", text: res.error });
      setLoading(false);
    });
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function grant() {
    if (!email.trim()) return;
    setMsg(null);
    startTransition(async () => {
      const res = await grantCalDebugAccessAction(email);
      if (!res.ok) {
        setMsg({ kind: "error", text: res.error });
        return;
      }
      setEmail("");
      setMsg({ kind: "success", text: "Cal debug tools enabled for this account." });
      refresh();
    });
  }

  function revoke(row: CalDebugAccessRow) {
    if (!globalThis.confirm(`Remove Cal debug access for ${row.email ?? row.userId}?`)) return;
    setMsg(null);
    startTransition(async () => {
      const res = await revokeCalDebugAccessAction(row.userId);
      if (!res.ok) setMsg({ kind: "error", text: res.error });
      else {
        setMsg({ kind: "success", text: "Access removed." });
        refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Cal debug access</h2>
        <p className="mt-1 text-sm text-muted">
          Grant a non-admin account the same Coach Cal debugging tools site admins have —
          downloading the full chat thread and copying the raw JSON of a response. The account
          still needs its own Coach Cal entitlement (Coach Pro, or site admin) to open Cal at all;
          this only unlocks the debug affordances once they&apos;re there.
        </p>
      </div>

      {/* Grant by email */}
      <div className="flex flex-wrap items-end gap-2">
        <label className="block text-sm">
          <span className="font-medium text-foreground">Grant by email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") grant();
            }}
            placeholder="coach@example.com"
            className="mt-1 w-72 max-w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </label>
        <button
          type="button"
          disabled={pending || !email.trim()}
          onClick={grant}
          className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
        >
          {pending ? "Saving…" : "Enable debug tools"}
        </button>
      </div>

      {msg && (
        <p
          className={`rounded-lg px-3 py-2 text-sm ring-1 ${
            msg.kind === "error"
              ? "bg-amber-50 text-amber-950 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-50 dark:ring-amber-800"
              : "bg-emerald-50 text-emerald-950 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-50 dark:ring-emerald-800"
          }`}
        >
          {msg.text}
        </p>
      )}

      {/* Current grants */}
      <div className="overflow-hidden rounded-2xl border border-border bg-surface-raised">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-inset text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Granted</th>
              <th className="px-4 py-3">By</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted">
                  Loading…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted">
                  No accounts have Cal debug tools enabled.
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <tr key={row.userId} className="align-top hover:bg-surface-inset/40">
                  <td className="px-4 py-3 font-medium text-foreground">
                    {row.email ?? <span className="text-muted">{row.userId}</span>}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {new Date(row.grantedAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-muted">{row.grantedByEmail ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => revoke(row)}
                        className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-surface px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-40 dark:border-amber-800 dark:text-amber-200 dark:hover:bg-amber-950/40"
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
