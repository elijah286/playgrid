"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff } from "lucide-react";
import {
  clearStripeConfigAction,
  saveStripeConfigAction,
  testStripeSecretAction,
} from "@/app/actions/admin-billing";
import type { StripeConfigStatus } from "@/lib/site/stripe-config";

type Msg = { kind: "error" | "success"; text: string } | null;

function StatusBadge({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ring-1 ${
        ok
          ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
          : "bg-zinc-100 text-zinc-700 ring-zinc-200"
      }`}
    >
      {ok ? "Set" : "Not set"}
    </span>
  );
}

export function StripeSettingsClient({ initial }: { initial: StripeConfigStatus }) {
  const [status, setStatus] = useState(initial);
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, startTransition] = useTransition();

  const [secret, setSecret] = useState("");
  const [pub, setPub] = useState(initial.publishableKey ?? "");
  const [hook, setHook] = useState("");
  const [pCoachM, setPCoachM] = useState(initial.priceIds.coach_month ?? "");
  const [pCoachY, setPCoachY] = useState(initial.priceIds.coach_year ?? "");
  const [pAiM, setPAiM] = useState(initial.priceIds.coach_ai_month ?? "");
  const [pAiY, setPAiY] = useState(initial.priceIds.coach_ai_year ?? "");

  const [showSecret, setShowSecret] = useState(false);
  const [showHook, setShowHook] = useState(false);

  function afterSave(nextStatus: StripeConfigStatus) {
    setStatus(nextStatus);
    setSecret("");
    setHook("");
  }

  function save() {
    setMsg(null);
    startTransition(async () => {
      const res = await saveStripeConfigAction({
        secretKey: secret || undefined,
        publishableKey: pub,
        webhookSecret: hook || undefined,
        priceCoachMonth: pCoachM,
        priceCoachYear: pCoachY,
        priceCoachAiMonth: pAiM,
        priceCoachAiYear: pAiY,
      });
      if (!res.ok) {
        setMsg({ kind: "error", text: res.error });
        return;
      }
      // Re-fetch fresh status
      const { getStripeConfigStatusAction } = await import("@/app/actions/admin-billing");
      const next = await getStripeConfigStatusAction();
      if (next.ok) afterSave(next.status);
      setMsg({ kind: "success", text: "Saved." });
    });
  }

  function test() {
    setMsg(null);
    startTransition(async () => {
      const res = await testStripeSecretAction(secret || undefined);
      setMsg(res.ok ? { kind: "success", text: res.message } : { kind: "error", text: res.error });
    });
  }

  function clearAll() {
    if (!confirm("Clear all Stripe settings? The site will have no billing configured.")) return;
    setMsg(null);
    startTransition(async () => {
      const res = await clearStripeConfigAction();
      if (!res.ok) {
        setMsg({ kind: "error", text: res.error });
        return;
      }
      const { getStripeConfigStatusAction } = await import("@/app/actions/admin-billing");
      const next = await getStripeConfigStatusAction();
      if (next.ok) {
        afterSave(next.status);
        setPub("");
        setPCoachM("");
        setPCoachY("");
        setPAiM("");
        setPAiY("");
      }
      setMsg({ kind: "success", text: "Cleared." });
    });
  }

  return (
    <section className="rounded-xl bg-card p-4 ring-1 ring-border">
      <header className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Stripe configuration</h2>
          <p className="text-xs text-muted">
            Keys are stored server-side. Secret and webhook values are never sent back to the
            browser — paste a new value to rotate.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted">Mode</span>
          <span className="rounded-full bg-surface px-2 py-0.5 ring-1 ring-border">
            {status.mode ?? "—"}
          </span>
        </div>
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs uppercase tracking-wide text-muted">Secret key</span>
            <StatusBadge ok={status.hasSecretKey} />
          </div>
          <div className="flex gap-2">
            <input
              type={showSecret ? "text" : "password"}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder={status.hasSecretKey ? "Paste to replace" : "sk_test_... or sk_live_..."}
              className="block w-full rounded-md bg-surface px-3 py-1.5 font-mono text-xs ring-1 ring-border"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowSecret((v) => !v)}
              className="rounded-md px-2 text-muted hover:bg-surface"
              aria-label="Toggle visibility"
            >
              {showSecret ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </label>

        <label className="block">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs uppercase tracking-wide text-muted">Publishable key</span>
            <StatusBadge ok={status.hasPublishableKey} />
          </div>
          <input
            type="text"
            value={pub}
            onChange={(e) => setPub(e.target.value)}
            placeholder="pk_test_... or pk_live_..."
            className="block w-full rounded-md bg-surface px-3 py-1.5 font-mono text-xs ring-1 ring-border"
            autoComplete="off"
          />
        </label>

        <label className="block sm:col-span-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs uppercase tracking-wide text-muted">Webhook secret</span>
            <StatusBadge ok={status.hasWebhookSecret} />
          </div>
          <div className="flex gap-2">
            <input
              type={showHook ? "text" : "password"}
              value={hook}
              onChange={(e) => setHook(e.target.value)}
              placeholder={status.hasWebhookSecret ? "Paste to replace" : "whsec_..."}
              className="block w-full rounded-md bg-surface px-3 py-1.5 font-mono text-xs ring-1 ring-border"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowHook((v) => !v)}
              className="rounded-md px-2 text-muted hover:bg-surface"
              aria-label="Toggle visibility"
            >
              {showHook ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </label>
      </div>

      <div className="mt-5 border-t border-border pt-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          Price IDs
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-muted">Coach — monthly</span>
            <input
              type="text"
              value={pCoachM}
              onChange={(e) => setPCoachM(e.target.value)}
              placeholder="price_..."
              className="mt-1 block w-full rounded-md bg-surface px-3 py-1.5 font-mono text-xs ring-1 ring-border"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-muted">Coach — annual</span>
            <input
              type="text"
              value={pCoachY}
              onChange={(e) => setPCoachY(e.target.value)}
              placeholder="price_..."
              className="mt-1 block w-full rounded-md bg-surface px-3 py-1.5 font-mono text-xs ring-1 ring-border"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-muted">Coach AI — monthly</span>
            <input
              type="text"
              value={pAiM}
              onChange={(e) => setPAiM(e.target.value)}
              placeholder="price_..."
              className="mt-1 block w-full rounded-md bg-surface px-3 py-1.5 font-mono text-xs ring-1 ring-border"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-muted">Coach AI — annual</span>
            <input
              type="text"
              value={pAiY}
              onChange={(e) => setPAiY(e.target.value)}
              placeholder="price_..."
              className="mt-1 block w-full rounded-md bg-surface px-3 py-1.5 font-mono text-xs ring-1 ring-border"
            />
          </label>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={clearAll}
          disabled={pending}
          className="text-xs text-red-700 hover:underline disabled:opacity-50"
        >
          Clear all
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={test}
            disabled={pending}
            className="rounded-md bg-surface px-3 py-1.5 text-sm ring-1 ring-border hover:bg-card disabled:opacity-50"
          >
            Test secret key
          </button>
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </section>
  );
}
