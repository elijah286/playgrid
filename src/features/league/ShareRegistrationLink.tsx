"use client";

import { useState } from "react";

export function ShareRegistrationLink({
  url,
  qrDataUrl,
}: {
  url: string;
  qrDataUrl: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      globalThis.setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — the field is selectable as a fallback
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-surface-raised p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrDataUrl}
          alt="Registration QR code"
          width={132}
          height={132}
          className="mx-auto shrink-0 rounded-lg border border-border bg-white p-2 sm:mx-0"
        />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-foreground">Parent registration link</div>
          <p className="mt-0.5 text-xs text-muted">
            Share this link or QR code with families. It works once registration is open.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <input
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full truncate rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted"
            />
            <button
              type="button"
              onClick={copy}
              className="shrink-0 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-hover"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <a
            href={qrDataUrl}
            download="registration-qr.png"
            className="mt-2 inline-block text-xs font-medium text-primary hover:underline"
          >
            Download QR code
          </a>
        </div>
      </div>
    </div>
  );
}
