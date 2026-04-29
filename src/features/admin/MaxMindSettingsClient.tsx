"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, ChevronDown, CircleAlert } from "lucide-react";
import { Button, Card, Input, useToast } from "@/components/ui";
import {
  clearMaxMindLicenseKeyAction,
  getMaxMindStatusAction,
  refreshMaxMindDbAction,
  saveMaxMindLicenseKeyAction,
} from "@/app/actions/admin-maxmind";

type Initial = {
  configured: boolean;
  statusLabel: string;
  downloadedAt: string | null;
};

export function MaxMindSettingsClient({ initial }: { initial: Initial }) {
  const { toast } = useToast();
  const [configured, setConfigured] = useState(initial.configured);
  const [statusLabel, setStatusLabel] = useState(initial.statusLabel);
  const [downloadedAt, setDownloadedAt] = useState(initial.downloadedAt);
  const [draftKey, setDraftKey] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();

  function refreshStatus() {
    startTransition(async () => {
      const res = await getMaxMindStatusAction();
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      setConfigured(res.configured);
      setStatusLabel(res.statusLabel);
      setDownloadedAt(res.downloadedAt);
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
            MaxMind GeoLite2
          </h3>
          <p className="mt-0.5 text-xs text-muted">
            Resolves visitor IPs to country, region, and city for traffic and
            campaign analytics. Free GeoLite2 license; the database file is
            cached on the server and refreshed monthly. {statusLabel}
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
                License key
              </span>
              <Input
                type="password"
                autoComplete="off"
                value={draftKey}
                onChange={(e) => setDraftKey(e.target.value)}
                placeholder={configured ? "••••••••••••" : "Your GeoLite2 license key"}
              />
              {configured && (
                <span className="mt-1 block text-xs text-muted">
                  Leave blank to keep the current key.
                </span>
              )}
            </label>
            {downloadedAt && (
              <p className="mt-2 text-xs text-muted">
                Database last downloaded:{" "}
                {new Date(downloadedAt).toLocaleString()}
              </p>
            )}
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
                    const res = await saveMaxMindLicenseKeyAction(draftKey);
                    if (!res.ok) {
                      toast(res.error, "error");
                      return;
                    }
                    setDraftKey("");
                    toast("License key saved.", "success");
                    refreshStatus();
                  });
                }}
              >
                Save key
              </Button>
              {configured && (
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    startTransition(async () => {
                      const res = await refreshMaxMindDbAction();
                      if (!res.ok) {
                        toast(res.error, "error");
                        return;
                      }
                      setDownloadedAt(res.downloadedAt);
                      toast("Database refreshed.", "success");
                    });
                  }}
                >
                  Refresh database
                </Button>
              )}
            </div>
            {configured && (
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => {
                  if (
                    !globalThis.confirm("Remove the saved MaxMind license key?")
                  )
                    return;
                  startTransition(async () => {
                    const res = await clearMaxMindLicenseKeyAction();
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
                Create a free account at{" "}
                <a
                  href="https://www.maxmind.com/en/geolite2/signup"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-primary underline"
                >
                  maxmind.com
                </a>
                .
              </li>
              <li>
                Go to <strong>Account → Manage License Keys</strong> and
                generate a new key (any description; no expiration).
              </li>
              <li>
                Paste the key above and Save. The first traffic event after
                saving will trigger an automatic database download.
              </li>
              <li>
                Click <strong>Refresh database</strong> monthly to pull the
                latest GeoLite2 release.
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
