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

// Derived from the worker itself: SHELL_VERSION is bumped whenever the cache
// contract changes, and hard-coding it here made every bump fail ~10 unrelated
// tests for no signal.
const SHELL_VERSION = /const SHELL_VERSION = "([^"]+)"/.exec(SW_SOURCE)![1];
const NAV_CACHE = `${SHELL_VERSION}-nav`;

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

const STATIC_CACHE = `${SHELL_VERSION}-static`;

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

describe("sw.js precache progress reporting", () => {
  // Downloading a playbook = one page fetch per play. The button used to claim
  // "Available offline" the instant the DATA landed while these were still in
  // flight, so a coach tapped a play that wouldn't open. Progress must reach
  // `total` on EVERY path — a stall at 90% is a permanently-spinning button.
  function fakePort() {
    const messages: any[] = [];
    return { port: { postMessage: (m: any) => messages.push(m) }, messages };
  }

  it("reports a tick per URL and finishes at total", async () => {
    const sw = loadWorker(async (url) => res(String(url)));
    const { port, messages } = fakePort();

    await sw.fire(
      "message",
      waitableEvent({
        data: { type: "PRECACHE_URLS", urls: ["/plays/a/edit", "/plays/b/edit"] },
        ports: [port],
      }),
    );

    const ticks = messages.filter((m) => m.type === "PRECACHE_PROGRESS");
    expect(ticks.map((t) => t.done)).toEqual([1, 2]);
    expect(ticks.every((t) => t.total === 2)).toBe(true);
    expect(messages.at(-1)).toMatchObject({ type: "PRECACHE_DONE", done: 2, total: 2 });
  });

  it("reaches total when a page FAILS, and reports the failure HONESTLY", async () => {
    const sw = loadWorker(async (url) => {
      if (String(url) === "/plays/b/edit") throw new Error("offline");
      return res(String(url));
    });
    const { port, messages } = fakePort();

    await sw.fire(
      "message",
      waitableEvent({
        data: { type: "PRECACHE_URLS", urls: ["/plays/a/edit", "/plays/b/edit"] },
        ports: [port],
      }),
    );

    // Ticks to total so the button can't hang at 50% forever...
    // ...but `failed` must surface: with no degraded fallback, an uncached page
    // means that play WON'T OPEN offline. Rounding up to a clean 100% would be
    // the same lie as the old premature "Available offline".
    expect(messages.at(-1)).toMatchObject({
      type: "PRECACHE_DONE",
      done: 2,
      total: 2,
      failed: 1,
    });
  });

  it("reports failed: 0 when everything really landed", async () => {
    const sw = loadWorker(async (url) => res(String(url)));
    const { port, messages } = fakePort();
    await sw.fire(
      "message",
      waitableEvent({
        data: { type: "PRECACHE_URLS", urls: ["/plays/a/edit"] },
        ports: [port],
      }),
    );
    expect(messages.at(-1)).toMatchObject({ type: "PRECACHE_DONE", failed: 0 });
  });

  it("a page that 404s counts as FAILED, not success", async () => {
    const sw = loadWorker(async (url) => {
      if (String(url) === "/plays/b/edit") {
        return res(String(url), { ok: false, status: 404 });
      }
      return res(String(url));
    });
    const { port, messages } = fakePort();
    await sw.fire(
      "message",
      waitableEvent({
        data: { type: "PRECACHE_URLS", urls: ["/plays/a/edit", "/plays/b/edit"] },
        ports: [port],
      }),
    );
    expect(messages.at(-1)).toMatchObject({ type: "PRECACHE_DONE", failed: 1 });
  });

  it("does NOT fetch an RSC payload — half the requests, and the RSC was the bug", async () => {
    // We used to precache the RSC for every play: 75KB + one extra request each
    // (half the download's requests, ~30% of its bytes). Worse, it CAUSED the
    // failure it was meant to prevent — cacheKeyFor collapses every `_rsc` value
    // to one key, so a single full-tree payload got replayed cross-context and
    // threw into the editor's error boundary.
    //
    // Letting the RSC miss is faster AND correct: Next converts a failed RSC
    // fetch into a document navigation, which we answer from the cached HTML.
    const fetched: string[] = [];
    const sw = loadWorker(async (url) => {
      fetched.push(String(url));
      return res(String(url));
    });
    const { port, messages } = fakePort();

    await sw.fire(
      "message",
      waitableEvent({
        data: { type: "PRECACHE_URLS", urls: ["/plays/a/edit"] },
        ports: [port],
      }),
    );

    expect(fetched).toContain("/plays/a/edit"); // the HTML: yes
    expect(fetched.some((u) => u.includes("_rsc"))).toBe(false); // the RSC: never
    expect(messages.at(-1)).toMatchObject({
      type: "PRECACHE_DONE",
      done: 1,
      total: 1,
      failed: 0,
    });
  });

  it("does not throw when the page navigated away and the port is dead", async () => {
    const sw = loadWorker(async (url) => res(String(url)));
    const deadPort = {
      postMessage: () => {
        throw new Error("port closed");
      },
    };
    // Must not reject — a coach leaving the page mid-download is normal.
    await expect(
      sw.fire(
        "message",
        waitableEvent({
          data: { type: "PRECACHE_URLS", urls: ["/plays/a/edit"] },
          ports: [deadPort],
        }),
      ),
    ).resolves.toBeUndefined();
  });
});

describe("sw.js CHECK_CACHED_URLS query", () => {
  it("answers with exactly the routes that are really cached", async () => {
    const sw = loadWorker(async (url) => res(String(url)));
    const nav = new FakeCache();
    await nav.put("/plays/a/edit", res("/plays/a/edit"));
    sw.cachesByName.set(NAV_CACHE, nav);
    const messages: any[] = [];

    await sw.fire(
      "message",
      waitableEvent({
        data: { type: "CHECK_CACHED_URLS", urls: ["/plays/a/edit", "/plays/b/edit"] },
        ports: [{ postMessage: (m: any) => messages.push(m) }],
      }),
    );

    // b is NOT cached — the glyph must not claim it's available offline.
    expect(messages).toEqual([{ cached: ["/plays/a/edit"] }]);
  });
});

describe("sw.js poisoned-home guard (2026-07-15)", () => {
  // /home can render "Couldn't load — check your connection" as a 200 when the
  // dashboard fetch times out on a flaky connection. Caching that poisons the
  // offline boot with a dead-end error page. It must never be cached, and an
  // already-poisoned entry must be healed on activate.
  const POISON = "<html><body>Couldn't load — check your connection.</body></html>";

  function navEvent(path: string) {
    const event: any = {
      request: { method: "GET", mode: "navigate", url: `${ORIGIN}${path}`, headers: { get: () => "" } },
    };
    event.respondWith = (p: Promise<unknown>) => {
      event.__responded = Promise.resolve(p);
    };
    return event;
  }

  // Navigation fetches pass the request OBJECT (not a URL string); read its url.
  const pathOf = (u: any) => (typeof u === "string" ? u : new URL(u.url).pathname);

  it("does NOT cache a /home response showing the connection error", async () => {
    const sw = loadWorker(async (u) => {
      const path = pathOf(u);
      if (path === "/home") return res(path, { body: POISON });
      return res(path);
    });
    const event = navEvent("/home");
    await sw.fire("fetch", event);
    await event.__responded;
    const nav = sw.cachesByName.get(NAV_CACHE);
    expect(await nav?.match("/home")).toBeUndefined();
  });

  it("still caches a healthy /home", async () => {
    const sw = loadWorker(async (u) => res(pathOf(u), { body: "<html>playbooks</html>" }));
    const event = navEvent("/home");
    await sw.fire("fetch", event);
    await event.__responded;
    const nav = sw.cachesByName.get(NAV_CACHE)!;
    expect(await nav.match("/home")).toBeDefined();
  });

  it("heals an already-cached poisoned /home on activate", async () => {
    const sw = loadWorker(async (url) => res(String(url)));
    const nav = new FakeCache();
    await nav.put("/home", res("/home", { body: POISON }));
    await nav.put("/offline", res("/offline"));
    sw.cachesByName.set(NAV_CACHE, nav);
    await sw.fire("activate", waitableEvent());
    expect(await nav.match("/home")).toBeUndefined();
    expect(await nav.match("/offline")).toBeDefined();
  });
});

describe("sw.js PRECACHE_URLS dedupe (self-heal, 2026-07-15)", () => {
  it("skips URLs already cached when dedupe is set", async () => {
    const fetched: string[] = [];
    const sw = loadWorker(async (url) => {
      fetched.push(String(url));
      return res(String(url), { body: "x" });
    });
    const nav = new FakeCache();
    await nav.put("/plays/a/edit", res("/plays/a/edit"));
    sw.cachesByName.set(NAV_CACHE, nav);
    await sw.fire(
      "message",
      waitableEvent({
        data: { type: "PRECACHE_URLS", dedupe: true, urls: ["/plays/a/edit", "/plays/b/edit"] },
      }),
    );
    expect(await nav.match("/plays/b/edit")).toBeDefined();
    // a is already cached → not re-fetched. (Since we no longer precache RSC,
    // a cached HTML entry is the whole story for that route — there's nothing
    // left to strand.)
    expect(fetched).toEqual(["/plays/b/edit"]);
  });

  it("re-fetches everything when dedupe is absent (download refresh)", async () => {
    let pageFetches = 0;
    const sw = loadWorker(async (url) => {
      if (/\/edit$/.test(String(url))) pageFetches++;
      return res(String(url), { body: "x" });
    });
    const nav = new FakeCache();
    await nav.put("/plays/a/edit", res("/plays/a/edit"));
    sw.cachesByName.set(NAV_CACHE, nav);
    await sw.fire(
      "message",
      waitableEvent({ data: { type: "PRECACHE_URLS", urls: ["/plays/a/edit"] } }),
    );
    expect(pageFetches).toBe(1); // refreshed despite being cached
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

  it("shows a 'not downloaded' page (NOT a /home bounce) for an uncached play route offline", async () => {
    // The "tapped a play, got kicked back to the lobby" report: an uncached
    // play route offline used to redirect to /home. It must serve an honest
    // not-downloaded page instead.
    const sw = loadWorker(async () => {
      throw new Error("offline");
    });
    const nav = new FakeCache();
    await nav.put("/home", res("/home")); // /home IS cached (the bounce target)
    sw.cachesByName.set(NAV_CACHE, nav);

    const event = navEvent("/plays/xyz/edit");
    await sw.fire("fetch", event);
    const response: any = await event.__responded;

    expect(response.__redirect).toBeUndefined(); // not a /home redirect
    expect(String(response.body)).toContain("Available offline");
    expect(String(response.body)).toContain("isn"); // "isn't downloaded"
  });

  it("still bounces a NON-play uncached route to the cached /home shell", async () => {
    // Scoping guard: the not-downloaded page is play-specific; other uncached
    // shell routes keep the existing /home fallback.
    const sw = loadWorker(async () => {
      throw new Error("offline");
    });
    const nav = new FakeCache();
    await nav.put("/home", res("/home"));
    sw.cachesByName.set(NAV_CACHE, nav);

    const event = navEvent("/playbooks/pb-1");
    await sw.fire("fetch", event);
    const response: any = await event.__responded;
    expect(response.__redirect).toBe("/home");
  });
});
