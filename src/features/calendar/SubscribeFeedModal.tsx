"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Copy, RefreshCw, X } from "lucide-react";
import { Button, useToast } from "@/components/ui";
import {
  getOrCreateCalendarTokenAction,
  regenerateCalendarTokenAction,
} from "@/app/actions/calendar";

export function SubscribeFeedModal({
  playbookId,
  viewerIsCoach,
  onClose,
}: {
  playbookId: string;
  viewerIsCoach: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<"https" | "webcal" | null>(null);
  const [rotating, startRotate] = useTransition();

  useEffect(() => {
    let cancelled = false;
    getOrCreateCalendarTokenAction(playbookId).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setToken(res.token);
        setError(null);
      } else {
        setError(res.error);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [playbookId]);

  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://www.xogridmaker.com";
  const httpsUrl = token
    ? `${origin}/api/calendar/${playbookId}/${token}`
    : "";
  const webcalUrl = httpsUrl.replace(/^https?:\/\//, "webcal://");

  function copy(kind: "https" | "webcal") {
    const url = kind === "https" ? httpsUrl : webcalUrl;
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(kind);
      setTimeout(() => setCopied((c) => (c === kind ? null : c)), 1800);
    });
  }

  function rotate() {
    if (!viewerIsCoach) return;
    if (
      !window.confirm(
        "Rotate the link? Anyone subscribed with the current link will stop receiving updates.",
      )
    ) {
      return;
    }
    startRotate(() => {
      regenerateCalendarTokenAction(playbookId).then((res) => {
        if (!res.ok) {
          toast(res.error, "error");
          return;
        }
        setToken(res.token);
        toast("Calendar link rotated.", "success");
      });
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-surface p-5 shadow-xl ring-1 ring-border sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">
            Subscribe to this calendar
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted hover:bg-surface-hover"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <p className="mb-4 text-sm text-muted">
          Add this calendar to Apple Calendar, Google Calendar, or Outlook.
          Updates show up automatically.
        </p>

        {loading && (
          <p className="py-6 text-center text-sm text-muted">Loading…</p>
        )}
        {error && !loading && (
          <p className="py-6 text-center text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        {!loading && !error && token && (
          <div className="space-y-4">
            <UrlRow
              label="Tap on iPhone / Mac (one-tap subscribe)"
              url={webcalUrl}
              onCopy={() => copy("webcal")}
              copied={copied === "webcal"}
              clickable
            />
            <UrlRow
              label="Google Calendar / Outlook (paste this URL)"
              url={httpsUrl}
              onCopy={() => copy("https")}
              copied={copied === "https"}
            />

            <details className="rounded-lg ring-1 ring-border">
              <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium text-muted hover:bg-surface-hover">
                How to add this in each app
              </summary>
              <div className="space-y-2 px-3 pb-3 text-xs text-muted">
                <p>
                  <strong className="text-foreground">iPhone / iPad:</strong>{" "}
                  Tap the webcal:// link above and confirm.
                </p>
                <p>
                  <strong className="text-foreground">Mac Calendar:</strong>{" "}
                  File → New Calendar Subscription, paste the webcal:// URL.
                </p>
                <p>
                  <strong className="text-foreground">Google Calendar:</strong>{" "}
                  Other calendars → + → From URL, paste the https:// URL.
                </p>
                <p>
                  <strong className="text-foreground">Outlook:</strong> Add
                  calendar → Subscribe from web, paste the https:// URL.
                </p>
              </div>
            </details>

            {viewerIsCoach && (
              <div className="border-t border-border pt-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={rotate}
                  disabled={rotating}
                  className="w-full"
                >
                  <RefreshCw
                    className={"mr-1.5 size-3.5" + (rotating ? " animate-spin" : "")}
                  />
                  {rotating ? "Rotating…" : "Rotate link"}
                </Button>
                <p className="mt-1 text-xs text-muted">
                  Use this if a link was shared somewhere it shouldn’t have
                  been.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function UrlRow({
  label,
  url,
  onCopy,
  copied,
  clickable,
}: {
  label: string;
  url: string;
  onCopy: () => void;
  copied: boolean;
  clickable?: boolean;
}) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-muted">{label}</div>
      <div className="flex items-stretch gap-2">
        {clickable ? (
          <a
            href={url}
            className="flex-1 truncate rounded-md bg-surface-hover px-2.5 py-2 text-xs text-foreground ring-1 ring-border hover:underline"
          >
            {url}
          </a>
        ) : (
          <div className="flex-1 truncate rounded-md bg-surface-hover px-2.5 py-2 text-xs text-foreground ring-1 ring-border">
            {url}
          </div>
        )}
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center justify-center rounded-md px-2.5 ring-1 ring-border hover:bg-surface-hover"
          title="Copy"
        >
          {copied ? (
            <Check className="size-3.5 text-green-600" />
          ) : (
            <Copy className="size-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}
