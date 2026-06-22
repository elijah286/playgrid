"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { isNativeApp } from "@/lib/native/isNativeApp";
import { track } from "@/lib/analytics/track";
import {
  APP_STORE_URL,
  appPlatform,
  playStoreUrl,
  type AppPlatform,
} from "@/lib/native/appStore";

/**
 * "Get the app for notifications" callout.
 *
 * Push notifications are native-app only — a member who joins on the web never
 * hears about games, schedule changes, or messages until they install the app.
 * This nudges them right at the moment that gap matters (e.g. just-joined a
 * team).
 *
 * Platform-aware: a direct store button on iOS/Android; a scan-to-install QR on
 * desktop, pointing at /get-app (which redirects the phone to the right store).
 * Renders nothing inside the native app — they already have it — and nothing
 * until the platform is resolved on mount (the checks need the browser).
 */
export function GetTheAppCallout({
  source = "join",
}: {
  /** Where this callout lives — used for analytics + the Play referrer tag. */
  source?: string;
}) {
  const [platform, setPlatform] = useState<
    AppPlatform | "native" | undefined
  >(undefined);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    const p = isNativeApp()
      ? "native"
      : appPlatform(navigator.userAgent, navigator.maxTouchPoints);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlatform(p);
    if (p !== "native") {
      track({
        event: "get_app_callout_view",
        target: source,
        metadata: { platform: p },
      });
    }
  }, [source]);

  useEffect(() => {
    if (platform !== "desktop") return;
    const url = `${window.location.origin}/get-app?s=${encodeURIComponent(source)}`;
    let cancelled = false;
    QRCode.toDataURL(url, { width: 160, margin: 1 })
      .then((d) => {
        if (!cancelled) setQrDataUrl(d);
      })
      .catch(() => {
        /* QR is a nicety — ignore generation failures */
      });
    return () => {
      cancelled = true;
    };
  }, [platform, source]);

  if (platform === undefined || platform === "native") return null;

  const href =
    platform === "android"
      ? playStoreUrl({
          source,
          medium: "get_app_callout",
          campaign: "app_for_notifications",
        })
      : APP_STORE_URL;
  const buttonLabel =
    platform === "android"
      ? "Get it on Google Play"
      : "Download on the App Store";

  return (
    <div className="rounded-lg border border-border bg-surface-inset p-3 text-left">
      <p className="text-xs font-semibold text-foreground">
        Get the app so you don&apos;t miss a thing
      </p>
      <p className="mt-0.5 text-xs text-muted">
        Game times, schedule changes, and team messages come through as push
        notifications — only on the XO Gridmaker app.
      </p>
      {platform === "desktop" ? (
        <div className="mt-2 flex items-center gap-3">
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrDataUrl}
              alt="Scan to get the XO Gridmaker app"
              width={64}
              height={64}
              className="size-16 shrink-0 rounded bg-white p-1"
            />
          ) : (
            <div className="size-16 shrink-0 rounded bg-surface" />
          )}
          <p className="text-xs text-muted">
            Scan with your phone&apos;s camera to install on iPhone or Android.
          </p>
        </div>
      ) : (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() =>
            track({
              event: "get_app_callout_click",
              target: source,
              metadata: { platform },
            })
          }
          className="mt-2 inline-flex items-center justify-center rounded-full bg-primary px-4 py-1.5 text-sm font-bold text-white transition-transform hover:-translate-y-0.5"
        >
          {buttonLabel}
        </a>
      )}
    </div>
  );
}
