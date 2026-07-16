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

// v5 (2026-07-16): v4 caches hold RSC payloads we no longer write and must never
// serve — a cached RSC gets replayed cross-context and throws into the editor's
// error boundary (see the PRECACHE_URLS note). Bumping drops those on activate.
// Deliberately paired with OFFLINE_FORMAT_VERSION = 2 in src/lib/offline/db.ts:
// wiping the route cache alone would leave IndexedDB still claiming "Available
// offline" for playbooks whose pages just vanished. Bumping BOTH keeps the two
// caches telling the same story — a coach sees "Make available offline" and
// re-downloads into a clean, correct state.
const SHELL_VERSION = "xog-shell-v5";
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
    // Throttled (runLimited): a page can reference hundreds of chunks — fetching
    // them all at once would flood the connection.
    await runLimited([...urls], 6, async (u) => {
      try {
        if (await cache.match(u)) return;
        const r = await fetch(u);
        if (r.ok && !r.redirected) await cache.put(u, r.clone());
      } catch {
        // best-effort — the page itself will request what it needs online
      }
    });
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
          const reqPath = new URL(req.url).pathname;
          const finalPath = res.url ? new URL(res.url).pathname : null;
          if (res.redirected || finalPath === "/login") {
            await nav.delete(req);
            return;
          }
          // Heal a previously-cached poisoned /home (dashboard soft-error).
          if (reqPath === "/home") {
            try {
              if ((await res.clone().text()).includes("check your connection")) {
                await nav.delete(req);
              }
            } catch {
              /* leave it — a read failure isn't proof it's poisoned */
            }
          }
        }),
      );
      await self.clients.claim();
    })(),
  );
});

function isStaticAsset(url) {
  // Never cache-first the worker's own script — it must always come from the
  // network so updates aren't masked by a stale cached copy.
  if (url.pathname === "/sw.js") return false;
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
  // Real app pages served from cache offline. Client-side navigation to these
  // works once their RSC payload is cached (see cacheKeyFor — the `_rsc`
  // cache-buster is normalized so offline requests hit). The play editor is
  // included: on client-side nav its cached RSC renders the real editor
  // offline. (A cold-boot FULL load directly to an editor URL can still hit a
  // mount-time server-action failure — that path is handled separately by the
  // read-only affordance; the in-session client-nav flow is the common one.)
  return (
    /^\/playbooks\/[^/]+$/.test(url.pathname) ||
    /^\/plays\/[^/]+\/edit$/.test(url.pathname)
  );
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

// Shown when a coach opens a play OFFLINE whose page was never cached — i.e.
// the playbook wasn't downloaded (or the download didn't reach this play). The
// old behavior redirected to /home, so a tap silently "kicked back to the
// lobby." This honest, self-contained page (zero network/cache dependency)
// tells them what to do and offers a Back button instead.
const PLAY_NOT_DOWNLOADED_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>Play not downloaded</title>
<style>
  :root { color-scheme: light dark; }
  html, body { margin: 0; height: 100%; }
  body {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 1.25rem; text-align: center;
    font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    background: #ffffff; color: #0f172a;
    padding: max(env(safe-area-inset-top), 2rem) 2rem max(env(safe-area-inset-bottom), 2rem);
  }
  @media (prefers-color-scheme: dark) { body { background: #0b0b0c; color: #f4f4f5; } }
  .icon { width: 64px; height: 64px; opacity: 0.6; }
  h1 { margin: 0; font-size: 1.15rem; font-weight: 800; letter-spacing: -0.01em; }
  p { margin: 0; max-width: 22rem; font-size: 0.95rem; line-height: 1.55; opacity: 0.72; }
  button {
    margin-top: 0.25rem; border: 0; border-radius: 999px; cursor: pointer;
    background: #f26522; color: #fff; font-weight: 700; font-size: 1rem;
    padding: 0.85rem 2.25rem; -webkit-tap-highlight-color: transparent;
  }
  button:active { opacity: 0.85; }
</style>
</head>
<body>
  <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M1 1l22 22" />
    <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
    <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
    <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
    <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
    <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
    <line x1="12" y1="20" x2="12.01" y2="20" />
  </svg>
  <h1>This play isn&rsquo;t downloaded</h1>
  <p>Please reconnect, open this playbook, and tap &ldquo;Available offline&rdquo; so every play is saved to this device for the sideline.</p>
  <button onclick="history.length > 1 ? history.back() : location.replace('/home')">Go back</button>
</body>
</html>`;

function playNotDownloadedResponse() {
  return new Response(PLAY_NOT_DOWNLOADED_HTML, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

// Client-side navigations (next/link, router.push) fetch an RSC payload with
// a per-request `_rsc` cache-buster query param whose value changes every
// time. Caching/serving those by full URL therefore always MISSES offline —
// the value cached online never matches the value requested offline, so
// client-side navigation to a cached page silently fails and the transition
// stalls. Normalize `_rsc` to a constant so the online-cached RSC and the
// offline request map to the same key. We keep the param (rather than delete
// it) so the RSC entry stays distinct from the HTML page's cache entry for
// the same pathname; other params (e.g. ?tab=) are preserved so each variant
// caches separately.
function cacheKeyFor(request) {
  const url = new URL(request.url);
  if (!url.searchParams.has("_rsc")) return request;
  url.searchParams.set("_rsc", "swcache");
  return new Request(url.toString(), { headers: request.headers });
}

// A shell page can render a transient soft-error yet still return HTTP 200 —
// e.g. /home when the dashboard data fetch times out on a flaky connection
// shows "Couldn't load — check your connection". Caching THAT poisons the
// cache: every offline boot then serves the error page, with no working way
// back to the playbooks. Refuse to cache it so the last good copy survives.
async function isPoisonedShell(request, res) {
  const url = new URL(request.url);
  if (url.pathname !== "/home") return false;
  try {
    return (await res.clone().text()).includes("check your connection");
  } catch {
    return false;
  }
}

async function networkFirstWithCacheFallback(cacheName, request, htmlFallback = false) {
  const cache = await caches.open(cacheName);
  const key = cacheKeyFor(request);
  try {
    const res = await fetchWithTimeout(request, NAV_FETCH_TIMEOUT_MS);
    // Same rule as the precache: a redirected response means we did NOT get
    // the shell route we asked for (usually a bounce to /login after
    // sign-out) — caching it would replace good offline content with a
    // login wall that can't submit without signal. And never cache a
    // poisoned soft-error shell (see isPoisonedShell).
    if (res && res.ok && !res.redirected && !(await isPoisonedShell(request, res))) {
      cache.put(key, res.clone()).catch(() => {});
      // Fire-and-forget: pull this page's chunk set into the static cache
      // so the just-refreshed HTML stays openable offline (see
      // precacheReferencedAssets).
      precacheReferencedAssets(res).catch(() => {});
    }
    return res;
  } catch {
    // ignoreVary: RSC responses carry `Vary: RSC, Next-Router-State-Tree, …`,
    // and the router state tree differs between the request that populated the
    // cache and the offline request. Without ignoreVary the match fails on
    // that header mismatch, the fetch falls through to the (unreachable)
    // network, and the client-side navigation throws "Load failed". Matching
    // by URL only serves the route's cached RSC regardless of state-tree.
    const cached = await cache.match(key, { ignoreVary: true });
    if (cached) return cached;
    const url = new URL(request.url);
    // An uncached PLAY route offline means this play wasn't downloaded (the
    // playbook wasn't made "Available offline", or the download didn't reach
    // it). Show an honest "not downloaded" page instead of bouncing to /home —
    // that silent bounce is the "tapped a play, got kicked back to the lobby"
    // report. Full-page navigations only (htmlFallback); a failed RSC fetch
    // returns Response.error() below and Next falls back to this hard nav.
    if (htmlFallback && /^\/plays\/[^/]+\/edit$/.test(url.pathname)) {
      return playNotDownloadedResponse();
    }
    // Otherwise fall back to the cached /home shell (the standard app view) —
    // never a separate offline surface. If /home isn't cached either, serve the
    // self-contained inline retry page so a navigation never ends on a blank
    // network error (black WebView). Non-navigation callers (RSC payloads)
    // get Response.error() — HTML is the wrong content type and the client
    // handles a failed RSC fetch gracefully.
    if (htmlFallback && url.pathname !== "/home") {
      const homeFallback = await cache.match("/home");
      if (homeFallback) return Response.redirect("/home", 302);
    }
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
  // timeout), redirect to the cached /home shell (the standard app view) so
  // coaches land on their tile list — downloaded ones are still tappable.
  // Only fall through to the inline retry page when /home isn't cached
  // either.
  try {
    return await fetchWithTimeout(request, NAV_FETCH_TIMEOUT_MS);
  } catch {
    const homeFallback = await cache.match("/home");
    if (homeFallback) return Response.redirect("/home", 302);
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
    // NETWORK-ONLY, deliberately. We neither write nor serve cached RSC.
    //
    // Serving one is the bug: cacheKeyFor collapses every `_rsc` value to a
    // single key, so one full-tree payload gets replayed for every client-side
    // nav — the cross-context RSC replay next.config.ts calls "the hazard that
    // made the service-worker approach throw 'Something went wrong'". That throw
    // is what dropped offline coaches onto the error boundary.
    //
    // Failing is BETTER: Next turns a failed RSC fetch into a document
    // navigation ("If fetch fails handle it like a mpa navigation" —
    // next/dist/client/components/router-reducer/fetch-server-response.js),
    // which handleNavigation answers from the cached HTML, rendering the REAL
    // editor. So offline we let it fail and let Next do the right thing.
    event.respondWith(
      fetchWithTimeout(request, NAV_FETCH_TIMEOUT_MS).catch(() => Response.error()),
    );
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(STATIC_CACHE, request));
    return;
  }
});


// Allow the page to nudge the worker into precaching specific URLs — used
// after a coach downloads a playbook so the real /playbooks/<id> +
// /plays/<id>/edit routes (HTML + RSC + chunks) are in the cache before they
// need them offline. `dedupe: true` skips URLs already cached — used by the
// self-heal on app launch (primeOfflineShell), which sweeps every downloaded
// playbook's play routes so an old download's play pages land on-device
// WITHOUT a manual re-download, staying cheap on repeat launches. The
// download button omits dedupe so a "Refresh offline copy" re-fetches fresh.
// Run async work over a list with a hard concurrency cap so precaching can
// never fan out into a fetch storm that saturates the connection (which times
// out the connectivity probe and makes the ONLINE app feel offline).
async function runLimited(items, limit, fn) {
  const queue = items.slice();
  const worker = async () => {
    while (queue.length) await fn(queue.shift());
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, queue.length) }, worker),
  );
}

// Answer "which of these routes are actually in the cache?" for the page. The
// UI uses this to tell a coach WHICH plays are genuinely available offline
// rather than assuming the whole playbook landed. Replies over the caller's
// MessageChannel port so the answer is scoped to the asking page and the cache
// NAME (which is version-stamped) never has to leak into client code.
async function checkCachedUrls(urls, port) {
  const cache = await caches.open(NAV_CACHE);
  const cached = [];
  for (const u of urls) {
    try {
      if (await cache.match(u)) cached.push(u);
    } catch {
      // best-effort — treat as not cached
    }
  }
  if (port) {
    try {
      port.postMessage({ cached });
    } catch {
      /* port closed */
    }
  }
}

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || !Array.isArray(data.urls)) return;
  const port = event.ports && event.ports[0];

  if (data.type === "CHECK_CACHED_URLS") {
    event.waitUntil(checkCachedUrls(data.urls, port));
    return;
  }

  if (data.type !== "PRECACHE_URLS") return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(NAV_CACHE);
      const total = data.urls.length;
      let done = 0;
      let failed = 0;
      await runLimited(data.urls, 3, async (u) => {
        let ok = false;
        try {
          if (data.dedupe && (await cache.match(u))) {
            ok = true;
            return; // already cached
          }
          const res = await fetch(u, { cache: "no-cache" });
          // See install precache: never cache a login redirect under a
          // shell/playbook key.
          if (res.ok && !res.redirected) {
            await cache.put(u, res.clone());
            await precacheReferencedAssets(res);
            // NOTE: we deliberately do NOT precache the RSC payload here.
            //
            // Reason 1 (proven): it cost 75KB and one extra request PER PLAY —
            // half the download's requests and ~30% of its bytes — for a payload
            // we don't need.
            //
            // Reason 2 (proven): letting the RSC MISS is a BETTER path than
            // hitting. Next turns a failed RSC fetch into a document navigation
            // ("If fetch fails handle it like a mpa navigation" —
            // next/dist/client/components/router-reducer/fetch-server-response.js
            // catch → `return originalUrl.toString()`), which the SW answers
            // from the HTML cached right here and renders the REAL editor. That
            // is the one offline path verified end-to-end on a device.
            //
            // What is NOT proven: that serving a cached RSC *throws*. A payload
            // fetched with only `RSC: 1` carries no Next-Router-State-Tree, and
            // networkFirstWithCacheFallback matches with `ignoreVary: true`, so
            // it IS served into a different router context than it was made for.
            // But Next 16 handles that mismatch with a soft retry or an MPA
            // navigation (ppr-navigations.js:895-935) — no render-phase throw
            // could be found. An earlier version of this comment asserted the
            // replay was "the bug"; that was overstated, and cacheKeyFor
            // preserves the pathname, so one play can never receive another
            // play's payload. Keep this change for reasons 1 and 2 — not for a
            // mechanism we never demonstrated.
            ok = true;
          }
        } catch {
          // best-effort — `ok` stays false and is reported as a failure below.
        } finally {
          // Tick per URL so the count always reaches `total` and the UI can
          // never hang at 90%. But report ok/failed HONESTLY: a page that
          // failed to cache is a play that will NOT open offline, and there is
          // no degraded fallback to hide it — so claiming a bare "100%" would
          // be the same lie in a new costume (the button previously said
          // "Available offline" the moment the DATA landed, while these pages
          // were still streaming in).
          done += 1;
          if (!ok) failed += 1;
          if (port) {
            try {
              port.postMessage({
                type: "PRECACHE_PROGRESS",
                done,
                total,
                failed,
                ok,
                url: u,
              });
            } catch {
              /* port closed — page navigated away mid-download */
            }
          }
        }
      });
      if (port) {
        try {
          port.postMessage({ type: "PRECACHE_DONE", done, total, failed });
        } catch {
          /* port closed */
        }
      }
    })(),
  );
});
