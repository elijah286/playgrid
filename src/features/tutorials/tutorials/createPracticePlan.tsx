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

export const CREATE_PRACTICE_PLAN_TUTORIAL: TutorialDef = {
  id: "practice_plan_v1",
  title: "Create a practice plan",
  summary:
    "Lay out a practice timeline with blocks, parallel activities, and notes — then save and print for your staff. ~3 minutes.",
  supportedVariants: ["flag_5v5", "flag_6v6", "flag_7v7", "tackle_11"],
  steps: [
    {
      id: "welcome",
      title: "Sketch out practice",
      body: () =>
        "A practice plan is a timeline of blocks. Each block has a start time, a duration, and one or more parallel activities (lanes). This tour walks the whole loop — add a block, set time, split into lanes, save and print.",
      anchor: { kind: "center" },
      advance: { kind: "next" },
    },
    {
      id: "title-plan",
      title: "Name the plan",
      body: () =>
        "Rename the plan up top — something like \"Tuesday — Routes day\" or \"Pre-game walkthrough\". The name is what shows up in the playbook's Practice Plans tab.",
      anchor: { kind: "anchor", key: "plan-title" },
      advance: { kind: "next" },
      dimBackground: false,
    },
    {
      id: "add-block",
      title: "Add your first block",
      body: ({ actions }) => (
        <>
          <p>
            Blocks are the building units of a practice — warmups, individual
            drills, install, scrimmage. Add one to get started.
          </p>
          <ul className="mt-2 space-y-1.5">
            <TryRow
              done={actions.has("plan-block-added")}
              findKey="plan-add-block"
            >
              Add a block to the timeline
            </TryRow>
          </ul>
        </>
      ),
      anchor: { kind: "anchor", key: "plan-add-block" },
      advance: { kind: "next" },
      dimBackground: false,
      gate: {
        kind: "anchor-present",
        key: "plan-block-editor",
        hint: "Add a block to continue",
        latched: true,
      },
    },
    {
      id: "set-time",
      title: "Set the start and duration",
      body: () =>
        "Pick when the block starts (minutes from 0:00) and how long it lasts. The next block you add will start where this one ends — the timeline is contiguous by default.",
      anchor: { kind: "anchor", key: "plan-block-editor" },
      advance: { kind: "next" },
      dimBackground: false,
    },
    {
      id: "add-lane",
      title: "Split into parallel activities",
      body: ({ actions }) => (
        <>
          <p>
            Need to run two groups at once — say Skill vs Line, or QBs vs WRs?
            Add a parallel activity (lane) to the same block. Each lane gets its
            own title and coaching notes.
          </p>
          <ul className="mt-2 space-y-1.5">
            <TryRow
              done={actions.has("plan-lane-added")}
              findKey="plan-add-lane"
            >
              Add a parallel activity to this block
            </TryRow>
          </ul>
          <p className="mt-2 text-[11px] leading-snug text-white/70">
            Up to 3 lanes per block — enough for Skill / Line / Specialists
            splits without crowding the page.
          </p>
        </>
      ),
      anchor: { kind: "anchor", key: "plan-add-lane" },
      advance: { kind: "next" },
      dimBackground: false,
    },
    {
      id: "save-and-print",
      title: "Save, then print for staff",
      body: () =>
        "Save persists the plan in your playbook. Print opens a printable view that other coaches can pull up on their phone or hand out as a one-pager. The plan stays in the Practice Plans tab so you can come back and tweak it.",
      anchor: { kind: "anchor-bbox", keys: ["plan-save-button", "plan-print-button"] },
      advance: { kind: "next" },
      dimBackground: false,
    },
    {
      id: "done",
      title: "You're set",
      body: () =>
        "Stack blocks, split into lanes, save and share. Practice plans live in the Practice Plans tab inside the playbook — open one any time to edit or duplicate it.",
      anchor: { kind: "center" },
      advance: { kind: "next" },
      nextLabel: "Got it",
    },
  ],
};
