"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  FlaskConical,
  Loader2,
  Plus,
  X,
  Check,
} from "lucide-react";
import type { BetaFeatureScope } from "@/lib/site/beta-features-config";
import {
  getBetaFeaturesAction,
  setBetaFeatureScopeAction,
  getBetaFeatureAllowlistAction,
  addEmailToAllowlistAction,
  removeEmailFromAllowlistAction,
} from "@/app/actions/admin-beta-features";
import {
  getUxPreviewActiveAction,
  setUxPreviewActiveAction,
} from "@/app/actions/ux-preview";

const SCOPES: { value: BetaFeatureScope; label: string; hint: string }[] = [
  { value: "off", label: "Off", hint: "Nobody — production for everyone" },
  { value: "me", label: "Admins only", hint: "Just site admins (you)" },
  { value: "custom", label: "Allowlist", hint: "Specific accounts below" },
  { value: "all", label: "Everyone", hint: "Every signed-in user" },
];

/**
 * Site Admin → Overview banner for the new-UX preview. The one-stop control:
 *  • flip YOUR OWN view between Production and the new UX (per-session cookie);
 *  • set who is ALLOWED to preview (the `new_shell` flag scope);
 *  • manage the allowlist of accounts that can see it.
 *
 * Availability ("who can preview") and the active toggle ("am I previewing
 * right now") are separate on purpose — turning the flag on never forces the
 * new UX on anyone; each person opts in and defaults to production.
 */
export function UxPreviewAdminBanner() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<BetaFeatureScope>("off");
  const [active, setActive] = useState(false);
  const [emails, setEmails] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [feat, act, allow] = await Promise.all([
        getBetaFeaturesAction(),
        getUxPreviewActiveAction(),
        getBetaFeatureAllowlistAction("new_shell"),
      ]);
      if (cancelled) return;
      if (feat.ok) setScope(feat.features.new_shell);
      if (act.ok) setActive(act.active);
      if (allow.ok) setEmails(allow.emails);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const changeScope = (next: BetaFeatureScope) => {
    setError(null);
    startTransition(async () => {
      const res = await setBetaFeatureScopeAction("new_shell", next);
      if (res.ok) {
        setScope(next);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  };

  const toggleActive = (on: boolean) => {
    setError(null);
    startTransition(async () => {
      await setUxPreviewActiveAction(on);
      setActive(on);
      // Turning it on drops you straight into the new shell; turning it off
      // just refreshes Site Admin in place.
      if (on) router.push("/app/home");
      else router.refresh();
    });
  };

  const addEmail = () => {
    const email = newEmail.trim().toLowerCase();
    if (!email) return;
    setError(null);
    startTransition(async () => {
      const res = await addEmailToAllowlistAction("new_shell", email);
      if (res.ok) {
        setEmails(res.emails);
        setNewEmail("");
      } else {
        setError(res.error);
      }
    });
  };

  const removeEmail = (email: string) => {
    setError(null);
    startTransition(async () => {
      const res = await removeEmailFromAllowlistAction("new_shell", email);
      if (res.ok) setEmails(res.emails);
      else setError(res.error);
    });
  };

  // Admins are always allowed to preview once the flag is above "off".
  const adminCanPreview = scope !== "off";

  return (
    <div className="rounded-2xl border-2 border-brand-orange/40 bg-brand-orange-light p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-orange text-white">
            <FlaskConical className="size-4" aria-hidden />
          </span>
          <div>
            <h3 className="text-sm font-bold text-foreground">New UX preview</h3>
            <p className="mt-0.5 max-w-prose text-xs text-muted">
              Preview the navigation redesign without disturbing production.
              Turning it on for yourself never changes what anyone else sees —
              each person opts in, and login always defaults to Production.
            </p>
          </div>
        </div>

        {/* Your-own-view toggle */}
        <div className="flex flex-col items-end gap-1">
          <div className="inline-flex rounded-xl border border-border bg-surface-raised p-0.5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => toggleActive(false)}
              disabled={pending || loading}
              className={`rounded-lg px-3 py-1.5 transition-colors ${
                !active ? "bg-foreground text-white" : "text-muted hover:text-foreground"
              }`}
            >
              Production
            </button>
            <button
              type="button"
              onClick={() => toggleActive(true)}
              disabled={pending || loading || !adminCanPreview}
              title={adminCanPreview ? undefined : "Set availability above ‘Off’ to preview"}
              className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 transition-colors ${
                active ? "bg-brand-orange text-white" : "text-muted hover:text-foreground disabled:opacity-40"
              }`}
            >
              {pending && <Loader2 className="size-3 animate-spin" aria-hidden />}
              New UX
            </button>
          </div>
          {!adminCanPreview && (
            <span className="text-[11px] text-muted">Set availability above “Off” to preview.</span>
          )}
        </div>
      </div>

      <div className="mt-4 border-t border-brand-orange/20 pt-3">
        <div className="text-[11px] font-bold uppercase tracking-wide text-muted">
          Who can see it
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {SCOPES.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => changeScope(s.value)}
              disabled={pending || loading}
              title={s.hint}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                scope === s.value
                  ? "border-brand-orange bg-brand-orange text-white"
                  : "border-border bg-surface-raised text-muted hover:text-foreground"
              }`}
            >
              {scope === s.value && <Check className="size-3" aria-hidden />}
              {s.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-muted">
          {SCOPES.find((s) => s.value === scope)?.hint}
        </p>
      </div>

      {/* Allowlist — always visible so you can pre-add testers before flipping
          to "Allowlist". Only takes effect under the Allowlist scope. */}
      <div className="mt-3 border-t border-brand-orange/20 pt-3">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-bold uppercase tracking-wide text-muted">
            Allowlisted accounts {scope !== "custom" && <span className="font-normal normal-case">(active under “Allowlist”)</span>}
          </div>
        </div>
        <div className="mt-2 flex gap-2">
          <input
            type="email"
            inputMode="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addEmail();
              }
            }}
            placeholder="teammate@example.com"
            className="min-w-0 flex-1 rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm outline-none focus:border-brand-orange"
          />
          <button
            type="button"
            onClick={addEmail}
            disabled={pending || loading || !newEmail.trim()}
            className="inline-flex items-center gap-1 rounded-lg bg-brand-orange px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-brand-orange-hover disabled:opacity-40"
          >
            <Plus className="size-4" aria-hidden />
            Add
          </button>
        </div>
        {emails.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-2">
            {emails.map((email) => (
              <li
                key={email}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-raised py-1 pl-3 pr-1.5 text-xs"
              >
                <span className="text-foreground">{email}</span>
                <button
                  type="button"
                  onClick={() => removeEmail(email)}
                  disabled={pending}
                  aria-label={`Remove ${email}`}
                  className="inline-flex size-5 items-center justify-center rounded-full text-muted hover:bg-surface-inset hover:text-danger"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[11px] text-muted">No accounts allowlisted yet.</p>
        )}
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-danger-light px-3 py-2 text-xs text-danger">{error}</p>
      )}
    </div>
  );
}
