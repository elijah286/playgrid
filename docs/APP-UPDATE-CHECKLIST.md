# App update checklist

**Purpose.** Collect changes that require a **new native binary + App Store /
Play resubmission**. This branch (`app-update`) accumulates those, and we merge
it to `main` and rebuild/resubmit just before the next submission.

**Web-only changes do NOT belong here.** The native app loads the live website
(`capacitor.config.ts` → `server.url = https://www.xogridmaker.com`), so web/JS
changes deploy to `main` (Cloud Run) and the app picks them up automatically —
no resubmission needed. Putting web work on this branch only delays it.

## Does this change need an app update?

**Yes — goes on this branch** (baked into the binary at build time):
- `capacitor.config.ts` changes
- Native plugin add / remove / upgrade (`@capacitor/*`, CocoaPods, Gradle)
- iOS entitlements / `Info.plist` — permission usage strings, **associated
  domains** (Universal Links), custom URL schemes, background modes
- Android `AndroidManifest.xml` — permissions, intent filters, `assetlinks`
- Native app icon / splash / native assets (`cap:assets`)
- Min-OS / build settings, App Privacy "nutrition" labels, ATT prompt copy

**No — ship to `main` instead** (served by the web, app picks up live):
- UI, page flows, copy, banners, nudges
- Server actions, API routes, DB / migrations
- Anything under `src/app`, `src/components` rendered by the web

> Many "app" features are hybrid: a native part (here) **plus** a web-side
> enabler that can ship to `main` early and harmlessly. Land the web enabler
> first; keep only the native part on this branch.

## Candidates

| Item | Why it needs an app update | Web-side prep (ship to `main` early) | Status |
|---|---|---|---|
| Universal Links / App Links | iOS associated-domains entitlement + Android applinks intent filters + `capacitor.config.ts` | serve `/.well-known/apple-app-site-association` + `assetlinks.json` | not started — needs an `appUrlOpen` handler too; next cycle |
| Offline mode on iOS (App-Bound Domains) | `WKAppBoundDomains` in Info.plist + `ios.limitsNavigationsToAppBoundDomains` in `capacitor.config.ts` — WKWebView has no `navigator.serviceWorker` without them, so the offline shell never ran on iOS | none (sw.js already live) | **shipped in v1.0.1 (build 11)** |
| Capacitor iOS runtime 8.3.1 → 8.4.1 | `cap sync` now regenerates `CapApp-SPM/Package.swift` with an 8.4.1 pin (installed CLI moved ahead of the checked-in pin). Deliberately reverted for build 11 — archive what was tested. Take the bump with its own test pass. **Until then: run `npx cap copy ios` (not full `cap sync`) before archiving, or revert Package.swift after sync.** | none | not started |

_Add rows as we find them._

## Pre-submission checklist (run before building the binary)

- [ ] All web-side enablers already deployed to `main` and verified in prod
- [ ] `npm run typecheck` + tests green
- [ ] `npm run cap:sync` (and `cap:assets` if native assets changed)
- [ ] Bump version + build number
- [ ] Privacy policy current — `src/app/privacy/page.tsx` (any new tracker /
      sub-processor / permission / data collection)
- [ ] Feature catalog updated — `src/lib/site/features-catalog.ts`
- [ ] Re-check open App Store rejection risks (see auto-memory:
      `app-store-resubmission-risks`)
- [ ] Merge `app-update` → `main`, deploy, then build + submit from `main`
