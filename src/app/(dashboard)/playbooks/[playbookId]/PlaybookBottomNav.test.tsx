/**
 * Slot-order contract for the playbook mobile bottom nav.
 *
 * The bar must stay in lockstep with the lobby's HomeBottomNav so a coach
 * never sees a function jump slots when entering a playbook:
 *
 *   Plays · Calendar · [Cal] · Messages · More
 *
 * Calendar is slot 2 (matching the lobby), Cal is the centered slot 3, and
 * the "communications" slot 4 (team Chat here, Inbox in the lobby) keeps its
 * position. A regression that moves Calendar back to slot 4 — the bug that
 * prompted this — fails the order assertion below.
 *
 * Uses renderToStaticMarkup so we don't need a DOM-testing dep; next/link,
 * the Cal action button, and the sign-out server action are stubbed so the
 * test exercises ordering, not Next's router runtime or server code.
 */

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children?: unknown }) => (
    <a href={href}>{children as never}</a>
  ),
}));
vi.mock("@/features/coach-ai/CalNavButton", () => ({
  CalNavButton: () => <button type="button">Cal</button>,
}));
vi.mock("@/app/actions/auth", () => ({ signOutAction: vi.fn() }));

import { PlaybookBottomNav, type PlaybookBottomNavTab } from "./PlaybookBottomNav";

function render(
  overrides: Partial<{
    available: {
      calendar: boolean;
      games: boolean;
      practicePlans: boolean;
      messages: boolean;
    };
    showCoachCal: boolean;
  }> = {},
): string {
  return renderToStaticMarkup(
    <PlaybookBottomNav
      active={"plays" as PlaybookBottomNavTab}
      onChange={() => {}}
      available={{
        calendar: true,
        games: true,
        practicePlans: true,
        messages: true,
        ...overrides.available,
      }}
      counts={{ plays: 3, formations: 2, roster: 5, calendar: 4 }}
      messagesUnread={0}
      showCoachCal={overrides.showCoachCal ?? true}
      isAdmin={false}
    />,
  );
}

/** Index of each label in render order; -1 if absent. */
function order(html: string, labels: string[]): number[] {
  return labels.map((l) => html.indexOf(`>${l}<`));
}

describe("PlaybookBottomNav slot order", () => {
  it("renders Plays · Calendar · Cal · Chat · More in that order", () => {
    const html = render();
    const [plays, calendar, cal, chat, more] = order(html, [
      "Plays",
      "Calendar",
      "Cal",
      "Chat",
      "More",
    ]);
    // All present.
    for (const i of [plays, calendar, cal, chat, more]) {
      expect(i).toBeGreaterThan(-1);
    }
    // Strictly increasing position = left-to-right slot order.
    expect(plays).toBeLessThan(calendar);
    expect(calendar).toBeLessThan(cal);
    expect(cal).toBeLessThan(chat);
    expect(chat).toBeLessThan(more);
  });

  it("keeps Plays · Cal · Chat order when Calendar is gated off", () => {
    const html = render({
      available: {
        calendar: false,
        games: true,
        practicePlans: true,
        messages: true,
      },
    });
    expect(html).not.toContain(">Calendar<");
    const [plays, cal, chat] = order(html, ["Plays", "Cal", "Chat"]);
    expect(plays).toBeGreaterThan(-1);
    expect(plays).toBeLessThan(cal);
    expect(cal).toBeLessThan(chat);
  });
});
