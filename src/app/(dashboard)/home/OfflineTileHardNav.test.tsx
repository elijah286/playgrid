// @vitest-environment jsdom
/**
 * Regression (2026-07-16, reported on a real iPad): "if I go back to the
 * playbooks, they will not open in offline mode - even the ones that indicate
 * they are available".
 *
 * `InteractiveBookTile` — the DEFAULT /home tile (view = "preview") — rendered a
 * bare next/link `<Link>`. Offline, a `<Link>` tap is a CLIENT-SIDE RSC fetch,
 * not a document navigation. The SW routes RSC requests through
 * networkFirstWithCacheFallback with `htmlFallback` false, so without signal it
 * returns Response.error() — and both the SW's "not downloaded" page and its
 * /home fallback are htmlFallback-gated, so an RSC request cannot reach either.
 * The playbook HTML cached at download time was only ever reachable via a REAL
 * document navigation. Net effect: downloaded playbooks refused to open offline,
 * while "already inside the playbook" kept working — that was Next's in-memory
 * router cache, not the service worker.
 *
 * `PlaybookTile` had the correct `<a href>` branch all along, with a comment
 * describing this exact failure — but it only renders under the
 * `hide_lobby_playbook_animation` admin toggle, so the fix lived on a surface no
 * real coach sees while the default tile stayed broken. `InteractiveBookTile`
 * even destructured `isOnline` and never used it; that dead variable was the
 * bug's fingerprint.
 *
 * This pins the behavior: downloaded + offline + native → a real document
 * navigation. Every other combination keeps client-side routing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

let native = true;
vi.mock("@/lib/native/useIsNativeApp", () => ({
  useIsNativeApp: () => native,
}));

// next/link also renders an <a> in the DOM, so mark it — that marker is the only
// way to tell a client-side nav from a document nav in jsdom.
vi.mock("next/link", () => ({
  default: ({
    href,
    className,
    children,
  }: {
    href: string;
    className?: string;
    children: React.ReactNode;
  }) => (
    <a data-client-nav="true" href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/offline/db", () => ({
  OFFLINE_CACHE_EVENT: "xog:offline-cache-changed",
  // The playbook IS downloaded — the whole point is that it still wouldn't open.
  listCachedPlaybooks: vi.fn().mockResolvedValue([{ id: "pb-1" }]),
}));

// "Downloaded" now means data AND page — useOfflineState verifies the page
// against the real SW cache, because a data-only row (written by the background
// auto-cache loop) must never earn a badge. So a genuinely-downloaded fixture
// has to supply both halves.
vi.mock("@/lib/native/registerServiceWorker", () => ({
  OFFLINE_ROUTES_EVENT: "xog:offline-routes-changed",
  checkCachedRoutes: vi.fn(async (urls: string[]) => new Set(urls)),
}));

let online = true;
const listeners = new Set<() => void>();
vi.mock("@/lib/offline/connectivity", () => ({
  subscribeConnectivity: (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  getConnectivitySnapshot: () => online,
  getConnectivityServerSnapshot: () => true,
  probeConnectivity: vi.fn().mockResolvedValue(true),
}));

import { PlaybookBookTile } from "@/app/(dashboard)/home/ui";
import type { DashboardPlaybookTile } from "@/app/actions/plays";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  onchange: null,
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

const tile = {
  id: "pb-1",
  name: "Test Playbook",
  is_default: false,
  updated_at: null,
  play_count: 4,
  logo_url: null,
  color: null,
  season: null,
  role: "owner",
  shared_by_name: null,
  allow_coach_duplication: false,
  allow_player_duplication: false,
  is_locked: false,
  is_archived: false,
  sport_variant: "flag_7v7",
  settings: {},
  is_example: false,
  is_public_example: false,
  is_hero_marketing_example: false,
  previews: [],
} as unknown as DashboardPlaybookTile;

let container: HTMLDivElement;
let root: Root;

async function mount() {
  await act(async () => {
    root.render(<PlaybookBookTile tile={tile} actions={[]} />);
  });
  // Let listCachedPlaybooks resolve so downloadedIds is populated.
  await act(async () => {
    await Promise.resolve();
  });
}

const link = () =>
  container.querySelector('a[href="/playbooks/pb-1"]') as HTMLAnchorElement | null;

beforeEach(async () => {
  online = true;
  native = true;
  listeners.clear();
  // Reset to "pages ARE cached" — the genuinely-downloaded default. Without
  // this, a per-test mockResolvedValue leaks into later cases.
  const { checkCachedRoutes } = await import("@/lib/native/registerServiceWorker");
  vi.mocked(checkCachedRoutes).mockImplementation(
    async (urls: string[]) => new Set(urls),
  );
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("InteractiveBookTile navigation mode", () => {
  it("downloaded + OFFLINE + native → a REAL document nav (no client-side routing)", async () => {
    online = false;
    await mount();

    const a = link();
    expect(a).toBeTruthy();
    // The fix: NOT a next/link. A document navigation is the only request the
    // SW can answer from its cached HTML without signal.
    expect(a!.getAttribute("data-client-nav")).toBeNull();
  });

  it("downloaded + ONLINE → keeps client-side routing (no full reloads)", async () => {
    online = true;
    await mount();

    const a = link();
    expect(a).toBeTruthy();
    expect(a!.getAttribute("data-client-nav")).toBe("true");
  });

  it("DATA-ONLY playbook (auto-cache loop) → no offline claim, no nav into a miss", async () => {
    // The reported state (2026-07-16): the background auto-cache loop wrote data
    // for 30+ playbooks the coach never downloaded and cached ZERO pages. Every
    // tile showed the offline cloud, and tapping one bounced straight back to
    // /home on a cache miss. Now the page is measured, so a data-only row is
    // simply not downloaded — the tile greys out honestly instead of pretending.
    const { checkCachedRoutes } = await import("@/lib/native/registerServiceWorker");
    vi.mocked(checkCachedRoutes).mockResolvedValue(new Set<string>()); // no pages
    online = false;
    await mount();

    // No link at all: offline + not actually downloaded → the unavailable tile.
    expect(link()).toBeNull();
    // ...and it still names the playbook rather than vanishing.
    expect(container.textContent).toContain("Test Playbook");
  });

  it("offline on the WEB (not native) → unchanged client-side routing", async () => {
    online = false;
    native = false;
    await mount();

    // Web has no SW/offline story here — don't force document navs on it.
    expect(link()!.getAttribute("data-client-nav")).toBe("true");
  });

  it("survives an online → offline flip mid-session, ending on a document nav", async () => {
    online = true;
    await mount();
    expect(link()!.getAttribute("data-client-nav")).toBe("true");

    // The connectivity probe resolves ~1s after hydration on an offline cold
    // boot — the same runtime flip that once caused React #300 here.
    const onError = vi.fn();
    window.addEventListener("error", onError);
    await act(async () => {
      online = false;
      listeners.forEach((l) => l());
    });
    window.removeEventListener("error", onError);

    expect(onError).not.toHaveBeenCalled();
    expect(link()).toBeTruthy();
    expect(link()!.getAttribute("data-client-nav")).toBeNull();
  });
});
