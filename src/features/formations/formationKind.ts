import type { SportVariant } from "@/domain/play/types";

/**
 * Which side of the ball a formation is for — the editor's view of it.
 *
 * Deliberately NOT in FormationEditorClient.tsx. That file is "use client", so
 * its exports become client references: a Server Component importing one gets a
 * proxy, and calling it throws "Attempted to call X() from the server but X is
 * on the client" at request time. TypeScript can't see the boundary, so it
 * typechecks clean and fails only when the page is opened. The formation edit
 * page is a Server Component and needs `formationEditorKind` to resolve a
 * stored kind, so this lives in a neutral module both sides can import.
 */
export type FormationEditorKind = "offense" | "defense" | "special_teams";

/** One label per side, so pickers and read-only text can't drift. */
export const KIND_LABEL: Record<FormationEditorKind, string> = {
  offense: "Offense",
  defense: "Defense",
  special_teams: "Special teams",
};

/**
 * A stored `formations.kind` as an editor side.
 *
 * FormationKind is aliased to PlayType, which also carries "practice_plan" —
 * not a thing this editor draws. Callers used to narrow with an inline ternary
 * (`kind === "defense" ? "defense" : "offense"`), which was correct until
 * special teams shipped and then silently collapsed ST formations to offense.
 * TypeScript can't catch that: the narrowed union is a valid subset.
 */
export function formationEditorKind(kind: string | null | undefined): FormationEditorKind {
  return kind === "defense" || kind === "special_teams" ? kind : "offense";
}

/**
 * Special teams is tackle-only — `specialTeamsTemplates` is authored for 11
 * players, and every other surface gates the option the same way. Offering it
 * on a 5v5 playbook would advertise a roster we can't produce.
 */
export function kindOptionsForVariant(
  variant: SportVariant,
): { value: FormationEditorKind; label: string }[] {
  const kinds: FormationEditorKind[] =
    variant === "tackle_11"
      ? ["offense", "defense", "special_teams"]
      : ["offense", "defense"];
  return kinds.map((k) => ({ value: k, label: KIND_LABEL[k] }));
}
