"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Plus, Trash2 } from "lucide-react";
import {
  createGiftCodeAction,
  listGiftCodesAction,
  revokeGiftCodeAction,
  type GiftCodeRow,
} from "@/app/actions/admin-billing";
import { Modal } from "@/components/ui";
import type { SubscriptionTier } from "@/lib/billing/entitlement";
import { TIER_LABEL } from "@/lib/billing/features";
import type { StripeConfigStatus } from "@/lib/site/stripe-config";
import { StripeSettingsClient } from "./StripeSettingsClient";

type Msg = { kind: "error" | "success"; text: string } | null;

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  return new Date(iso).toLocaleString();
}

function GiftStatusPill({ row }: { row: GiftCodeRow }) {
  const exhausted = row.usedCount >= row.maxUses;
  const expired = row.expiresAt ? new Date(row.expiresAt).getTime() < Date.now() : false;
  const status = row.revokedAt
    ? "revoked"
    : exhausted
      ? "exhausted"
      : expired
        ? "expired"
        : "active";
  const styles: Record<string, string> = {
    active:
      "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-100 dark:ring-emerald-800",
    exhausted:
      "bg-blue-50 text-blue-800 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-100 dark:ring-blue-800",
    revoked:
      "bg-zinc-100 text-zinc-700 ring-zinc-200 dark:bg-zinc-900/40 dark:text-zinc-200 dark:ring-zinc-700",
    expired:
      "bg-amber-50 text-amber-900 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-800",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ring-1 ${styles[status]}`}
    >
      {status}
    </span>
  );
}

export function BillingAdminClient({
  initialCodes,
  initialError,
  stripeStatus,
}: {
  initialCodes: GiftCodeRow[];
  initialError: string | null;
  stripeStatus: StripeConfigStatus;
}) {
  const [codes, setCodes] = useState(initialCodes);
  const [msg, setMsg] = useState<Msg>(initialError ? { kind: "error", text: initialError } : null);
  const [addOpen, setAddOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function refresh() {
    startTransition(async () => {
      const res = await listGiftCodesAction();
      if (res.ok) setCodes(res.codes);
      else setMsg({ kind: "error", text: res.error });
    });
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      setTimeout(() => setCopied((c) => (c === value ? null : c)), 1500);
    } catch {
      setMsg({ kind: "error", text: "Copy failed." });
    }
  }

  function onRevoke(id: string) {
    if (!confirm("Revoke this gift code? Already-redeemed comp grants stay active.")) return;
    startTransition(async () => {
      const res = await revokeGiftCodeAction(id);
      if (!res.ok) {
        setMsg({ kind: "error", text: res.error });
        return;
      }
      setMsg({ kind: "success", text: "Revoked." });
      refresh();
    });
  }

  return (
    <div className="space-y-6">
      <StripeSettingsClient initial={stripeStatus} />

      <section className="rounded-xl bg-card p-4 ring-1 ring-border">
        <header className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Gift codes</h2>
            <p className="text-xs text-muted">
              Share a code to grant free access to a tier. Single- or multi-use.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
          >
            <Plus className="size-3.5" /> New code
          </button>
        </header>

        {msg ? (
          <p
            className={`mb-3 rounded-lg px-3 py-2 text-sm ring-1 ${
              msg.kind === "error"
                ? "bg-red-50 text-red-900 ring-red-200"
                : "bg-emerald-50 text-emerald-900 ring-emerald-200"
            }`}
          >
            {msg.text}
          </p>
        ) : null}

        {codes.length === 0 ? (
          <p className="text-sm text-muted">No gift codes yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-2 py-1.5">Code</th>
                  <th className="px-2 py-1.5">Tier</th>
                  <th className="px-2 py-1.5">Duration</th>
                  <th className="px-2 py-1.5">Uses</th>
                  <th className="px-2 py-1.5">Status</th>
                  <th className="px-2 py-1.5">Expires</th>
                  <th className="px-2 py-1.5">Note</th>
                  <th className="px-2 py-1.5"></th>
                </tr>
              </thead>
              <tbody>
                {codes.map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => copy(c.code)}
                        className="inline-flex items-center gap-1 rounded font-mono text-xs hover:bg-surface"
                        title="Copy"
                      >
                        {c.code}
                        {copied === c.code ? (
                          <Check className="size-3 text-emerald-600" />
                        ) : (
                          <Copy className="size-3 text-muted" />
                        )}
                      </button>
                    </td>
                    <td className="px-2 py-2">{TIER_LABEL[c.tier]}</td>
                    <td className="px-2 py-2">
                      {c.durationDays ? `${c.durationDays} days` : "Permanent"}
                    </td>
                    <td className="px-2 py-2">
                      {c.usedCount} / {c.maxUses}
                    </td>
                    <td className="px-2 py-2">
                      <GiftStatusPill row={c} />
                    </td>
                    <td className="px-2 py-2 text-xs text-muted">{formatDate(c.expiresAt)}</td>
                    <td className="px-2 py-2 text-xs text-muted">{c.note ?? "—"}</td>
                    <td className="px-2 py-2 text-right">
                      {!c.revokedAt ? (
                        <button
                          type="button"
                          onClick={() => onRevoke(c.id)}
                          disabled={pending}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                          <Trash2 className="size-3" /> Revoke
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <CreateGiftCodeModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={() => {
          setAddOpen(false);
          setMsg({ kind: "success", text: "Code created." });
          refresh();
        }}
      />
    </div>
  );
}

function CreateGiftCodeModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (code: string) => void;
}) {
  const [tier, setTier] = useState<SubscriptionTier>("coach");
  const [durationDays, setDurationDays] = useState<string>("");
  const [maxUses, setMaxUses] = useState<string>("1");
  const [note, setNote] = useState("");
  const [customCode, setCustomCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setErr(null);
    startTransition(async () => {
      const res = await createGiftCodeAction({
        tier,
        durationDays: durationDays.trim() ? Number(durationDays) : null,
        maxUses: Number(maxUses || "1"),
        note: note.trim() || undefined,
        code: customCode.trim() || undefined,
      });
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      onCreated(res.code);
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="New gift code">
      <div className="space-y-3 text-sm">
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-muted">Tier</span>
          <select
            value={tier}
            onChange={(e) => setTier(e.target.value as SubscriptionTier)}
            className="mt-1 block w-full rounded-md bg-surface px-3 py-1.5 ring-1 ring-border"
          >
            <option value="coach">Coach</option>
            <option value="coach_ai">Coach AI</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-muted">
            Duration (days)
          </span>
          <input
            type="number"
            min={1}
            value={durationDays}
            onChange={(e) => setDurationDays(e.target.value)}
            placeholder="Leave blank for permanent"
            className="mt-1 block w-full rounded-md bg-surface px-3 py-1.5 ring-1 ring-border"
          />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-muted">Max uses</span>
          <input
            type="number"
            min={1}
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
            className="mt-1 block w-full rounded-md bg-surface px-3 py-1.5 ring-1 ring-border"
          />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-muted">
            Custom code (optional)
          </span>
          <input
            type="text"
            value={customCode}
            onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
            placeholder="Auto-generated if blank"
            className="mt-1 block w-full rounded-md bg-surface px-3 py-1.5 font-mono ring-1 ring-border"
          />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-muted">Note</span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Who's this for?"
            className="mt-1 block w-full rounded-md bg-surface px-3 py-1.5 ring-1 ring-border"
          />
        </label>
        {err ? <p className="text-sm text-red-700">{err}</p> : null}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-muted hover:bg-surface"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="rounded-md bg-foreground px-3 py-1.5 text-sm text-background hover:opacity-90 disabled:opacity-50"
          >
            Create
          </button>
        </div>
      </div>
    </Modal>
  );
}
