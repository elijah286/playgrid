// XO Gridmaker offline shell service worker.
//
// Purpose: keep the native shell usable when the device has no signal.
// Capacitor's WebView points at the live site (https://www.xogridmaker.com),
// so without this worker every navigation requires network. That breaks the
// "Download for offline" promise: the data is in IndexedDB but the page that
// reads it can't load.
//
// Strategy:
//   - Cache-first for static build assets (/_next/static, /brand, fonts, icons)
//   - Network-first with cache fallback for /home, /offline, and per-playbook
//     offline navigations + their RSC payloads. Online users always get a
//     fresh page (so the CURRENT user's playbooks render); cache only fires
//     when the network is unreachable. Stale-while-revalidate was wrong here
//     because /home is user-specific and the cache key has no user id —
//     after a sign-out/sign-in, the previous user's HTML would flash before
//     the background refresh replaced it.
//   - Network-first for everything else (auth, API routes, server actions)
//   - On any failed top-level navigation, fall back to /home if cached,
//     then /offline; ERR_INTERNET_DISCONNECTED only as last resort.
//
// Bump SHELL_VERSION whenever the cache contract changes (e.g. precache list).
// On activate, old versioned caches are purged.

const SHELL_VERSION = "xog-shell-v4";
const STATIC_CACHE = `${SHELL_VERSION}-static`;
const NAV_CACHE = `${SHELL_VERSION}-nav`;

/**
 * Cache every /_next/static asset a just-cached page references, so the
 * cached page is COMPLETE. Static assets are cached lazily (cache-first),
 * so after a deploy a freshly re-cached page's new hashed chunks aren't in
 * the cache until each is requested online. Offline, those chunk loads
 * fail: hydration never runs (the boot overlay spins forever) or a route
 * segment's chunk throws into its error boundary ("Couldn't open the
 * offline viewer"). Chunks are content-hashed/immutable, so anything
 * already cached is skipped; stale chunks from older builds stay cached
 * and keep older cached pages working.
 */
async function precacheReferencedAssets(res) {
  try {
    const text = await res.clone().text();
    const urls = new Set();
    const re = /\/_next\/static\/[^"'\s\\<>]+/g;
    let m;
    while ((m = re.exec(text))) urls.add(m[0]);
    if (urls.size === 0) return;
    const cache = await caches.open(STATIC_CACHE);
    await Promise.all(
      [...urls].map(async (u) => {
        try {
          if (await cache.match(u)) return;
          const r = await fetch(u);
          if (r.ok && !r.redirected) await cache.put(u, r.clone());
        } catch {
          // best-effort — the page itself will request what it needs online
        }
      }),
    );
  } catch {
    // parsing is best-effort; never let it break the nav path
  }
}

// Precached at install time so first offline boot has somewhere to land.
// Anything else gets cached lazily as the user visits it online — including
// per-playbook offline routes, which the download flow primes via
// PRECACHE_URLS messages.
const PRECACHE_URLS = [
  "/home",
  "/offline",
  "/brand/xogridmaker_monogram.svg",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(NAV_CACHE);
      // Use no-cache so we get a fresh copy even if the browser has one pinned.
      await Promise.all(
        PRECACHE_URLS.map(async (url) => {
          try {
            const res = await fetch(url, { cache: "no-cache" });
            // `!res.redirected`: logged-out fetches of authed shell routes
            // 307 to /login and resolve as a 200 — caching that under the
            // shell key would serve a login wall on offline boots.
            if (res.ok && !res.redirected) {
              await cache.put(url, res.clone());
              await precacheReferencedAssets(res);
            }
          } catch {
            // Precache is best-effort. If the user installs offline the
            // first time, this fails silently and we'll fill in later.
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => !n.startsWith(SHELL_VERSION))
          .map((n) => caches.delete(n)),
      );
      // Heal poisoned nav entries from before the `!res.redirected` guards:
      // a shell route fetched while logged out cached the /login page under
      // the shell key. Deleting (not re-fetching) is enough — the install
      // precache and authed navigations repopulate with real content.
      const nav = await caches.open(NAV_CACHE);
      const entries = await nav.keys();
      await Promise.all(
        entries.map(async (req) => {
          const res = await nav.match(req);
          if (!res) return;
          const finalPath = res.url ? new URL(res.url).pathname : null;
          if (res.redirected || finalPath === "/login") {
            await nav.delete(req);
          }
        }),
      );
      await self.clients.claim();
    })(),
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/brand/") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/icon" ||
    url.pathname === "/apple-icon" ||
    url.pathname.startsWith("/marketing/") ||
    /\.(svg|png|jpg|jpeg|webp|woff2?|ttf|css|js)$/i.test(url.pathname)
  );
}

function isOfflineNav(url) {
  return url.pathname === "/offline" || url.pathname.startsWith("/offline/");
}

/**
 * The REAL app pages we render offline (local-first Phase 2): the playbook
 * detail page and the play editor. Their client components take all their
 * data as props from the server-rendered payload and make NO on-mount
 * server reads — so serving the cached HTML/RSC offline renders the exact
 * same page a coach sees online, with no separate offline surface. Handled
 * network-first (fresh online, cached copy only when the network is gone),
 * identical to how /home has always worked.
 */
function isCachedAppRoute(url) {
  // /playbooks/[id] renders fully offline from its cached payload (verified).
  // The play EDITOR (/plays/[id]/edit) is NOT included yet: it has a
  // mount-time network dependency in its (editor) layout that throws "Load
  // failed" offline, which would surface the error boundary instead of a
  // useful page. Until that's isolated + made offline-safe, the editor stays
  // out of the offline allowlist (offline nav there falls back like before).
  return /^\/playbooks\/[^/]+$/.test(url.pathname);
}

/**
 * Routes that must work offline. /home is the graceful-degrade landing
 * page (downloaded tiles still tappable, others greyed), /offline/* is
 * the cold-boot downloaded-playbook library, and the real playbook/play
 * pages render from cache so going offline mid-session is seamless.
 */
function isShellNav(url) {
  return (
    url.pathname === "/home" || isOfflineNav(url) || isCachedAppRoute(url)
  );
}

function isShellRsc(url, req) {
  // RSC payloads include an _rsc query param OR a custom Accept header.
  // Cache the ones rooted in shell routes so client-side navigation works
  // without signal.
  if (!isShellNav(url)) return false;
  const hasRscQuery = url.searchParams.has("_rsc");
  const accept = req.headers.get("Accept") || "";
  return hasRscQuery || accept.includes("text/x-component");
}

async function cacheFirst(cacheName, request) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res && res.ok && res.type === "basic") {
      cache.put(request, res.clone()).catch(() => {});
    }
    return res;
  } catch {
    return cached || Response.error();
  }
}

// Bound how long a navigation fetch is allowed to stall before we give
// up and fall back to cache. Without this, a captive-portal or partial-
// connectivity scenario (DNS resolves but TCP hangs) leaves the WebView
// staring at a blank page for minutes — the OS-level "offline" event
// never fires because the radio reports a connection. 6s is long
// enough for a slow LTE cold connect, short enough that a stuck request
// doesn't trap the coach on a sideline.
const NAV_FETCH_TIMEOUT_MS = 6000;

function fetchWithTimeout(request, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("nav-timeout")), timeoutMs);
    fetch(request).then(
      (res) => {
        clearTimeout(timer);
        resolve(res);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

// Self-contained offline/retry page. Returned for any top-level navigation
// that can't reach the network AND has no cached shell — the case that
// previously returned Response.error() and showed a BLACK WebView (the bug
// we're fixing). Everything is inline (monogram SVG + styles), so it renders
// with zero network and zero cache dependency: it can never itself fail to
// paint. Theme-aware via prefers-color-scheme so it matches the dark/light
// WebView background instead of flashing.
const OFFLINE_FALLBACK_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>xogridmaker</title>
<style>
  :root { color-scheme: light dark; }
  html, body { margin: 0; height: 100%; }
  body {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 1.5rem; text-align: center;
    font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    background: #ffffff; color: #0f172a;
    padding: max(env(safe-area-inset-top), 2rem) 2rem max(env(safe-area-inset-bottom), 2rem);
  }
  @media (prefers-color-scheme: dark) { body { background: #0b0b0c; color: #f4f4f5; } }
  svg { width: 128px; height: auto; }
  h1 { margin: 0; font-size: 1.15rem; font-weight: 800; letter-spacing: -0.01em; }
  p { margin: 0; max-width: 21rem; font-size: 0.95rem; line-height: 1.5; opacity: 0.7; }
  button {
    margin-top: 0.25rem; border: 0; border-radius: 999px; cursor: pointer;
    background: #f26522; color: #fff; font-weight: 700; font-size: 1rem;
    padding: 0.85rem 2.25rem; -webkit-tap-highlight-color: transparent;
  }
  button:active { opacity: 0.85; }
</style>
</head>
<body>
  <svg viewBox="0 0 900 380" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="xogridmaker">
    <line stroke="#1769FF" stroke-linecap="square" stroke-width="52" x1="250" x2="380" y1="100" y2="240" />
    <line stroke="#1769FF" stroke-linecap="square" stroke-width="52" x1="380" x2="250" y1="100" y2="240" />
    <rect fill="none" height="130" rx="42" ry="42" stroke="#95CC1F" stroke-width="38" width="170" x="480" y="105" />
  </svg>
  <h1>Can&rsquo;t reach xogridmaker</h1>
  <p>You appear to be offline or on a weak connection. Any playbooks you&rsquo;ve downloaded are still available.</p>
  <button onclick="location.replace('/home')">Try again</button>
</body>
</html>`;

function offlineFallbackResponse() {
  return new Response(OFFLINE_FALLBACK_HTML, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function networkFirstWithCacheFallback(cacheName, request, htmlFallback = false) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetchWithTimeout(request, NAV_FETCH_TIMEOUT_MS);
    // Same rule as the precache: a redirected response means we did NOT get
    // the shell route we asked for (usually a bounce to /login after
    // sign-out) — caching it would replace good offline content with a
    // login wall that can't submit without signal.
    if (res && res.ok && !res.redirected) {
      cache.put(request, res.clone()).catch(() => {});
      // Fire-and-forget: pull this page's chunk set into the static cache
      // so the just-refreshed HTML stays openable offline (see
      // precacheReferencedAssets).
      precacheReferencedAssets(res).catch(() => {});
    }
    return res;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    const url = new URL(request.url);
    if (url.pathname !== "/offline") {
      const offlineFallback = await cache.match("/offline");
      if (offlineFallback) return Response.redirect("/offline", 302);
    }
    // A navigation must never end on a blank network error (black WebView):
    // serve the self-contained inline retry page. Non-navigation callers
    // (RSC payloads) still get Response.error() — HTML is the wrong content
    // type for them, and the client handles a failed RSC fetch gracefully.
    return htmlFallback ? offlineFallbackResponse() : Response.error();
  }
}

async function handleNavigation(request) {
  const url = new URL(request.url);
  const cache = await caches.open(NAV_CACHE);

  // Shell routes (/home, /offline/*) — try network first so the current
  // user's playbooks always win. Fall back to the cached copy only when
  // offline so coaches still land on the last-known shell with downloaded
  // tiles tappable.
  if (isShellNav(url)) {
    return networkFirstWithCacheFallback(NAV_CACHE, request, true);
  }

  // Everything else: network-first. If it fails (or stalls past the
  // timeout), redirect to /home so coaches land on the tile list
  // (downloaded ones are still tappable). If /home isn't cached, try
  // /offline. Only fall through to Response.error when both shells
  // are missing — that's the case the user described as "this page
  // couldn't load," so we serve the cached offline shell whenever
  // it's available rather than returning a broken response.
  try {
    return await fetchWithTimeout(request, NAV_FETCH_TIMEOUT_MS);
  } catch {
    const homeFallback = await cache.match("/home");
    if (homeFallback) return Response.redirect("/home", 302);
    const offlineFallback = await cache.match("/offline");
    if (offlineFallback) return Response.redirect("/offline", 302);
    // Last resort: the self-contained inline retry page, never a blank
    // Response.error() — that rendered as the black WebView we're fixing.
    return offlineFallbackResponse();
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Only handle same-origin. Cross-origin (Supabase, Sentry, fonts CDN) goes
  // through the network untouched; caching them risks leaking auth.
  if (url.origin !== self.location.origin) return;

  // Don't touch API routes, server actions, auth callbacks, monitoring tunnel.
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/") ||
    url.pathname.startsWith("/monitoring") ||
    url.pathname.startsWith("/_next/data/")
  ) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (isShellRsc(url, request)) {
    event.respondWith(networkFirstWithCacheFallback(NAV_CACHE, request));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(STATIC_CACHE, request));
    return;
  }
});

// Allow the page to nudge the worker into precaching a specific URL — used
// after a coach downloads a playbook so the per-playbook /offline/<id> route
// is in the cache before they actually need it.
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "PRECACHE_URLS" || !Array.isArray(data.urls)) return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(NAV_CACHE);
      await Promise.all(
        data.urls.map(async (u) => {
          try {
            const res = await fetch(u, { cache: "no-cache" });
            // See install precache: never cache a login redirect under a
            // shell/playbook key.
            if (res.ok && !res.redirected) {
              await cache.put(u, res.clone());
              await precacheReferencedAssets(res);
            }
          } catch {
            // best-effort
          }
        }),
      );
    })(),
  );
});
