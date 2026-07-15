// @vitest-environment jsdom
/**
 * Regression: React #300 on offline cold boot (2026-07-15).
 *
 * PlaybookBookTile early-returned <OfflineUnavailableBookTile> ABOVE the
 * interactive tile's hooks. `isOnline` flips at runtime — on an offline
 * cold boot the connectivity probe resolves ~1s after hydration — so a
 * tile first rendered interactive re-rendered through the early return
 * with fewer hooks. React #300 ("rendered fewer hooks than expected")
 * escalated to the root error boundary and replaced /home with "Something
 * went wrong." on exactly the surface an offline coach needs. The fix
 * branches by swapping child COMPONENTS, so each branch owns a stable
 * hook list. This test drives the real hook through the flip.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/lib/native/useIsNativeApp", () => ({
  useIsNativeApp: () => true,
}));
vi.mock("@/lib/offline/db", () => ({
  OFFLINE_CACHE_EVENT: "xog:offline-cache-changed",
  listCachedPlaybooks: vi.fn().mockResolvedValue([]),
}));
// Controllable connectivity store standing in for the real probe-backed one.
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

// jsdom has no matchMedia; the interactive tile's touch detection needs one.
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

function setOnline(next: boolean) {
  online = next;
  listeners.forEach((l) => l());
}

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

beforeEach(() => {
  online = true;
  listeners.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("PlaybookBookTile under a runtime connectivity flip", () => {
  it("survives online → offline without a hooks-order crash and greys the tile", async () => {
    const onError = vi.fn();
    await act(async () => {
      root.render(
        // React logs boundary-less errors to console.error and rethrows;
        // capture via window handler so a regression fails loudly here
        // instead of via unhandled exception noise.
        <PlaybookBookTile tile={tile} actions={[]} />,
      );
    });
    window.addEventListener("error", onError);

    expect(container.textContent).toContain("Test Playbook");
    // interactive: renders a link to the online playbook route
    expect(container.querySelector('a[href="/playbooks/pb-1"]')).toBeTruthy();

    // The probe resolves: we're actually offline. Pre-fix this re-render
    // crossed the early return and crashed with React #300.
    await act(async () => setOnline(false));

    window.removeEventListener("error", onError);
    expect(onError).not.toHaveBeenCalled();
    // Not downloaded → tile greys out and the online link disappears.
    expect(container.querySelector('a[href="/playbooks/pb-1"]')).toBeNull();
    expect(container.textContent).toContain("Test Playbook");

    // And flipping back restores the interactive tile.
    await act(async () => setOnline(true));
    expect(container.querySelector('a[href="/playbooks/pb-1"]')).toBeTruthy();
  });
});
