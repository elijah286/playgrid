"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, ChevronDown, CircleAlert } from "lucide-react";
import { Button, Card, Input, useToast } from "@/components/ui";
import { setGoogleOauthWebClientIdAction } from "@/app/actions/admin-auth-providers";

type Initial = {
  clientId: string | null;
};

export function GoogleNativeSigninSettingsClient({ initial }: { initial: Initial }) {
  const { toast } = useToast();
  const [savedClientId, setSavedClientId] = useState(initial.clientId ?? "");
  const [draft, setDraft] = useState(initial.clientId ?? "");
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();

  const configured = savedClientId.trim().length > 0;
  const dirty = draft.trim() !== savedClientId.trim();

  function save() {
    startTransition(async () => {
      const res = await setGoogleOauthWebClientIdAction(draft);
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      const next = res.clientId ?? "";
      setSavedClientId(next);
      setDraft(next);
      toast(
        next.length > 0
          ? "Client ID saved."
          : "Client ID cleared.",
        "success",
      );
    });
  }

  return (
    <Card className="p-5">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <div>
          <h3 className="text-base font-semibold text-foreground">
            Google sign-in (native app)
          </h3>
          <p className="mt-0.5 text-xs text-muted">
            Web Client ID used by the Android/iOS app to request a Google ID
            token. Web sign-in is unaffected — that flow goes through
            Supabase&rsquo;s hosted OAuth. {configured ? "Set." : "Not set — Google button is hidden on native."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusDot configured={configured} />
          <ChevronDown
            className={
              "size-4 text-muted transition-transform " +
              (expanded ? "rotate-180" : "")
            }
          />
        </div>
      </button>

      {expanded && (
        <>
          <div className="mt-4">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-foreground">
                Web OAuth Client ID
              </span>
              <Input
                type="text"
                inputMode="text"
                autoComplete="off"
                spellCheck={false}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="624839566857-xxxx.apps.googleusercontent.com"
                className="font-mono text-xs"
              />
              <span className="mt-1 block text-xs text-muted">
                The Client ID is public — only the Client Secret is sensitive.
                Leave blank to hide the Google button inside the app.
              </span>
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <Button
              variant="primary"
              size="sm"
              loading={pending}
              disabled={pending || !dirty}
              onClick={save}
            >
              Save
            </Button>
            {configured && (
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => {
                  if (!globalThis.confirm("Clear the saved Client ID?")) return;
                  setDraft("");
                  startTransition(async () => {
                    const res = await setGoogleOauthWebClientIdAction("");
                    if (!res.ok) {
                      toast(res.error, "error");
                      return;
                    }
                    setSavedClientId("");
                    toast("Saved Client ID removed.", "success");
                  });
                }}
                className="text-danger hover:bg-danger/10 hover:text-danger"
              >
                Remove
              </Button>
            )}
          </div>

          <details className="mt-4 text-xs text-muted">
            <summary className="cursor-pointer select-none hover:text-foreground">
              Setup instructions
            </summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>
                Find the existing Web OAuth Client ID in{" "}
                <a
                  href="https://supabase.com/dashboard/project/hxbjkezyecahhieymbxn/auth/providers"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-primary underline"
                >
                  Supabase Auth &rarr; Providers &rarr; Google
                </a>{" "}
                (the value already powering your web sign-in).
              </li>
              <li>Paste it above and Save.</li>
              <li>
                Back in Supabase&rsquo;s Google provider config, also append
                this Client ID to the &ldquo;Authorized Client IDs (comma
                separated)&rdquo; field so{" "}
                <code>signInWithIdToken</code> accepts tokens minted for it.
              </li>
              <li>
                Ship the next Android AAB &mdash; it bundles the
                @capgo/capacitor-social-login plugin; until that AAB is
                installed the button stays hidden even if this is set.
              </li>
            </ol>
          </details>
        </>
      )}
    </Card>
  );
}

function StatusDot({ configured }: { configured: boolean }) {
  return configured ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
      <CheckCircle2 className="size-3" /> Configured
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface-inset px-2 py-0.5 text-xs font-medium text-muted ring-1 ring-border">
      <CircleAlert className="size-3" /> Not set
    </span>
  );
}
