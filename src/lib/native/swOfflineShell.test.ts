import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * Regression tests for public/sw.js (the native offline-shell service
 * worker). The script is evaluated in a sandbox with mock SW globals so we
 * can drive its install/activate/message/fetch handlers directly.
 *
 * Bug under test (2026-07-15 "offline playbooks broken on 1.0.1"): shell
 * routes fetched while logged out 307 to /login and resolve as a redirected
 * 200. Caching that response under the shell key (/home, /offline,
 * /offline/<id>) serves coaches a login wall on offline cold boots — a login
 * wall that cannot submit without signal. The worker must never cache a
 * redirected response, and must purge any previously poisoned entries on
 * activate.
 */

const SW_SOURCE = readFileSync(
  join(__dirname, "../../../public/sw.js"),
  "utf8",
);

const ORIGIN = "https://www.xogridmaker.com";

type FakeResponse = {
  ok: boolean;
  status: number;
  redirected: boolean;
  url: string;
  type: string;
  headers: { get: (k: string) => string | null };
  clone: () => FakeResponse;
  text?: () => Promise<string>;
};

function res(
  path: string,
  { redirected = false, finalPath = path, ok = true, status = 200, body = "" } = {},
): FakeResponse {
  const r: FakeResponse = {
    ok,
    status,
    redirected,
    url: `${ORIGIN}${finalPath}`,
    type: "basic",
    headers: { get: () => null },
    clone: () => r,
    text: async () => body,
  };
  return r;
}

const STATIC_CACHE = "xog-shell-v4-static";

class FakeCache {
  store = new Map<string, FakeResponse>();
  private key(k: string | { url: string }): string {
    const url = typeof k === "string" ? new URL(k, ORIGIN).href : k.url;
    return url;
  }
  async put(k: string | { url: string }, v: FakeResponse) {
    this.store.set(this.key(k), v);
  }
  async match(k: string | { url: string }) {
    return this.store.get(this.key(k));
  }
  async keys() {
    return [...this.store.keys()].map((url) => ({ url }));
  }
  async delete(k: string | { url: string }) {
    return this.store.delete(this.key(k));
  }
}

type Sandbox = {
  listeners: Map<string, (event: any) => void>;
  cachesByName: Map<string, FakeCache>;
  fetchImpl: (url: any) => Promise<FakeResponse>;
  fire: (name: string, event: any) => Promise<void>;
};

function loadWorker(fetchImpl: Sandbox["fetchImpl"]): Sandbox {
  const listeners = new Map<string, (event: any) => void>();
  const cachesByName = new Map<string, FakeCache>();
  const cachesApi = {
    async open(name: string) {
      if (!cachesByName.has(name)) cachesByName.set(name, new FakeCache());
      return cachesByName.get(name)!;
    },
    async keys() {
      return [...cachesByName.keys()];
    },
    async delete(name: string) {
      return cachesByName.delete(name);
    },
  };
  const self = {
    location: new URL(ORIGIN + "/"),
    addEventListener(name: string, fn: (event: any) => void) {
      listeners.set(name, fn);
    },
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };
  class StubResponse {
    body: unknown;
    status: number;
    headers: unknown;
    constructor(body: unknown, init?: { status?: number; headers?: unknown }) {
      this.body = body;
      this.status = init?.status ?? 200;
      this.headers = init?.headers;
    }
    static error() {
      return { __error: true, status: 0 };
    }
    static redirect(url: string, status: number) {
      return { __redirect: url, status };
    }
  }
  new Function(
    "self",
    "caches",
    "fetch",
    "Response",
    "URL",
    "setTimeout",
    "clearTimeout",
    SW_SOURCE,
  )(
    self,
    cachesApi,
    (url: any) => fetchImpl(url),
    StubResponse,
    URL,
    setTimeout,
    clearTimeout,
  );
  return {
    listeners,
    cachesByName,
    fetchImpl,
    async fire(name, event) {
      listeners.get(name)!(event);
      if (event.__waited) await event.__waited;
    },
  };
}

function waitableEvent(extra: Record<string, unknown> = {}) {
  const event: any = { ...extra };
  event.waitUntil = (p: Promise<unknown>) => {
    event.__waited = p;
  };
  return event;
}

const NAV_CACHE = "xog-shell-v4-nav";

describe("sw.js install precache", () => {
  it("caches shell routes fetched cleanly (no redirect)", async () => {
    const sw = loadWorker(async (url) => res(String(url)));
    await sw.fire("install", waitableEvent());
    const nav = sw.cachesByName.get(NAV_CACHE)!;
    expect(await nav.match("/home")).toBeDefined();
    expect(await nav.match("/offline")).toBeDefined();
  });

  it("does NOT cache a shell route that redirected to /login (logged-out install)", async () => {
    const sw = loadWorker(async (url) => {
      const path = String(url);
      if (path === "/home" || path === "/offline") {
        return res(path, { redirected: true, finalPath: "/login" });
      }
      return res(path);
    });
    await sw.fire("install", waitableEvent());
    const nav = sw.cachesByName.get(NAV_CACHE)!;
    // A cached login page under /home = login wall on offline cold boot.
    expect(await nav.match("/home")).toBeUndefined();
    expect(await nav.match("/offline")).toBeUndefined();
    // Static precache entries are unaffected by the guard.
    expect(await nav.match("/manifest.webmanifest")).toBeDefined();
  });
});

describe("sw.js PRECACHE_URLS message", () => {
  it("skips redirected responses for per-playbook routes", async () => {
    const sw = loadWorker(async (url) => {
      const path = String(url);
      if (path === "/offline/pb-1") {
        return res(path, { redirected: true, finalPath: "/login" });
      }
      return res(path);
    });
    await sw.fire(
      "message",
      waitableEvent({
        data: { type: "PRECACHE_URLS", urls: ["/offline/pb-1", "/offline/pb-2"] },
      }),
    );
    const nav = sw.cachesByName.get(NAV_CACHE)!;
    expect(await nav.match("/offline/pb-1")).toBeUndefined();
    expect(await nav.match("/offline/pb-2")).toBeDefined();
  });
});

describe("sw.js referenced-asset precache (chunk skew fix, 2026-07-15)", () => {
  // The offline viewer for a downloaded playbook needs its route JS chunks.
  // The download only precached the page HTML; the chunks were cached lazily
  // (cache-first) and so were absent after a deploy or on a device that
  // never opened a play online — producing "Couldn't open the offline
  // viewer." The SW must cache a page's referenced /_next/static assets
  // atomically WITH the page so cached HTML can never reference an uncached
  // chunk.
  const VIEWER_HTML = `<!doctype html><html><head>
    <link rel="stylesheet" href="/_next/static/chunks/abc.css"/>
    <script src="/_next/static/chunks/def.js"></script>
    <link rel="modulepreload" href="/_next/static/chunks/ghi.js"/>
    </head><body>viewer</body></html>`;
  const CHUNKS = [
    "/_next/static/chunks/abc.css",
    "/_next/static/chunks/def.js",
    "/_next/static/chunks/ghi.js",
  ];

  function workerServingHtml(htmlForPath: string) {
    return loadWorker(async (url) => {
      const path = String(url);
      if (path === htmlForPath) return res(path, { body: VIEWER_HTML });
      return res(path);
    });
  }

  it("caches a per-playbook page's referenced chunks on PRECACHE_URLS", async () => {
    const sw = workerServingHtml("/offline/pb-1");
    await sw.fire(
      "message",
      waitableEvent({ data: { type: "PRECACHE_URLS", urls: ["/offline/pb-1"] } }),
    );
    const nav = sw.cachesByName.get(NAV_CACHE)!;
    const stat = sw.cachesByName.get(STATIC_CACHE)!;
    expect(await nav.match("/offline/pb-1")).toBeDefined();
    for (const c of CHUNKS) expect(await stat.match(c)).toBeDefined();
  });

  it("caches shell chunks at install time too", async () => {
    const sw = workerServingHtml("/home");
    await sw.fire("install", waitableEvent());
    const stat = sw.cachesByName.get(STATIC_CACHE)!;
    for (const c of CHUNKS) expect(await stat.match(c)).toBeDefined();
  });

  it("does not re-fetch a chunk already in the static cache (immutable)", async () => {
    let chunkFetches = 0;
    const sw = loadWorker(async (url) => {
      const path = String(url);
      if (path === "/offline/pb-1") return res(path, { body: VIEWER_HTML });
      if (path.startsWith("/_next/static/")) chunkFetches++;
      return res(path);
    });
    const stat = new FakeCache();
    await stat.put("/_next/static/chunks/def.js", res("/_next/static/chunks/def.js"));
    sw.cachesByName.set(STATIC_CACHE, stat);

    await sw.fire(
      "message",
      waitableEvent({ data: { type: "PRECACHE_URLS", urls: ["/offline/pb-1"] } }),
    );
    // abc.css + ghi.js fetched; def.js was already cached and skipped.
    expect(chunkFetches).toBe(2);
  });

  it("does not cache chunks for a page that redirected to /login", async () => {
    const sw = loadWorker(async (url) => {
      const path = String(url);
      if (path === "/offline/pb-1") {
        return res(path, { redirected: true, finalPath: "/login", body: VIEWER_HTML });
      }
      return res(path);
    });
    await sw.fire(
      "message",
      waitableEvent({ data: { type: "PRECACHE_URLS", urls: ["/offline/pb-1"] } }),
    );
    const stat = sw.cachesByName.get(STATIC_CACHE);
    for (const c of CHUNKS) expect(await stat?.match(c)).toBeFalsy();
  });
});

describe("sw.js activate purge", () => {
  it("deletes poisoned nav entries (redirected or /login final URL), keeps good ones", async () => {
    const sw = loadWorker(async (url) => res(String(url)));
    const nav = new FakeCache();
    await nav.put("/home", res("/home", { redirected: true, finalPath: "/login" }));
    await nav.put("/offline", res("/offline"));
    await nav.put("/offline/pb-1", res("/offline/pb-1"));
    sw.cachesByName.set(NAV_CACHE, nav);

    await sw.fire("activate", waitableEvent());

    expect(await nav.match("/home")).toBeUndefined();
    expect(await nav.match("/offline")).toBeDefined();
    expect(await nav.match("/offline/pb-1")).toBeDefined();
  });

  it("still purges caches from older shell versions", async () => {
    const sw = loadWorker(async (url) => res(String(url)));
    sw.cachesByName.set("xog-shell-v3-nav", new FakeCache());
    await sw.fire("activate", waitableEvent());
    expect(sw.cachesByName.has("xog-shell-v3-nav")).toBe(false);
  });
});

describe("sw.js navigation handler", () => {
  function navEvent(path: string) {
    const event: any = {
      request: {
        method: "GET",
        mode: "navigate",
        url: `${ORIGIN}${path}`,
        headers: { get: () => "" },
      },
    };
    event.respondWith = (p: Promise<unknown>) => {
      event.__responded = Promise.resolve(p);
    };
    return event;
  }

  it("does NOT overwrite a cached shell route with a post-sign-out login redirect", async () => {
    const goodHome = res("/home");
    const sw = loadWorker(async () =>
      res("/home", { redirected: true, finalPath: "/login" }),
    );
    const nav = new FakeCache();
    await nav.put("/home", goodHome);
    sw.cachesByName.set(NAV_CACHE, nav);

    const event = navEvent("/home");
    await sw.fire("fetch", event);
    await event.__responded;

    // The redirected response is returned to the caller (online behavior is
    // unchanged) but the cached copy must survive for the next offline boot.
    expect(await nav.match("/home")).toBe(goodHome);
  });

  it("serves the cached shell route when the network is down", async () => {
    const goodHome = res("/home");
    const sw = loadWorker(async () => {
      throw new Error("offline");
    });
    const nav = new FakeCache();
    await nav.put("/home", goodHome);
    sw.cachesByName.set(NAV_CACHE, nav);

    const event = navEvent("/home");
    await sw.fire("fetch", event);
    expect(await event.__responded).toBe(goodHome);
  });
});
