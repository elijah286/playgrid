import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isNativeUserAgent } from "@/lib/native/nativeRequest";
import {
  APP_STORE_URL,
  appPlatform,
  playStoreUrl,
} from "@/lib/native/appStore";

export const metadata: Metadata = {
  title: "Get the app",
  description:
    "Download XO Gridmaker for iPhone or Android to get push notifications for games, schedule changes, and team messages.",
  // A throwaway redirect target — keep it out of the index.
  robots: { index: false, follow: false },
};

/**
 * Smart "get the app" link. Server-detects the platform from the User-Agent and
 * sends mobile visitors straight to the right store; desktop visitors get a
 * page with both stores (the desktop QR in <GetTheAppCallout> points here, so a
 * scan from a phone lands on the store). Shareable anywhere — e.g. xogridmaker
 * .com/get-app — without the caller needing to know the device.
 */
export default async function GetAppPage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string }>;
}) {
  const { s } = await searchParams;
  const source = typeof s === "string" && s ? s : "get_app_link";
  const ua = (await headers()).get("user-agent") ?? "";

  // Already inside the native app — nothing to install.
  if (isNativeUserAgent(ua)) redirect("/home");

  const platform = appPlatform(ua);
  const utm = {
    source,
    medium: "get_app_link",
    campaign: "app_for_notifications",
  };
  if (platform === "ios") redirect(APP_STORE_URL);
  if (platform === "android") redirect(playStoreUrl(utm));

  // Desktop / undetected: offer both stores.
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16">
      <div className="rounded-2xl border border-border bg-surface p-6 text-center shadow-sm">
        <h1 className="text-lg font-bold text-foreground">
          Get the XO Gridmaker app
        </h1>
        <p className="mt-1 text-sm text-muted">
          Push notifications for games, schedule changes, and team messages live
          in the app. Grab it on your phone:
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <a
            href={APP_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-bold text-white transition-transform hover:-translate-y-0.5"
          >
            Download on the App Store
          </a>
          <a
            href={playStoreUrl(utm)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-full border border-border bg-surface px-4 py-2 text-sm font-bold text-foreground transition-colors hover:bg-surface-inset"
          >
            Get it on Google Play
          </a>
        </div>
      </div>
    </main>
  );
}
