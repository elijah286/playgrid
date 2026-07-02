"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, ChevronDown, CircleAlert } from "lucide-react";
import { Button, Card, Input, useToast } from "@/components/ui";
import {
  clearRedditPixelIdAction,
  getRedditPixelStatusAction,
  saveRedditPixelIdAction,
} from "@/app/actions/admin-reddit-pixel";

type Initial = {
  configured: boolean;
  statusLabel: string;
};

export function RedditPixelSettingsClient({ initial }: { initial: Initial }) {
  const { toast } = useToast();
  const [configured, setConfigured] = useState(initial.configured);
  const [statusLabel, setStatusLabel] = useState(initial.statusLabel);
  const [draftId, setDraftId] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();

  function refreshStatus() {
    startTransition(async () => {
      const res = await getRedditPixelStatusAction();
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
          <h3 className="text-base font-semibold text-foreground">
            Reddit Ads pixel
          </h3>
          <p className="mt-0.5 text-xs text-muted">
            Fires PageVisit on every page and SignUp after a fresh signup so
            Reddit&apos;s Events Manager can attribute conversions to ad
            clicks. Consent-gated for EU/UK visitors. {statusLabel}
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
                Pixel ID
              </span>
              <Input
                autoComplete="off"
                value={draftId}
                onChange={(e) => setDraftId(e.target.value)}
                placeholder={configured ? "Replace saved ID" : "e.g. t2_xxxxxxx"}
              />
              {configured && (
                <span className="mt-1 block text-xs text-muted">
                  Leave blank to keep the current ID.
                </span>
              )}
            </label>
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <Button
              variant="primary"
              size="sm"
              loading={pending}
              disabled={pending || !draftId.trim()}
              onClick={() => {
                startTransition(async () => {
                  const res = await saveRedditPixelIdAction(draftId);
                  if (!res.ok) {
                    toast(res.error, "error");
                    return;
                  }
                  setDraftId("");
                  toast("Pixel ID saved.", "success");
                  refreshStatus();
                });
              }}
            >
              Save pixel ID
            </Button>
            {configured && (
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => {
                  if (
                    !globalThis.confirm("Remove the saved Reddit pixel ID?")
                  )
                    return;
                  startTransition(async () => {
                    const res = await clearRedditPixelIdAction();
                    if (!res.ok) {
                      toast(res.error, "error");
                      return;
                    }
                    toast("Saved ID removed.", "success");
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
                Sign in at{" "}
                <a
                  href="https://ads.reddit.com/"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-primary underline"
                >
                  ads.reddit.com
                </a>
                .
              </li>
              <li>
                Open <strong>Events Manager → Conversions</strong> and copy the
                Pixel ID for this account.
              </li>
              <li>
                Paste the ID above and Save. The next page render will load
                the pixel and start reporting PageVisit + SignUp events.
              </li>
              <li>
                Verify in Events Manager → events should appear within a few
                minutes of normal traffic.
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
