import type { ReactNode } from "react";
import type { SportVariant } from "@/domain/play/types";

export type TutorialId =
  | "play_authoring_v1"
  | "defense_v1"
  | "formations_v1"
  | "practice_plan_v1";

export type TutorialStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "dismissed";

/** Where a step should anchor.
 *
 *  - `anchor`: spotlight the single element matching `data-tutor=<key>`.
 *  - `anchor-bbox`: spotlight the bounding rectangle that contains every
 *    visible match across `keys`. Used when a teaching beat covers two
 *    adjacent regions (e.g. the field canvas plus its toolbar below).
 *  - `center`: centered modal-style card with no spotlight — for purely
 *    informational beats ("welcome", "completion", "your work autosaves").
 */
export type StepAnchor =
  | { kind: "anchor"; key: string }
  | { kind: "anchor-bbox"; keys: string[] }
  | { kind: "center" };

/** How a step advances.
 *
 *  - `next`: user clicks the Next button.
 *  - `click`: user clicks anything matching `data-tutor=<key>`.
 *  - `appear`: a `data-tutor=<key>` element mounts in the DOM. Used for
 *    "do this thing → the relevant panel will appear → keep going" beats.
 *    The watcher only auto-advances when the target was *absent* at step
 *    entry, so the Back button doesn't re-trigger it.
 */
export type AdvanceCondition =
  | { kind: "next" }
  | { kind: "click"; key: string }
  | { kind: "appear"; key: string };

export interface StepDef {
  id: string;
  title: string;
  /** Body content. Plain strings work for most steps; return JSX
   *  (e.g. an inline list) when a step needs structured content like
   *  a bullet list of options. Keep it short — the card is 320px.
   *
   *  Context:
   *  - `variant`: the playbook's sport variant. Use for variant-specific
   *    copy (e.g. "5-on-5 flag" vs "11-on-11 tackle").
   *  - `pointer`: `"touch"` on touchscreen devices, `"mouse"` otherwise.
   *    Use to swap copy that depends on input modality — e.g. show
   *    "Press-and-hold" on touch, "Right-click" on mouse — rather than
   *    awkwardly listing both.
   *  - `actions`: the set of action-kinds the coach has performed
   *    during the current step. Editor handlers (drag, rename,
   *    recolor, route-add, template-apply) call `notifyTutorialAction`
   *    which dispatches a `tutorial:action` window event; the engine
   *    accumulates them into this set, resetting on every step
   *    transition. Use for reactive checkboxes ("Try X / Try Y") that
   *    flip as the coach experiments. */
  body: (ctx: {
    variant: SportVariant;
    pointer: "touch" | "mouse";
    actions: ReadonlySet<string>;
  }) => ReactNode;
  anchor: StepAnchor;
  advance: AdvanceCondition;
  /** When false, the step is omitted (not skipped) for the given variant. */
  appliesTo?: (variant: SportVariant) => boolean;
  /** Optional override for the next-button label. Defaults to "Next". */
  nextLabel?: string;
  /** When false, the background dim is suppressed and only the
   *  highlight ring around the target renders. Use for steps that
   *  require interacting with a popover/dropdown whose z-index sits
   *  below the dim layer. Default: true. */
  dimBackground?: boolean;
  /** Optional precondition that gates the Next button. While the
   *  matching `data-tutor` element is absent from the DOM, Next is
   *  disabled and `hint` is shown next to it. Enforces "do the thing,
   *  then advance" without trapping the user (they can still poke at
   *  the editor freely; they just can't move forward until the action
   *  is performed).
   *
   *  `kind: "anchor-present"` means the element exists in the DOM. For
   *  the "select a player" step, we point this at `quick-routes`,
   *  which only mounts when an offensive player is selected.
   *
   *  `latched: true` makes the gate one-way: once it goes true, it
   *  stays true for the rest of the step even if the element later
   *  disappears. Use for "transient action" anchors like an opened
   *  context menu, which mounts only while the menu is visible — we
   *  want Next to remain available once the coach has shown they can
   *  open it, not flicker back to disabled when they close it. */
  gate?:
    | {
        kind: "anchor-present";
        key: string;
        /** Hint shown next to the disabled Next button. Plain string for
         *  most steps; pass a function when the right wording depends on
         *  input modality (e.g. "Right-click…" vs "Press-and-hold…"). The
         *  function receives the same `pointer` value the step body does. */
        hint: string | ((ctx: { pointer: "touch" | "mouse" }) => string);
        latched?: boolean;
        /** Optional data-tutor key of the element the coach should
         *  interact with to satisfy the gate. When set, a ripple pulses
         *  on that element on step entry and again whenever the coach
         *  pokes the disabled Next button — the same one-shot animation
         *  the `select-player` step uses on the players. Useful when the
         *  required action is on an element outside the spotlight (e.g.
         *  step 8's Done button, which sits above the field). */
        nudgeAnchor?: string;
      }
    | {
        /** Action-based gate: Next is enabled once the named tutorial
         *  action has fired during this step (see `notifyTutorialAction`).
         *  Used for "do this thing to advance" beats where the
         *  satisfaction signal is an editor handler firing — e.g.
         *  "Reshape a route" gates on `anchor-dragged`, dispatched when
         *  the editor's node-drag handler commits a new node position. */
        kind: "action-fired";
        action: string;
        hint: string | ((ctx: { pointer: "touch" | "mouse" }) => string);
        /** When true, the gated-Next nudge dispatches the
         *  `tutorial:pulse-anchors` event, which pulses every visible
         *  route anchor (`[data-route-anchor]`). Use for steps that ask
         *  the coach to drag an anchor — the pulse makes the draggable
         *  spots obvious. */
        nudgePulseRouteAnchors?: boolean;
      };
  /** Extra `data-tutor` keys whose elements should remain click-through
   *  on this step even though they aren't the spotlit anchor. Use for
   *  exploratory steps that mention "try the color picker / pick a
   *  route template" — those panels live outside the canvas and would
   *  otherwise be eaten by the click block. The elements don't get the
   *  blue glow, just the pass-through. Always supplemented by the
   *  gate's `nudgeAnchor` if present. */
  allowAnchors?: ReadonlyArray<string>;
  /** State-shepherd: an action the engine dispatches *when this step
   *  becomes active*, so the editor lands in the right state for the
   *  step's UI. The user keeps full freedom mid-step — this only nudges
   *  on entry, never traps clicks. Engine fires a `tutorial:on-enter`
   *  window event; the editor listens and adjusts its selection state.
   *
   *  Available actions:
   *  - `ensure-player-selected`: if a route is currently selected (or
   *    nothing is), select that route's player (or the first offense
   *    player). Used by steps that need the QuickRoutes panel mounted.
   *  - `ensure-route-selected`: if no route is selected, select the
   *    first route in the play. Used by steps about reshaping routes.
   *  - `ensure-route-exists`: if no routes exist on the play, draw a
   *    default Curl on a sensible eligible receiver so the step has
   *    something to work with. If a route already exists, just selects
   *    it (same as `ensure-route-selected`). Used by the reshape step
   *    on fresh tutorial plays so the "drag an anchor" instruction is
   *    actionable without setup.
   *  - `clear-selection`: drop all selection state (player, opponent,
   *    route, zone). Used by steps that target panels which only render
   *    in the editor's "view" mode (e.g. the opponent overlay card,
   *    which hides while anything is selected). */
  onEnter?: OnEnterAction;
}

export type OnEnterAction =
  | { kind: "ensure-player-selected" }
  | { kind: "ensure-route-selected" }
  | { kind: "ensure-route-exists" }
  | { kind: "clear-selection" };

export interface TutorialDef {
  id: TutorialId;
  title: string;
  /** One-line summary shown in the Learning Center. */
  summary: string;
  /** Variants this tutorial supports. The engine refuses to start it
   *  against an unsupported variant. */
  supportedVariants: ReadonlyArray<SportVariant>;
  steps: ReadonlyArray<StepDef>;
}

export interface TutorialProgressRow {
  tutorialId: TutorialId;
  status: TutorialStatus;
  stepIndex: number;
  variant: SportVariant | null;
}
