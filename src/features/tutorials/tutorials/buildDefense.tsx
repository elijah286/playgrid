import type { ReactNode } from "react";
import { CheckSquare, Square } from "lucide-react";
import type { TutorialDef } from "../engine/types";

/** Reactive checklist row — same shape as the one in playAuthoring.tsx.
 *  Kept local to this file to keep each tutorial self-contained; if a
 *  third tutorial needs it we'll lift it to a shared module. */
function TryRow({
  done,
  findKey,
  children,
}: {
  done: boolean;
  findKey?: string;
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
                window.dispatchEvent(
                  new CustomEvent("tutorial:anchor-pulse", {
                    detail: { key: findKey },
                  }),
                );
              }}
              data-tutor-allow=""
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

export const BUILD_DEFENSE_TUTORIAL: TutorialDef = {
  id: "defense_v1",
  title: "Build a defense",
  summary:
    "Install a defensive call, scout the opposing scheme, and tag the post-snap movement your defenders take. ~2 minutes.",
  supportedVariants: ["flag_5v5", "flag_6v6", "flag_7v7", "tackle_11"],
  steps: [
    {
      id: "welcome",
      title: "Install a defense",
      body: () =>
        "Every offensive play gets sharper when you test it against a defense. You can drop one in from your playbook, scout the opponent's scheme, or build a custom defense for this exact play.",
      anchor: { kind: "anchor", key: "opponent-overlay" },
      advance: { kind: "next" },
      // Clear any selection so the opponent panel mounts (it only renders
      // in the editor's view mode).
      onEnter: { kind: "clear-selection" },
      dimBackground: false,
    },
    {
      id: "pick-from-playbook",
      title: "Pick from your playbook",
      body: ({ actions }) => (
        <>
          <p>
            Search the list to drop a defensive play or formation onto the field
            as a transient overlay — great for previewing how your offense looks
            against a known coverage.
          </p>
          <ul className="mt-2 space-y-1.5">
            <TryRow
              done={actions.has("opponent-picked")}
              findKey="opponent-picker-search"
            >
              Pick a defensive play or formation from the list
            </TryRow>
          </ul>
          <p className="mt-2 text-[11px] leading-snug text-white/70">
            No defenses in this playbook yet? Skip to the next step and build a
            custom one.
          </p>
        </>
      ),
      anchor: { kind: "anchor", key: "opponent-picker-search" },
      advance: { kind: "next" },
      dimBackground: false,
    },
    {
      id: "build-custom",
      title: "Or build a custom defense",
      body: ({ actions }) => (
        <>
          <p>
            One-off looks for THIS play. The Custom button drops a default
            defender setup; drag them around the field to position the coverage
            you want to draw up.
          </p>
          <ul className="mt-2 space-y-1.5">
            <TryRow
              done={actions.has("opponent-custom-created")}
              findKey="opponent-custom-create"
            >
              Drop a default defense to start
            </TryRow>
          </ul>
        </>
      ),
      anchor: { kind: "anchor", key: "opponent-custom-create" },
      advance: { kind: "next" },
      dimBackground: false,
    },
    {
      id: "position-defenders",
      title: "Position your defenders",
      body: ({ pointer }) =>
        pointer === "touch"
          ? "Drag a defender to reposition them. Press-and-hold a defender to install motion, set speed, or jump to other quick actions — the same menu offensive players use."
          : "Drag a defender to reposition them. Right-click a defender to install motion, set speed, or jump to other quick actions — the same menu offensive players use.",
      anchor: { kind: "anchor", key: "editor-canvas" },
      advance: { kind: "next" },
      dimBackground: false,
    },
    {
      id: "save-as-defense",
      title: "Save it to the playbook",
      body: () =>
        "Once the custom defense looks right, save it as a standalone defensive play. From there you can install it against any offense in the playbook — the lookup goes both directions.",
      anchor: { kind: "anchor", key: "opponent-save-as-defense" },
      advance: { kind: "next" },
      dimBackground: false,
    },
    {
      id: "done",
      title: "You're set",
      body: () =>
        "Defenses are first-class plays — they live in the same list as your offense, and you can install them against any matchup. Use the opponent picker any time you want to test a play against something specific.",
      anchor: { kind: "center" },
      advance: { kind: "next" },
      nextLabel: "Got it",
    },
  ],
};
