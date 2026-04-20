import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlayForEditorAction, listPlaybookPlaysForNavigationAction } from "@/app/actions/plays";
import { listFormationsAction } from "@/app/actions/formations";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { PlayEditorClient } from "@/features/editor/PlayEditorClient";
import type { SavedFormation } from "@/app/actions/formations";

type Props = { params: Promise<{ playId: string }> };

export default async function PlayEditPage({ params }: Props) {
  const { playId } = await params;

  if (!hasSupabaseEnv()) {
    return (
      <div className="rounded-xl bg-white p-6 ring-1 ring-slate-200">
        <p className="text-sm text-slate-600">Configure Supabase to edit plays.</p>
        <Link href="/home" className="mt-4 inline-block text-sm text-indigo-600">
          Back to playbooks
        </Link>
      </div>
    );
  }

  const res = await getPlayForEditorAction(playId);
  if (!res.ok) notFound();

  const [nav, formationsRes] = await Promise.all([
    listPlaybookPlaysForNavigationAction(res.play.playbook_id),
    listFormationsAction(),
  ]);

  // If the document has a linked formation, find it from the loaded formations list
  let linkedFormation: SavedFormation | null = null;
  const formationId = res.document.metadata.formationId;
  if (formationId && formationsRes.ok) {
    linkedFormation = formationsRes.formations.find((f) => f.id === formationId) ?? null;
  }

  let opponentFormation: SavedFormation | null = null;
  const opponentFormationId = res.document.metadata.opponentFormationId;
  if (opponentFormationId && formationsRes.ok) {
    opponentFormation =
      formationsRes.formations.find((f) => f.id === opponentFormationId) ?? null;
  }

  const allFormations = formationsRes.ok ? formationsRes.formations : [];

  return (
    <PlayEditorClient
      playId={res.play.id}
      playbookId={res.play.playbook_id}
      initialDocument={res.document}
      initialNav={nav.ok ? nav.plays : []}
      initialGroups={nav.ok ? nav.groups : []}
      linkedFormation={linkedFormation}
      opponentFormation={opponentFormation}
      allFormations={allFormations}
    />
  );
}
