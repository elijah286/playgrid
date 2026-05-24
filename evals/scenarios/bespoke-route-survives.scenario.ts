/**
 * Coach asks for a bespoke route that isn't in the catalog. Cal must
 * handle it via the spec's `kind: "custom"` action (waypoints +
 * description), not refuse and not hand-author a fence.
 *
 * Origin: user question 2026-05-24 — "if a coach describes a highly
 * bespoke route... that's still something Cal should be able to
 * understand and represent." Pinned by Path B's custom-route example
 * in the prompt (commit 76897c29). This eval verifies Cal actually
 * uses the escape hatch when prompted.
 *
 * Negative companion: Cal must NOT refuse the request ("I can't
 * draw that") or jam it into the closest catalog family losing the
 * bespoke shape.
 */

import type { Scenario } from "../types";
import { fenceCount, fenceHasRouteFor, fenceHasNoIdleOffensivePlayers } from "../assertions/fence";
import { proseAvoids } from "../assertions/prose";

const scenario: Scenario = {
  name: "bespoke-route-survives",
  description:
    "Coach asks for an off-catalog route shape; Cal supports it (via spec custom action or compose+revise), doesn't refuse",
  origin: "user 2026-05-24 (commit 76897c29 — Path B custom-route example)",
  type: "positive",
  context: {
    sportVariant: "flag_7v7",
    playbookId: "eval-bespoke-route",
    playbookName: "Eval — Flag 7v7",
  },
  chat: [
    {
      role: "user",
      text:
        "Draw me a Spread Doubles play where @X runs an option route: 5-yard stem, " +
        "then break OUT if the safety drops to single-high middle / SIT at 5 yards if " +
        "the safety stays middle. The other receivers run standard Hitch/Go/Hitch and a Flat from the back.",
    },
  ],
  assertions: [
    // Exactly one fence (single play, single turn).
    fenceCount({ exact: 1 }),
    // Every offensive player gets a route — including @X's bespoke
    // option route.
    fenceHasNoIdleOffensivePlayers(),
    // @X specifically must have a route (the bespoke one). We don't
    // assert route_kind here because custom routes have no kind set
    // OR may be labeled "custom"; the fence_has_route_for check is
    // satisfied as long as @X is in the routes[] list.
    fenceHasRouteFor("X"),
    // Cal must NOT refuse with phrasings that imply the capability
    // doesn't exist. These are the regression shapes we'd see if the
    // Phase 2c misframing pushed Cal away from custom routes.
    proseAvoids(/I can'?t draw|isn'?t in the catalog|not a standard route/i, "refusal phrasing"),
    proseAvoids(/closest catalog family|approximat(e|ing) (it )?as a/i, "downgrade phrasing"),
  ],
};

export default scenario;
