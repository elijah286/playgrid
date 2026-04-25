"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, ChevronDown, CircleAlert } from "lucide-react";
import { Button, Card, Input, useToast } from "@/components/ui";
import {
  clearGoogleMapsApiKeyAction,
  getGoogleMapsStatusAction,
  saveGoogleMapsApiKeyAction,
  testGoogleMapsApiKeyAction,
} from "@/app/actions/admin-google-maps";

type Initial = {
  configured: boolean;
  statusLabel: string;
  updatedAt: string | null;
};

export function GoogleMapsSettingsClient({ initial }: { initial: Initial }) {
  const { toast } = useToast();
  const [configured, setConfigured] = useState(initial.configured);
  const [statusLabel, setStatusLabel] = useState(initial.statusLabel);
  const [draftKey, setDraftKey] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();

  function refreshStatus() {
    startTransition(async () => {
      const res = await getGoogleMapsStatusAction();
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      setConfigured(res.configured);
      setStatusLabel(res.statusLabel);
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
          <h3 className="text-base font-semibold text-foreground">Google Maps</h3>
          <p className="mt-0.5 text-xs text-muted">
            Powers location autocomplete and map previews on team calendar
            events. {statusLabel}
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
                API key
              </span>
              <Input
                type="password"
                autoComplete="off"
                value={draftKey}
                onChange={(e) => setDraftKey(e.target.value)}
                placeholder={configured ? "••••••••••••" : "AIza…"}
              />
              {configured && (
                <span className="mt-1 block text-xs text-muted">
                  Leave blank to keep the current key.
                </span>
              )}
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                size="sm"
                loading={pending}
                disabled={pending || !draftKey.trim()}
                onClick={() => {
                  startTransition(async () => {
                    const res = await saveGoogleMapsApiKeyAction(draftKey);
                    if (!res.ok) {
                      toast(res.error, "error");
                      return;
                    }
                    setDraftKey("");
                    toast("Key saved.", "success");
                    refreshStatus();
                  });
                }}
              >
                Save key
              </Button>
              <Button
                size="sm"
                disabled={pending || (!draftKey.trim() && !configured)}
                onClick={() => {
                  startTransition(async () => {
                    const res = await testGoogleMapsApiKeyAction(
                      draftKey || undefined,
                    );
                    if (!res.ok) toast(res.error, "error");
                    else toast(res.message, "success");
                  });
                }}
              >
                Test key
              </Button>
            </div>
            {configured && (
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => {
                  if (
                    !globalThis.confirm("Remove the saved Google Maps API key?")
                  )
                    return;
                  startTransition(async () => {
                    const res = await clearGoogleMapsApiKeyAction();
                    if (!res.ok) {
                      toast(res.error, "error");
                      return;
                    }
                    toast("Saved key removed.", "success");
                    refreshStatus();
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
                Open the{" "}
                <a
                  href="https://console.cloud.google.com/google/maps-apis/start"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-primary underline"
                >
                  Google Maps Platform console
                </a>
                .
              </li>
              <li>Create or select a project, then enable billing.</li>
              <li>
                Enable these APIs: <strong>Places API (New)</strong>,{" "}
                <strong>Maps JavaScript API</strong>,{" "}
                <strong>Maps Static API</strong>, and{" "}
                <strong>Geocoding API</strong>.
              </li>
              <li>
                Credentials → Create credentials → API key. Restrict the key by
                HTTP referrer for your domain and to the four APIs above.
              </li>
              <li>Paste the <code>AIza…</code> key above, Test, then Save.</li>
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
