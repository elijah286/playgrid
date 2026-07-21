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
import { NativeBadgeSync } from "@/components/native/NativeBadgeSync";
import { HideOnAppShell } from "@/components/layout/HideOnAppShell";

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
  // Pin the layout viewport to device width at 100% scale, and — critically —
  // set a scale FLOOR of 1. Without a floor, iOS WKWebView "shrink-to-fit":
  // the moment ANY element momentarily overflows the viewport width (a
  // late-rendering banner, an async data-driven re-render like the 5s offline
  // refresh, a field a few px too wide), iOS zooms the ENTIRE page out to fit
  // and leaves it there until the next full reload. That is the "whole content
  // is slightly too small, pull-to-refresh fixes it, then it reverts after a
  // few seconds" bug: a page-level zoom, not a single mis-sized element, which
  // is why capping individual element widths only ever whack-a-moled it.
  // `minimumScale: 1` forbids the zoom-out entirely — overflow now scrolls or
  // clips instead of shrinking the page. Zoom-IN is left unrestricted so
  // accessibility pinch-zoom still works (no maximumScale / userScalable lock).
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
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
        {/* Cold-launch launch animation ("Night Formation"). Static inline
            SVG + CSS (globals.css, scoped to #native-loading-overlay) so it
            paints before hydration. Plays once — a formation collapses into
            the xo, the o runs a route, a spinning football is thrown deep and
            caught in stride, the route erases — then holds on the logo + a
            looping loading bar until NativeAppShell adds .native-ready.
            Theme-adaptive (globals.css): ground follows var(--color-surface),
            matching the theme-aware native LaunchScreen so there's no launch
            flash in either light or dark. */}
        <div
          id="native-loading-overlay"
          aria-hidden="true"
          dangerouslySetInnerHTML={{
            __html: `<svg viewBox="0 0 280 600" preserveAspectRatio="xMidYMid slice" aria-label="XO Gridmaker launch animation"><defs><radialGradient id="nlo-b1" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#1769FF" stop-opacity="0.42"/><stop offset="100%" stop-color="#1769FF" stop-opacity="0"/></radialGradient><radialGradient id="nlo-b2" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#95CC1F" stop-opacity="0.38"/><stop offset="100%" stop-color="#95CC1F" stop-opacity="0"/></radialGradient><clipPath id="nlo-fbclip"><path d="M-16,0 C-14.5,-7 -8,-12 0,-12 C8,-12 14.5,-7 16,0 C14.5,7 8,12 0,12 C-8,12 -14.5,7 -16,0 Z"/></clipPath><clipPath id="nlo-lbclip"><rect x="82" y="356" width="116" height="3.5" rx="1.75"/></clipPath></defs><rect class="nlo-bg" x="0" y="0" width="280" height="600"/><g class="scene"><g class="blooms"><circle class="bloom" cx="80" cy="250" r="130" fill="url(#nlo-b1)"/><circle class="bloom" cx="205" cy="360" r="130" fill="url(#nlo-b2)" style="animation-delay:1.5s"/></g><g class="field" stroke="#9fb0c8"><line x1="18" y1="308" x2="262" y2="308" stroke-opacity="0.34" stroke-width="1.6"/></g><path class="route n2r" d="M58,315 L58,244 L138,209" pathLength="100" fill="none" stroke="#FF7A00" stroke-width="5" stroke-linecap="butt" stroke-linejoin="round" style="filter:drop-shadow(0 0 6px rgba(255,122,0,.65))"/><polygon class="head h0" points="152,203 141,215.3 135.4,202.5" fill="#FF7A00" style="transform-origin:16% 51%;filter:drop-shadow(0 0 6px rgba(255,122,0,.6))"/><g stroke-linecap="round"><g class="piece pc1" style="--dx:14px;--dy:0px"><g stroke="#6f7887" stroke-width="2.6"><line x1="54" y1="318" x2="62" y2="326"/><line x1="62" y1="318" x2="54" y2="326"/></g></g><g class="piece pc2" style="--dx:52px;--dy:4px"><g stroke="#6f7887" stroke-width="2.6"><line x1="54" y1="318" x2="62" y2="326"/><line x1="62" y1="318" x2="54" y2="326"/></g></g><g class="piece pc2" style="--dx:82px;--dy:4px"><g stroke="#6f7887" stroke-width="2.6"><line x1="54" y1="318" x2="62" y2="326"/><line x1="62" y1="318" x2="54" y2="326"/></g></g><g class="piece pc3" style="--dx:112px;--dy:4px"><g stroke="#6f7887" stroke-width="2.6"><line x1="54" y1="318" x2="62" y2="326"/><line x1="62" y1="318" x2="54" y2="326"/></g></g><g class="piece pc3" style="--dx:140px;--dy:0px"><g stroke="#6f7887" stroke-width="2.6"><line x1="54" y1="318" x2="62" y2="326"/><line x1="62" y1="318" x2="54" y2="326"/></g></g><g class="piece pc3" style="--dx:172px;--dy:4px"><g stroke="#6f7887" stroke-width="2.6"><line x1="54" y1="318" x2="62" y2="326"/><line x1="62" y1="318" x2="54" y2="326"/></g></g><g class="piece qb" style="--dx:82px;--dy:44px;--qbx:36px;--qby:76px"><g stroke="#818b9c" stroke-width="2.9"><line x1="53" y1="317" x2="63" y2="327"/><line x1="63" y1="317" x2="53" y2="327"/></g></g><g class="piece pc3" style="--dx:30px;--dy:-122px"><circle cx="76" cy="322" r="4.6" fill="none" stroke="#6f7887" stroke-width="2.6"/></g><g class="piece pc3" style="--dx:106px;--dy:-122px"><circle cx="76" cy="322" r="4.6" fill="none" stroke="#6f7887" stroke-width="2.6"/></g><g class="piece pc1" style="--dx:-22px;--dy:-72px"><circle cx="76" cy="322" r="4.6" fill="none" stroke="#6f7887" stroke-width="2.6"/></g><g class="piece pc3" style="--dx:150px;--dy:-72px"><circle cx="76" cy="322" r="4.6" fill="none" stroke="#6f7887" stroke-width="2.6"/></g><g class="piece pc2" style="--dx:30px;--dy:-34px"><circle cx="76" cy="322" r="4.6" fill="none" stroke="#6f7887" stroke-width="2.6"/></g><g class="piece pc2" style="--dx:74px;--dy:-38px"><circle cx="76" cy="322" r="4.6" fill="none" stroke="#6f7887" stroke-width="2.6"/></g><g class="piece pc2" style="--dx:118px;--dy:-34px"><circle cx="76" cy="322" r="4.6" fill="none" stroke="#6f7887" stroke-width="2.6"/></g></g><text class="wm ig-x" x="50" y="332" font-size="30" font-style="italic" font-weight="800" fill="#1769FF">x</text><text class="wm ig-o" x="67" y="332" font-size="30" font-style="italic" font-weight="800" fill="#95CC1F">o</text><text class="wm n2-rest" x="85" y="332" font-size="30" font-style="italic" font-weight="800" fill="#E4E9F2">gridmaker</text><g class="loadbar"><rect class="nlo-lbtrack" x="82" y="356" width="116" height="3.5" rx="1.75"/><g clip-path="url(#nlo-lbclip)"><rect class="lbseg" x="82" y="356" width="44" height="3.5" rx="1.75" fill="#FF7A00"/></g></g><circle class="comet n2c" r="5" fill="#fff" style="offset-path:path('M58,315 L58,244 L152,203');filter:drop-shadow(0 0 8px #FF7A00);"/><g class="ballpos"><g class="ball" style="offset-path:path('M107,398 Q120,290 152,203');offset-rotate:auto;transform-box:fill-box;transform-origin:center;filter:drop-shadow(0 2px 5px rgba(0,0,0,.5));"><g class="ballscale" style="transform-box:fill-box;transform-origin:center;"><path d="M-16,0 C-14.5,-7 -8,-12 0,-12 C8,-12 14.5,-7 16,0 C14.5,7 8,12 0,12 C-8,12 -14.5,7 -16,0 Z" fill="#8a5327" stroke="#5a3316" stroke-width="1.1"/><path d="M-10.5,-6 Q-8.8,0 -10.5,6" fill="none" stroke="#f2ece1" stroke-width="1.4"/><path d="M10.5,-6 Q8.8,0 10.5,6" fill="none" stroke="#f2ece1" stroke-width="1.4"/><g clip-path="url(#nlo-fbclip)"><g class="laces"><line x1="-5.5" y1="0" x2="5.5" y2="0" stroke="#f2ece1" stroke-width="1.5"/><line x1="-4.5" y1="-2.3" x2="-4.5" y2="2.3" stroke="#f2ece1" stroke-width="1.4"/><line x1="-1.7" y1="-2.6" x2="-1.7" y2="2.6" stroke="#f2ece1" stroke-width="1.4"/><line x1="1.1" y1="-2.6" x2="1.1" y2="2.6" stroke="#f2ece1" stroke-width="1.4"/><line x1="3.9" y1="-2.3" x2="3.9" y2="2.3" stroke="#f2ece1" stroke-width="1.4"/></g></g></g></g></g><circle class="catch" cx="152" cy="203" r="11" fill="none" stroke="#fff" stroke-width="2" style="transform-box:fill-box;transform-origin:center;opacity:0;"/></g></svg>`,
          }}
        />
        {/* Overlay watchdog. Dismissal normally comes from NativeAppShell
            AFTER hydration — but on an offline cold boot a missing JS chunk
            (cached HTML from a newer build than the cached chunk set) means
            hydration never runs, and the coach stares at the loading bar
            forever. Inline + dependency-free so it works with zero network
            and zero React: after 8s, reveal the server-rendered page. Plain
            <a> navigation still works unhydrated, so the playbook list and
            offline viewer remain reachable. No-op when hydration already
            added .native-ready. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "setTimeout(function(){document.documentElement.classList.add('native-ready')},8000);",
          }}
        />
        <ThemeProvider forceLight={!isAuthed}>
          <FieldBackdrop />
          <ToastProvider>
            <TutorialProvider>
              <InboxBadgeProvider
                initialCount={inboxCount}
                initialUrgent={inboxUrgent}
              >
                <ConfigBanner />
                {/* Production chrome hides inside the new-UX shell (/app/*),
                    which provides its own header/nav. Pathname-gated → zero
                    effect on any production route. */}
                <HideOnAppShell>
                  <AppInstallBanner />
                  <IosAppBanner />
                  <SiteHeader />
                </HideOnAppShell>
                {/* The new-UX switch is NOT a site-wide banner — it lives only
                    as a pill on the Account page (UxPreviewAccountToggle) and in
                    the /app shell's account menu. Keeping it off the global
                    chrome avoids a persistent banner on every route. */}
                <div className="flex flex-1 flex-col">{children}</div>
                <HideOnAppShell>
                  <SiteFooter />
                </HideOnAppShell>
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
                {isAuthed && <NativeBadgeSync />}
              </InboxBadgeProvider>
            </TutorialProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
