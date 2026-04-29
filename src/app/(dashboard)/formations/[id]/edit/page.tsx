import { notFound } from "next/navigation";
import {
  listFormationsAction,
  listFormationsForPlaybookAction,
} from "@/app/actions/formations";
import { FormationEditorClient } from "@/features/formations/FormationEditorClient";
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
      returnToPlaybook={returnToPlaybook}
      navFormations={navFormations}
    />
  );
}
