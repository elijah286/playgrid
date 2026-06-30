import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ConfigBanner } from "@/components/layout/ConfigBanner";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { GlobalBottomNav } from "@/components/layout/GlobalBottomNav";
import { FieldBackdrop } from "@/components/layout/FieldBackdrop";
import { ToastProvider } from "@/components/ui/Toast";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { TutorialProvider } from "@/features/tutorials/engine/TutorialProvider";
import PageViewTracker from "@/components/PageViewTracker";
import WebVitalsReporter from "@/components/WebVitalsReporter";
import ConsentGate from "@/components/ConsentGate";
import RedditPixel from "@/components/RedditPixel";
import MetaPixel from "@/components/MetaPixel";
import { NativeAppShell } from "@/components/native/NativeAppShell";
import { PullToRefresh } from "@/components/native/PullToRefresh";
import { AppInstallBanner } from "@/components/native/AppInstallBanner";
import { IosAppBanner } from "@/components/native/IosAppBanner";
import { OfflineStatusBanner } from "@/components/offline/OfflineStatusBanner";
import { ConnectionRecovery } from "@/components/system/ConnectionRecovery";
import { withFullContext } from "@/lib/seo/ld-json";
import { NATIVE_APP_UA_MARKER } from "@/lib/native/nativeRequest";
import { APP_STORE_ID, appStoreConfigured } from "@/lib/native/appStore";
import { getRequestUser } from "@/lib/supabase/request-user";
import { getCachedUserRole } from "@/lib/auth/profile-cache";
import { listInboxAlertsAction } from "@/app/actions/inbox";
import { InboxBadgeProvider } from "@/features/dashboard/InboxBadgeContext";
import { InboxBadgeRefresher } from "@/components/layout/InboxBadgeRefresher";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.xogridmaker.com";
const FACEBOOK_URL = "https://www.facebook.com/profile.php?id=61589257046303";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "XO Gridmaker — Football play designer & playbook builder",
    template: "%s · XO Gridmaker",
  },
  description:
    "Create custom playbooks and share them with your team. Quickly generate game-ready wristbands and play sheets. Designed for flag, 7v7, and tackle football coaches.",
  applicationName: "XO Gridmaker",
  authors: [{ name: "XO Gridmaker" }],
  creator: "XO Gridmaker",
  publisher: "XO Gridmaker",
  keywords: [
    "football playbook",
    "play designer",
    "football plays",
    "flag football",
    "7v7",
    "youth football",
    "wristband",
    "coach tools",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "XO Gridmaker",
    title: "XO Gridmaker — Football play designer & playbook builder",
    description:
      "Create custom playbooks and share them with your team. Quickly generate game-ready wristbands and play sheets. Designed for flag, 7v7, and tackle football coaches.",
    locale: "en_US",
  },
  other: {
    "article:publisher": FACEBOOK_URL,
    // Apple Smart App Banner — Mobile Safari renders this natively (and shows
    // "Open" when the app is already installed). Non-Safari iOS browsers get
    // the custom <IosAppBanner> instead. Emitted only once the App Store id is
    // real so we never ship app-id=undefined.
    ...(appStoreConfigured()
      ? { "apple-itunes-app": `app-id=${APP_STORE_ID}, app-argument=${SITE_URL}` }
      : {}),
  },
  twitter: {
    card: "summary_large_image",
    title: "XO Gridmaker — Football play designer & playbook builder",
    description:
      "Create custom playbooks and share them with your team. Quickly generate game-ready wristbands and play sheets.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  category: "sports",
};

export const viewport: Viewport = {
  // viewportFit=cover lets the WebView render edge-to-edge into the
  // status-bar zone and behind the home indicator. Components opt into
  // safe-area insets where their content needs to clear those zones —
  // header background can fill the notch while text padding holds it
  // below; landscape play view actually reaches the screen edges.
  viewportFit: "cover",
  // themeColor pins the iOS Safari URL bar tint to bg-surface dark
  // instead of letting Safari sample page content (which inconsistently
  // picked up the playbook chrome's gradient color on some routes,
  // making the URL bar tint red on the play view but dark on the
  // playbook list).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAFAF8" },
    { media: "(prefers-color-scheme: dark)", color: "#0F1115" },
  ],
};

const structuredData = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "XO Gridmaker",
    legalName: "XO Gridmaker",
    url: SITE_URL,
    description:
      "XO Gridmaker is a football play designer for coaches and athletes — build plays, organize playbooks, and preview wristbands.",
    sameAs: [FACEBOOK_URL],
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "XO Gridmaker",
    url: SITE_URL,
  },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "XO Gridmaker",
    applicationCategory: "SportsApplication",
    operatingSystem: "Web",
    url: SITE_URL,
    description:
      "Design football plays, organize them into playbooks, preview wristbands, and carry your playbook to the field.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
    },
  },
];

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let isAuthed = false;
  let userId: string | null = null;
  // Single request-scoped auth check, shared with SiteHeader +
  // GlobalBottomNav via React cache() (see request-user.ts) so one
  // navigation makes one getUser() round-trip instead of three. Time-bound
  // inside the helper: on timeout we fall through as not-authed — the worst
  // case is a logged-out shell flash; the next request retries and recovers.
  const authResult = await getRequestUser();
  if (authResult.kind === "ok" && authResult.user) {
    isAuthed = true;
    userId = authResult.user.id;
  }

  // Server-render the initial inbox badge baseline so the bell can paint
  // with the right count on first byte (rather than 0-then-pop). The
  // InboxBadgeRefresher keeps it live thereafter via a 60s poll. Both
  // are gated on auth — anonymous visitors don't have an inbox.
  let inboxCount = 0;
  let inboxUrgent = false;
  if (isAuthed && userId) {
    try {
      const [role, inboxRes] = await Promise.all([
        getCachedUserRole(userId),
        listInboxAlertsAction(),
      ]);
      const isAdmin = role === "admin";
      if (inboxRes.ok) {
        const visible = inboxRes.alerts.filter(
          (a) => isAdmin || a.kind !== "admin_notice",
        );
        const active = visible.filter((a) => a.status === "active");
        inboxCount = active.length;
        inboxUrgent = active.some(
          (a) => a.kind === "rsvp_pending" || a.kind === "system_alert",
        );
      }
    } catch {
      /* best effort — badge starts at 0 and the poller catches up */
    }
  }

  return (
    <html lang="en" className={`h-full scroll-smooth antialiased ${inter.variable}`} suppressHydrationWarning>
      <head>
        {/* Apply color scheme before hydration to avoid flash. Only honor a
            dark preference for logged-in users; visitors always see light. */}
        {isAuthed ? (
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(){try{var k='playgrid-color-scheme';var v=localStorage.getItem(k);if(v!=='light'&&v!=='dark'&&v!=='system')v='system';var d=v==='dark'||(v==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`,
            }}
          />
        ) : (
          <script
            dangerouslySetInnerHTML={{
              __html: `document.documentElement.classList.remove('dark');`,
            }}
          />
        )}
        {/* Tag the document as a Capacitor shell before paint so the loading
            overlay AND the billing gate (html.native-shell rules in globals.css)
            are correct from the first frame, without waiting for React.
            window.Capacitor is injected by the runtime before the page loads, so
            the primary check is reliable on native and false on web; the
            User-Agent marker (appendUserAgent in capacitor.config.ts) is a
            belt-and-suspenders fallback that's present from the first byte even
            if the bridge object isn't ready yet. Either signal flips the gate;
            neither can be true in a plain web browser. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var c=window.Capacitor;var bridge=!!(c&&c.isNativePlatform&&c.isNativePlatform());var ua=(navigator.userAgent||'').indexOf(${JSON.stringify(NATIVE_APP_UA_MARKER)})!==-1;if(bridge||ua){document.documentElement.classList.add('native-shell');}}catch(e){}})();`,
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(withFullContext(structuredData)) }}
        />
      </head>
      <body className="flex min-h-[100dvh] flex-col bg-surface text-foreground font-sans [overflow-x:clip]">
        {/* Native loading overlay. Hidden on web (display:none unless
            <html> has .native-shell). Bridges the gap between the native
            splash hiding and the dashboard hydrating so coaches don't see
            a black/blank flash on cold launch. NativeAppShell adds
            .native-ready to <html> on the first paint after hydration to
            fade it out. */}
        <div id="native-loading-overlay" aria-hidden="true">
          <img
            src="/brand/xogridmaker_monogram.svg"
            alt=""
            width={120}
            height={120}
            decoding="sync"
          />
          <div className="bar" />
        </div>
        <ThemeProvider forceLight={!isAuthed}>
          <FieldBackdrop />
          <ToastProvider>
            <TutorialProvider>
              <InboxBadgeProvider
                initialCount={inboxCount}
                initialUrgent={inboxUrgent}
              >
                <ConfigBanner />
                <AppInstallBanner />
                <IosAppBanner />
                <SiteHeader />
                <div className="flex flex-1 flex-col">{children}</div>
                <SiteFooter />
                {/* Global mobile bottom nav for authed users, on every
                    route. Self-gates on auth and bails on routes that own
                    their own bottom bar (editor, playbook, viewer, Cal
                    chat) — see GlobalBottomNav / isOwnBottomBarRoute. Lives
                    here (not in the dashboard layout) so resource pages
                    like /learn never strand a coach without primary nav. */}
                <GlobalBottomNav />
                <PageViewTracker />
                <WebVitalsReporter />
                <ConsentGate />
                <RedditPixel />
                <MetaPixel />
                <NativeAppShell />
                <PullToRefresh />
                <OfflineStatusBanner />
                <ConnectionRecovery />
                {isAuthed && <InboxBadgeRefresher />}
              </InboxBadgeProvider>
            </TutorialProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
