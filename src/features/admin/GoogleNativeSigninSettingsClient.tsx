"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, ChevronDown, CircleAlert } from "lucide-react";
import { Button, Card, Input, useToast } from "@/components/ui";
import {
  setGoogleOauthIosClientIdAction,
  setGoogleOauthWebClientIdAction,
} from "@/app/actions/admin-auth-providers";

type Initial = {
  clientId: string | null;
  iosClientId: string | null;
};

export function GoogleNativeSigninSettingsClient({ initial }: { initial: Initial }) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);

  const [savedClientId, setSavedClientId] = useState(initial.clientId ?? "");
  const [draft, setDraft] = useState(initial.clientId ?? "");
  const [savedIosClientId, setSavedIosClientId] = useState(
    initial.iosClientId ?? "",
  );
  const [iosDraft, setIosDraft] = useState(initial.iosClientId ?? "");
  const [pending, startTransition] = useTransition();

  const webConfigured = savedClientId.trim().length > 0;
  const iosConfigured = savedIosClientId.trim().length > 0;
  // The header dot reflects the web client ID — the minimum needed for
  // Android. iOS layers on top and has its own row-level status.
  const configured = webConfigured;
  const webDirty = draft.trim() !== savedClientId.trim();
  const iosDirty = iosDraft.trim() !== savedIosClientId.trim();

  function saveWeb() {
    startTransition(async () => {
      const res = await setGoogleOauthWebClientIdAction(draft);
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      const next = res.clientId ?? "";
      setSavedClientId(next);
      setDraft(next);
      toast(next.length > 0 ? "Web Client ID saved." : "Web Client ID cleared.", "success");
    });
  }

  function saveIos() {
    startTransition(async () => {
      const res = await setGoogleOauthIosClientIdAction(iosDraft);
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      const next = res.clientId ?? "";
      setSavedIosClientId(next);
      setIosDraft(next);
      toast(next.length > 0 ? "iOS Client ID saved." : "iOS Client ID cleared.", "success");
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
            Client IDs the Android/iOS app uses to request a Google ID token.
            Web sign-in is unaffected — that flow goes through Supabase&rsquo;s
            hosted OAuth. {configured ? "Set." : "Not set — Google button is hidden on native."}
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
                Web OAuth Client ID{" "}
                <span className="font-normal text-muted">(Android + iOS server client)</span>
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
            <div className="mt-2">
              <Button
                variant="primary"
                size="sm"
                loading={pending}
                disabled={pending || !webDirty}
                onClick={saveWeb}
              >
                Save web ID
              </Button>
            </div>
          </div>

          <div className="mt-5 border-t border-border pt-4">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-foreground">
                iOS OAuth Client ID{" "}
                <span className="font-normal text-muted">(required for iOS)</span>
              </span>
              <Input
                type="text"
                inputMode="text"
                autoComplete="off"
                spellCheck={false}
                value={iosDraft}
                onChange={(e) => setIosDraft(e.target.value)}
                placeholder="624839566857-zzzz.apps.googleusercontent.com"
                className="font-mono text-xs"
              />
              <span className="mt-1 block text-xs text-muted">
                A separate <strong>iOS-type</strong> OAuth client (bound to the
                bundle ID). Its reversed form is baked into the app&rsquo;s
                Info.plist URL scheme, so changing it needs a new build. Also add
                it to Supabase &rarr; Google &rarr; Authorized Client IDs, or iOS
                tokens are rejected. {iosConfigured ? "Set." : "Not set — Google button is hidden on iOS."}
              </span>
            </label>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                loading={pending}
                disabled={pending || !iosDirty}
                onClick={saveIos}
              >
                Save iOS ID
              </Button>
              <StatusDot configured={iosConfigured} />
            </div>
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
                (the value already powering your web sign-in). Paste it into
                &ldquo;Web OAuth Client ID&rdquo; and Save.
              </li>
              <li>
                In{" "}
                <a
                  href="https://console.cloud.google.com/apis/credentials"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-primary underline"
                >
                  Google Cloud &rarr; Credentials
                </a>
                , create an <strong>OAuth client ID &rarr; iOS</strong> with
                bundle ID <code>com.xogridmaker.app</code>. Paste the result into
                &ldquo;iOS OAuth Client ID&rdquo; and Save.
              </li>
              <li>
                Back in Supabase&rsquo;s Google provider, append{" "}
                <strong>both</strong> Client IDs to &ldquo;Authorized Client IDs
                (comma separated)&rdquo; so <code>signInWithIdToken</code> accepts
                tokens minted for either platform.
              </li>
              <li>
                Ship the next native build — it bundles the
                @capgo/capacitor-social-login plugin and the iOS URL scheme.
                Until that build is installed the button stays hidden even if
                these are set.
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
