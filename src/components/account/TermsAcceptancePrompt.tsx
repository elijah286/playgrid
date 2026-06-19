"use client";

import { useState } from "react";
import { Button, useToast } from "@/components/ui";
import { acceptTermsAction } from "@/app/actions/account";
import { createClient } from "@/lib/supabase/client";

/**
 * Blocking Terms/EULA acceptance gate (App Store Guideline 1.2).
 *
 * Unlike NameCapturePrompt, this is NOT dismissible: an app with user-generated
 * content must obtain affirmative agreement to its terms (including the
 * objectionable-content / zero-tolerance clause) before use. Email signups
 * accept via the checkbox in AuthFlow; OAuth (Apple/Google) signups skip that
 * form, so this catches them on first authed load. The only ways out are
 * accepting or signing out. Mounted in the dashboard layout; renders only when
 * the server-side `needed` flag is true (profiles.terms_accepted_at IS NULL).
 */
export function TermsAcceptancePrompt({ needed }: { needed: boolean }) {
  const { toast } = useToast();
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!needed) return null;

  async function accept() {
    if (!agreed) return;
    setSaving(true);
    const res = await acceptTermsAction();
    if (!res.ok) {
      setSaving(false);
      toast(res.error, "error");
      return;
    }
    // Full reload so the dashboard layout re-reads terms_accepted_at and the
    // gate disappears (it's computed server-side).
    if (typeof window !== "undefined") window.location.reload();
  }

  async function signOut() {
    setSaving(true);
    try {
      await createClient().auth.signOut();
    } catch {
      /* ignore — redirect regardless */
    }
    if (typeof window !== "undefined") window.location.assign("/login");
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface-raised shadow-elevated">
        <div className="px-5 pt-5">
          <h2 className="text-base font-bold text-foreground">
            Agree to our terms to continue
          </h2>
          <p className="mt-1 text-xs text-muted">
            XO Gridmaker lets coaches share playbooks and message their team. To
            keep it safe, we need your agreement before you continue.
          </p>
        </div>
        <div className="space-y-4 p-5">
          <label className="flex items-start gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              className="mt-0.5 size-4 shrink-0 rounded border-border accent-primary"
              checked={agreed}
              disabled={saving}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            <span>
              I agree to the{" "}
              <a href="/terms" target="_blank" className="font-medium text-primary hover:text-primary-hover">
                Terms
              </a>{" "}
              and{" "}
              <a href="/privacy" target="_blank" className="font-medium text-primary hover:text-primary-hover">
                Privacy Policy
              </a>
              , including the zero-tolerance policy for objectionable content and
              abusive behavior.
            </span>
          </label>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={signOut}
              disabled={saving}
              className="text-xs font-medium text-muted hover:text-foreground"
            >
              Sign out
            </button>
            <Button onClick={accept} loading={saving} disabled={!agreed}>
              Agree &amp; continue
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
