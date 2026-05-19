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
//   - Stale-while-revalidate for /home, /offline, and per-playbook offline
//     navigations + their RSC payloads (the routes a coach must reach
//     without signal)
//   - Network-first for everything else (auth, API routes, server actions)
//   - On any failed top-level navigation, fall back to /home if cached,
//     then /offline; ERR_INTERNET_DISCONNECTED only as last resort.
//
// Bump SHELL_VERSION whenever the cache contract changes (e.g. precache list).
// On activate, old versioned caches are purged.

const SHELL_VERSION = "xog-shell-v2";
const STATIC_CACHE = `${SHELL_VERSION}-static`;
const NAV_CACHE = `${SHELL_VERSION}-nav`;

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
            if (res.ok) await cache.put(url, res.clone());
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
 * Routes that must work offline. /home is the graceful-degrade landing
 * page (downloaded tiles still tappable, others greyed), /offline/* is
 * the dedicated viewer for downloaded playbooks.
 */
function isShellNav(url) {
  return url.pathname === "/home" || isOfflineNav(url);
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

async function staleWhileRevalidate(cacheName, request) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((res) => {
      if (res && res.ok) cache.put(request, res.clone()).catch(() => {});
      return res;
    })
    .catch(() => null);
  return cached || (await networkPromise) || Response.error();
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

async function handleNavigation(request) {
  const url = new URL(request.url);
  const cache = await caches.open(NAV_CACHE);

  // Shell routes (/home, /offline/*) — keep the cached copy warm. Coaches
  // hitting these offline see the last-known shell with downloaded
  // playbooks usable and non-downloaded ones visibly disabled.
  if (isShellNav(url)) {
    return staleWhileRevalidate(NAV_CACHE, request);
  }

  // Everything else: network-first. If it fails, try /home so coaches
  // land on the tile list (downloaded ones are still tappable); fall
  // back to /offline if /home isn't cached yet.
  try {
    return await fetch(request);
  } catch {
    const homeFallback = await cache.match("/home");
    if (homeFallback) return Response.redirect("/home", 302);
    const offlineFallback = await cache.match("/offline");
    if (offlineFallback) return Response.redirect("/offline", 302);
    return Response.error();
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
    event.respondWith(staleWhileRevalidate(NAV_CACHE, request));
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
            if (res.ok) await cache.put(u, res.clone());
          } catch {
            // best-effort
          }
        }),
      );
    })(),
  );
});
