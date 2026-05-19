import { CheckSquare, Square } from "lucide-react";
import type { ReactNode } from "react";
import type { SportVariant } from "@/domain/play/types";
import type { TutorialDef } from "../engine/types";
import { ANCHOR_PULSE_EVENT } from "../engine/AnchorPulse";

/** Single row of a reactive try-it checklist. Flips from a hollow
 *  square to a filled check the moment the matching action-kind
 *  appears in the active step's action set.
 *
 *  Optional `findKey` renders a small "Find" link that pulses the
 *  matching `data-tutor` element when clicked — for coaches who
 *  can't spot the relevant UI surface on their own.
 *
 *  Optional `findOpens` also fires a `tutorial:request-open` event
 *  with the given target, so a collapsible editor surface (notes
 *  section, side panel, etc.) opens itself when the coach clicks
 *  find — no need to expand it manually first. */
function TryRow({
  done,
  findKey,
  findOpens,
  children,
}: {
  done: boolean;
  findKey?: string;
  findOpens?: string;
  children: ReactNode;
}) {
  const Icon = done ? CheckSquare : Square;
  return (
    <li className="flex items-start gap-2">
      <Icon
        className={`mt-0.5 size-3.5 shrink-0 transition-colors ${
          done ? "text-emerald-300" : "text-white/70"
        }`}
      />
      <span
        className={`min-w-0 flex-1 transition-colors ${
          done ? "text-white/60" : "text-white/90"
        }`}
      >
        <span className={done ? "line-through" : ""}>{children}</span>
        {findKey && (
          <>
            {" "}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (findOpens) {
                  window.dispatchEvent(
                    new CustomEvent("tutorial:request-open", {
                      detail: { target: findOpens },
                    }),
                  );
                }
                window.dispatchEvent(
                  new CustomEvent(ANCHOR_PULSE_EVENT, {
                    detail: { key: findKey },
                  }),
                );
              }}
              // Tagged so the click-blocker treats it as always-allowed.
              data-tutor-allow=""
              // Find stays visible even after the row is checked off
              // so the coach can re-pulse the target if they want to
              // refer back to it.
              className="ml-0.5 inline-block rounded text-[11px] font-medium text-white/70 underline decoration-white/40 underline-offset-2 hover:text-white hover:decoration-white"
            >
              find
            </button>
          </>
        )}
      </span>
    </li>
  );
}

const PLAYERS_PER_SIDE: Record<SportVariant, string> = {
  flag_5v5: "5-on-5 flag",
  flag_6v6: "6-on-6 flag",
  flag_7v7: "7-on-7 flag",
  tackle_11: "11-on-11 tackle",
  other: "this variant",
};

export const PLAY_AUTHORING_TUTORIAL: TutorialDef = {
  id: "play_authoring_v1",
  title: "Build an offensive play",
  summary:
    "Walk through the play editor end-to-end — formation, routes, route style, motion, defense, and notes. ~3 minutes.",
  supportedVariants: ["flag_5v5", "flag_6v6", "flag_7v7", "tackle_11"],
  steps: [
    {
      id: "welcome",
      title: "Field overview",
      body: ({ variant }) =>
        `This is the field for ${PLAYERS_PER_SIDE[variant]}. You'll draw plays here — players on the field, routes that show where they go.`,
      anchor: { kind: "anchor", key: "editor-canvas" },
      advance: { kind: "next" },
    },
    {
      id: "field-appearance",
      title: "Customize the field",
      body: () =>
        "The toolbar below the field tweaks layout, hash marks, yard numbers, and colors. Experiment freely — your playbook keeps the look you choose.",
      anchor: { kind: "anchor", key: "field-controls" },
      advance: { kind: "next" },
      // Skip the dim so the user can see how each control changes the
      // field in real time as they experiment.
      dimBackground: false,
    },
    {
      id: "player-and-route-basics",
      title: "Move, rename, color, draw",
      body: ({ actions, pointer }) => (
        <>
          <p>Tap a player to select them. Try any of these — none are required:</p>
          <ul className="mt-2 space-y-1.5">
            <TryRow
              done={actions.has("player-moved")}
              findKey="editor-canvas"
            >
              Drag the player to a new spot on the field
            </TryRow>
            <TryRow
              done={actions.has("player-renamed")}
              findKey="editor-canvas"
            >
              {pointer === "touch"
                ? "Double-tap the player to rename"
                : "Double-click the player to rename"}
            </TryRow>
            <TryRow
              done={actions.has("player-recolored")}
              findKey="route-toolbar-color"
            >
              Swap colors via the toolbar
            </TryRow>
            <TryRow
              done={actions.has("route-drawn")}
              findKey="editor-canvas"
            >
              Draw a route by dragging from the player
            </TryRow>
            <TryRow
              done={actions.has("route-from-template")}
              findKey="quick-routes"
            >
              Apply a route template from the right panel
            </TryRow>
          </ul>
        </>
      ),
      anchor: { kind: "anchor", key: "editor-canvas" },
      advance: { kind: "next" },
      // Combined step covers selection + movement + rename + recolor +
      // route drawing + template. No dim so the coach can freely roam
      // the canvas, route toolbar, and quick-routes panel. No gate —
      // Next is always available; "try a few" is exploration.
      dimBackground: false,
      // Let the coach reach the color picker (in the route toolbar)
      // and the route templates (in the quick-routes panel) without
      // the click block eating their taps. The "find" links in the
      // body bullets pulse these anchors so coaches can locate them.
      allowAnchors: ["route-toolbar", "quick-routes"],
      // Pre-select a player so the right panel immediately shows
      // quick-routes and the toolbar lights up — the coach can start
      // experimenting without hunting for a click target.
      onEnter: { kind: "ensure-player-selected" },
    },
    {
      id: "reshape-route",
      title: "Reshape a route",
      body: () =>
        "Drag any of the white anchors on the route to bend it. Click a segment to select just that piece, or click the player to select the whole route.",
      anchor: { kind: "anchor", key: "editor-canvas" },
      advance: { kind: "next" },
      // Auto-draw a Curl if the play has no routes yet, then select it.
      // The Curl has 3 anchors, so the "drag an anchor" instruction is
      // always actionable — coaches don't have to draw a route first.
      onEnter: { kind: "ensure-route-exists" },
      // Block Next until the coach actually drags an anchor; on a
      // gated-Next click, pulse every visible route anchor so they
      // can spot the draggable spots.
      gate: {
        kind: "action-fired",
        action: "anchor-dragged",
        hint: "Drag any white anchor on the route to continue",
        nudgePulseRouteAnchors: true,
      },
    },
    {
      id: "route-toolbar",
      title: "Style your routes",
      body: ({ actions }) => (
        <>
          <p>
            The toolbar above the field restyles whatever&apos;s selected. Try a
            few — none are required:
          </p>
          <ul className="mt-2 space-y-1.5">
            <TryRow
              done={actions.has("route-shape-changed")}
              findKey="route-toolbar-shape"
            >
              Switch a segment from straight to curve
            </TryRow>
            <TryRow
              done={actions.has("route-stroke-changed")}
              findKey="route-toolbar-stroke"
            >
              Change the stroke (dashed, dotted, motion)
            </TryRow>
            <TryRow
              done={actions.has("route-color-changed")}
              findKey="route-toolbar-color"
            >
              Change the route color
            </TryRow>
            <TryRow
              done={actions.has("route-end-changed")}
              findKey="route-toolbar-end"
            >
              Change the end decoration (arrow / T / none)
            </TryRow>
            <TryRow
              done={actions.has("route-undo-redo")}
              findKey="route-toolbar-undo"
            >
              Use undo or redo to roll back a change
            </TryRow>
          </ul>
        </>
      ),
      anchor: { kind: "anchor", key: "route-toolbar" },
      advance: { kind: "next" },
      // No dim so the coach can actually see the route change as they
      // style it. No gate either — Next is always available; the
      // checklist is exploration, not a contract.
      dimBackground: false,
      // Pre-select a route on entry so the toolbar's per-selection
      // controls (shape, stroke, color, end style) are immediately
      // meaningful.
      onEnter: { kind: "ensure-route-selected" },
      // Whitelist the canvas (so the coach can click a different route
      // or anchor to re-target) and the route toolbar's sub-controls
      // (each has its own data-tutor anchor that the find links pulse).
      allowAnchors: [
        "editor-canvas",
        "route-toolbar-shape",
        "route-toolbar-stroke",
        "route-toolbar-width",
        "route-toolbar-end",
        "route-toolbar-color",
        "route-toolbar-undo",
      ],
    },
    {
      id: "right-click-menu",
      title: "Motion, speed & quick edits",
      body: ({ pointer }) =>
        pointer === "touch"
          ? "Press-and-hold any player or route to install motion, set speed, flip horizontally, or jump to other quick actions."
          : "Right-click any player or route to install motion, set speed, flip horizontally, or jump to other quick actions.",
      anchor: { kind: "anchor", key: "editor-canvas" },
      advance: { kind: "next" },
      // Lock Next until the coach actually opens a quick-actions menu.
      // Latched so closing the menu doesn't flip Next back to disabled —
      // once they've shown they can open it, they're free to move on.
      gate: {
        kind: "anchor-present",
        key: "quick-actions-menu",
        hint: ({ pointer }) =>
          pointer === "touch"
            ? "Press-and-hold a player or route to continue"
            : "Right-click a player or route to continue",
        latched: true,
      },
    },
    {
      id: "opponent",
      title: "Install a defense, set the reads",
      body: () =>
        "Install a defense to test your play against — then give each receiver a read tied to specific shifts and movements, so they know what to do based on what the defense shows.",
      anchor: { kind: "anchor", key: "opponent-overlay" },
      advance: { kind: "next" },
      // The opponent card only renders when nothing is selected (the
      // editor flips into "view" mode then). Suppress the dim so the
      // coach can see the Done button above the field, and pulse it
      // on step entry / disabled-Next click so they know where to go.
      // When they tap Done, the opponent panel mounts, the gate flips,
      // and the spotlight reveals on it.
      dimBackground: false,
      gate: {
        kind: "anchor-present",
        key: "opponent-overlay",
        hint: "Tap Done above to see the defense panel",
        nudgeAnchor: "editor-done",
      },
    },
    {
      id: "formation",
      title: "Formations: reuse & save",
      body: () =>
        "Open the formation picker to drop players in a preset arrangement — or save the current layout as a new formation so you can reuse it across plays.",
      anchor: { kind: "anchor", key: "formation-picker" },
      advance: { kind: "next" },
      // The picker's dropdown sits at z-50, below the dim layer — drop
      // the dim for this step so the dropdown is fully usable.
      dimBackground: false,
    },
    {
      id: "play-notes",
      title: "Write play notes",
      body: ({ actions }) => (
        <>
          <p>
            Jot down assignments and reads under the field. Mention players to
            render colored chips coaches can scan fast:
          </p>
          <ul className="mt-2 space-y-1.5">
            <TryRow
              done={actions.has("note-color-ref")}
              findKey="play-notes"
              findOpens="play-notes"
            >
              Reference a player by color, e.g.{" "}
              <code className="rounded bg-white/15 px-1 py-0.5 text-[11px]">
                @yellow
              </code>
            </TryRow>
            <TryRow
              done={actions.has("note-letter-ref")}
              findKey="play-notes"
              findOpens="play-notes"
            >
              Reference a player by letter, e.g.{" "}
              <code className="rounded bg-white/15 px-1 py-0.5 text-[11px]">
                @Z
              </code>
            </TryRow>
          </ul>
        </>
      ),
      anchor: { kind: "anchor", key: "play-notes" },
      advance: { kind: "next" },
      dimBackground: false,
    },
    {
      id: "autosave",
      title: "Autosave",
      body: () =>
        "Your work autosaves as you edit. You can rename, duplicate, or archive the play from the header menu — nothing extra to remember.",
      anchor: { kind: "center" },
      advance: { kind: "next" },
    },
    {
      id: "done",
      title: "You're set",
      body: () =>
        "That's the loop: players → routes → defense. Use the banner above the field to keep this play in your playbook — or discard it if you were just exploring.",
      anchor: { kind: "center" },
      advance: { kind: "next" },
      nextLabel: "Got it",
    },
  ],
};
