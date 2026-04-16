import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlayForEditorAction } from "@/app/actions/plays";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { PlayEditorClient } from "@/features/editor/PlayEditorClient";

type Props = { params: Promise<{ playId: string }> };

export default async function PlayEditPage({ params }: Props) {
  const { playId } = await params;

  if (!hasSupabaseEnv()) {
    return (
      <div className="rounded-xl bg-white p-6 ring-1 ring-slate-200">
        <p className="text-sm text-slate-600">Configure Supabase to edit plays.</p>
        <Link href="/playbooks" className="mt-4 inline-block text-sm text-indigo-600">
          Back to playbooks
        </Link>
      </div>
    );
  }

  const res = await getPlayForEditorAction(playId);
  if (!res.ok) notFound();

  return (
    <PlayEditorClient
      playId={res.play.id}
      playbookId={res.play.playbook_id}
      initialDocument={res.document}
    />
  );
}
