"use client";

import { useMemo, useState, useTransition } from "react";

import {
  submitPublicRegistrationAction,
  type RegistrationSubmission,
} from "@/app/actions/public-registration";
import type { PublicStoreItem } from "@/lib/league/public-registration";
import type { SportRegistrationField } from "@/lib/league/sportConfig";

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

const inputCls =
  "mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

export function PublicRegistrationForm({
  leagueId,
  leagueName,
  feeCents,
  storeItems,
  paymentsEnabled,
  sportFields,
}: {
  leagueId: string;
  leagueName: string;
  feeCents: number;
  storeItems: PublicStoreItem[];
  paymentsEnabled: boolean;
  sportFields: SportRegistrationField[];
}) {
  const [f, setF] = useState({
    playerFirstName: "",
    playerLastName: "",
    playerDob: "",
    guardianName: "",
    guardianEmail: "",
    guardianPhone: "",
    divisionPreference: "",
    notes: "",
  });
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(storeItems.filter((i) => i.required).map((i) => i.id)),
  );
  const [variants, setVariants] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const i of storeItems) {
      if (i.required && i.sizes.length > 0) init[i.id] = i.sizes[0];
    }
    return init;
  });
  const [sportDetails, setSportDetails] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const total = useMemo(() => {
    const items = storeItems
      .filter((i) => i.required || selected.has(i.id))
      .reduce((sum, i) => sum + i.priceCents, 0);
    return feeCents + items;
  }, [feeCents, storeItems, selected]);

  const willCharge = paymentsEnabled && total > 0;

  function set<K extends keyof typeof f>(k: K, v: string) {
    setF((prev) => ({ ...prev, [k]: v }));
  }

  function toggle(item: PublicStoreItem) {
    if (item.required) return;
    const adding = !selected.has(item.id);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
    // Default a size when an item with sizes is first selected.
    if (adding && item.sizes.length > 0) {
      setVariants((prev) => (prev[item.id] ? prev : { ...prev, [item.id]: item.sizes[0] }));
    }
  }

  function submit() {
    setError(null);
    // One chosen size per selected item that has sizes (default to the first).
    const chosenVariants: Record<string, string> = {};
    for (const i of storeItems) {
      if ((i.required || selected.has(i.id)) && i.sizes.length > 0) {
        chosenVariants[i.id] = variants[i.id] ?? i.sizes[0];
      }
    }
    const payload: RegistrationSubmission = {
      ...f,
      playerDob: f.playerDob || null,
      itemIds: [...selected],
      variants: chosenVariants,
      sportDetails,
    };
    startTransition(async () => {
      const r = await submitPublicRegistrationAction(leagueId, payload);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      if (r.checkoutUrl) {
        globalThis.location.href = r.checkoutUrl;
        return;
      }
      setDone(true);
    });
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center dark:border-emerald-800 dark:bg-emerald-950/40">
        <h2 className="text-lg font-bold text-emerald-900 dark:text-emerald-100">
          You&apos;re registered! 🎉
        </h2>
        <p className="mt-2 text-sm text-emerald-800 dark:text-emerald-200">
          Thanks for registering with {leagueName}. The league will follow up with next steps
          {total > 0 ? ", including how to complete payment" : ""}.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-sm font-semibold text-foreground">Player</h2>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-foreground">First name</span>
            <input value={f.playerFirstName} onChange={(e) => set("playerFirstName", e.target.value)} className={inputCls} />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-foreground">Last name</span>
            <input value={f.playerLastName} onChange={(e) => set("playerLastName", e.target.value)} className={inputCls} />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-foreground">Date of birth</span>
            <input type="date" value={f.playerDob} onChange={(e) => set("playerDob", e.target.value)} className={inputCls} />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-foreground">Division / age group <span className="text-muted">(optional)</span></span>
            <input value={f.divisionPreference} onChange={(e) => set("divisionPreference", e.target.value)} placeholder="e.g. U10" className={inputCls} />
          </label>
        </div>
      </section>

      {sportFields.length > 0 ? (
        <section>
          <h2 className="text-sm font-semibold text-foreground">Sport details</h2>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {sportFields.map((fld) => (
              <label key={fld.key} className="block text-sm">
                <span className="font-medium text-foreground">
                  {fld.label} <span className="text-muted">(optional)</span>
                </span>
                {fld.type === "select" ? (
                  <select
                    value={sportDetails[fld.key] ?? ""}
                    onChange={(e) => setSportDetails((p) => ({ ...p, [fld.key]: e.target.value }))}
                    className={inputCls}
                  >
                    <option value="">Select…</option>
                    {(fld.options ?? []).map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={sportDetails[fld.key] ?? ""}
                    onChange={(e) => setSportDetails((p) => ({ ...p, [fld.key]: e.target.value }))}
                    className={inputCls}
                  />
                )}
              </label>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="text-sm font-semibold text-foreground">Parent / guardian</h2>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-sm sm:col-span-2">
            <span className="font-medium text-foreground">Full name</span>
            <input value={f.guardianName} onChange={(e) => set("guardianName", e.target.value)} className={inputCls} />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-foreground">Email</span>
            <input type="email" value={f.guardianEmail} onChange={(e) => set("guardianEmail", e.target.value)} className={inputCls} />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-foreground">Phone <span className="text-muted">(optional)</span></span>
            <input type="tel" value={f.guardianPhone} onChange={(e) => set("guardianPhone", e.target.value)} className={inputCls} />
          </label>
        </div>
      </section>

      {storeItems.length > 0 ? (
        <section>
          <h2 className="text-sm font-semibold text-foreground">Add-ons</h2>
          <ul className="mt-2 space-y-2">
            {storeItems.map((i) => (
              <li key={i.id} className="rounded-lg border border-border bg-surface px-3 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <label className="flex items-center gap-2.5 text-sm">
                    <input
                      type="checkbox"
                      checked={i.required || selected.has(i.id)}
                      disabled={i.required}
                      onChange={() => toggle(i)}
                      className="size-4"
                    />
                    {i.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={i.imageUrl}
                        alt=""
                        className="size-10 shrink-0 rounded border border-border object-cover"
                      />
                    ) : null}
                    <span>
                      <span className="font-medium text-foreground">{i.name}</span>
                      {i.required ? <span className="ml-2 text-xs text-muted">Required</span> : null}
                      {i.description ? (
                        <span className="block text-xs text-muted">{i.description}</span>
                      ) : null}
                    </span>
                  </label>
                  <span className="shrink-0 text-sm text-muted">{money(i.priceCents)}</span>
                </div>
                {(i.required || selected.has(i.id)) && i.sizes.length > 0 ? (
                  <div className="mt-2 flex items-center gap-2 pl-[26px]">
                    <span className="text-xs text-muted">Size</span>
                    <select
                      value={variants[i.id] ?? i.sizes[0]}
                      onChange={(e) =>
                        setVariants((prev) => ({ ...prev, [i.id]: e.target.value }))
                      }
                      className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      {i.sizes.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <label className="block text-sm">
          <span className="font-medium text-foreground">Anything the league should know? <span className="text-muted">(optional)</span></span>
          <textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} rows={3} className={inputCls} />
        </label>
      </section>

      <div className="rounded-2xl border border-border bg-surface-raised p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">Registration fee</span>
          <span className="text-foreground">{money(feeCents)}</span>
        </div>
        {storeItems
          .filter((i) => i.required || selected.has(i.id))
          .map((i) => (
            <div key={i.id} className="mt-1 flex items-center justify-between text-sm">
              <span className="text-muted">{i.name}</span>
              <span className="text-foreground">{money(i.priceCents)}</span>
            </div>
          ))}
        <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-sm font-semibold">
          <span className="text-foreground">Total due</span>
          <span className="text-foreground">{money(total)}</span>
        </div>
        <p className="mt-1 text-xs text-muted">
          {willCharge
            ? "You'll be taken to secure checkout to pay after you submit."
            : total > 0
              ? "You'll complete payment after the league confirms your spot."
              : "No payment required."}
        </p>
      </div>

      {error ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-800">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        disabled={pending}
        onClick={submit}
        className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
      >
        {pending ? "Submitting…" : willCharge ? "Continue to payment" : "Submit registration"}
      </button>
    </div>
  );
}
