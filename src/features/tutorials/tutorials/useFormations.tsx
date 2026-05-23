import type { ReactNode } from "react";
import { CheckSquare, Square } from "lucide-react";
import type { TutorialDef } from "../engine/types";

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

export const USE_FORMATIONS_TUTORIAL: TutorialDef = {
  id: "formations_v1",
  title: "Use formations",
  summary:
    "Drop players into a preset arrangement, or save the current layout as a formation you can reuse across every play in the playbook. ~2 minutes.",
  supportedVariants: ["flag_5v5", "flag_6v6", "flag_7v7", "tackle_11"],
  steps: [
    {
      id: "welcome",
      title: "What formations are",
      body: () =>
        "Formations are reusable player arrangements — once you save one, you can drop it onto any play in the playbook with one tap. No more re-dragging everyone every time.",
      anchor: { kind: "anchor", key: "formation-picker" },
      advance: { kind: "next" },
      dimBackground: false,
    },
    {
      id: "open-picker",
      title: "Open the picker",
      body: () =>
        "Tap the formation name above the field to open the picker. The dropdown shows every formation saved in this playbook.",
      anchor: { kind: "anchor", key: "formation-picker" },
      advance: { kind: "next" },
      dimBackground: false,
      // The picker dropdown only mounts when the coach opens it, so the
      // search input is a reliable signal that the picker is visible.
      gate: {
        kind: "anchor-present",
        key: "formation-picker-search",
        hint: "Tap the formation name to open the picker",
        latched: true,
      },
    },
    {
      id: "apply",
      title: "Search and apply",
      body: ({ actions }) => (
        <>
          <p>
            Search by name, or flip to the grid view to scan thumbnails. Tap
            one to drop those players onto the field — the play&apos;s linked
            to that formation now, so other plays know they share an alignment.
          </p>
          <ul className="mt-2 space-y-1.5">
            <TryRow
              done={actions.has("formation-applied")}
              findKey="formation-picker-search"
            >
              Apply a saved formation to this play
            </TryRow>
          </ul>
          <p className="mt-2 text-[11px] leading-snug text-white/70">
            No saved formations yet? Skip to the next step and save your
            current layout instead.
          </p>
        </>
      ),
      anchor: { kind: "anchor", key: "formation-picker-search" },
      advance: { kind: "next" },
      dimBackground: false,
      // Coaches need to reach the grid/list toggle and the formation rows
      // themselves — let the entire picker remain click-through.
      allowAnchors: ["formation-picker"],
    },
    {
      id: "save-current",
      title: "Save the current layout",
      body: ({ actions }) => (
        <>
          <p>
            Like where your players are sitting? Save the current layout as a
            new formation — it&apos;ll show up in the picker for every other
            play in this playbook.
          </p>
          <ul className="mt-2 space-y-1.5">
            <TryRow
              done={actions.has("formation-saved")}
              findKey="save-as-formation-button"
            >
              Save current layout as a new formation
            </TryRow>
          </ul>
        </>
      ),
      anchor: { kind: "anchor", key: "save-as-formation-button" },
      advance: { kind: "next" },
      dimBackground: false,
    },
    {
      id: "unlink",
      title: "Unlink without losing the layout",
      body: () =>
        "Unlink to break the tie to the saved formation while keeping the player positions on this play. Useful when you want a one-off variant that doesn't drag every other play with it.",
      anchor: { kind: "anchor", key: "unlink-formation-button" },
      advance: { kind: "next" },
      dimBackground: false,
    },
    {
      id: "done",
      title: "You're set",
      body: () =>
        "Formations are a force multiplier — change the layout in one place and every linked play picks it up. Save the ones you reuse, unlink the ones you don't.",
      anchor: { kind: "center" },
      advance: { kind: "next" },
      nextLabel: "Got it",
    },
  ],
};
