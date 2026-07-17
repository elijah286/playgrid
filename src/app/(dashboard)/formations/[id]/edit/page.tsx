import { notFound } from "next/navigation";
import {
  listFormationsAction,
  listFormationsForPlaybookAction,
} from "@/app/actions/formations";
import { FormationEditorClient } from "@/features/formations/FormationEditorClient";
import { formationEditorKind } from "@/features/formations/formationKind";
import type { SportVariant } from "@/domain/play/types";

export const metadata = { title: "Edit Formation — XO Gridmaker" };

export default async function EditFormationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnToPlaybook?: string }>;
}) {
  const { id } = await params;
  const { returnToPlaybook = null } = await searchParams;
  const result = await listFormationsAction();
  if (!result.ok) notFound();

  const formation = result.formations.find((f) => f.id === id);
  if (!formation) notFound();

  const variant = (formation.sportProfile?.variant ?? "flag_7v7") as SportVariant;

  // Sibling formations (same playbook, same variant, not archived) power the
  // prev/next/all dropdown in the editor header.
  const siblings = formation.playbookId
    ? await listFormationsForPlaybookAction(formation.playbookId)
    : null;
  const navFormations =
    siblings && siblings.ok
      ? siblings.formations.filter((f) => !f.isArchived)
      : [];

  return (
    <FormationEditorClient
      mode="edit"
      formationId={formation.id}
      initialName={formation.displayName}
      initialVariant={variant}
      initialPlayers={formation.players}
      // Total mapping, not a ternary. This read `kind === "defense" ?
      // "defense" : "offense"` — correct while those were the only two sides,
      // then silently wrong once special teams shipped: it collapsed an ST
      // formation to offense, so the locked Type stated "Offense", the
      // inspector offered QB/RB/WR (a punter's "P" isn't in that list), and
      // Add player dropped a grey circle into a blue-square unit — while the
      // DB row stayed special_teams, so the card's ST badge and the editor
      // disagreed permanently. TypeScript couldn't catch it: the narrowed
      // union is a valid subset of the wider one.
      kind={formationEditorKind(formation.kind)}
      returnToPlaybook={returnToPlaybook}
      navFormations={navFormations}
    />
  );
}
