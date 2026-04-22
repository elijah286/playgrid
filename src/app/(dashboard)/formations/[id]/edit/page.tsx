import { notFound } from "next/navigation";
import { listFormationsAction } from "@/app/actions/formations";
import { FormationEditorClient } from "@/features/formations/FormationEditorClient";
import type { SportVariant } from "@/domain/play/types";

export const metadata = { title: "Edit Formation — xogridmaker" };

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
  if (formation.isSystem) {
    // System formations are read-only — redirect to list
    notFound();
  }

  const variant = (formation.sportProfile?.variant ?? "flag_7v7") as SportVariant;

  return (
    <FormationEditorClient
      mode="edit"
      formationId={formation.id}
      initialName={formation.displayName}
      initialVariant={variant}
      initialPlayers={formation.players}
      returnToPlaybook={returnToPlaybook}
    />
  );
}
