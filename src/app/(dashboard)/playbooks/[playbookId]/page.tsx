import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { listPlaysAction } from "@/app/actions/plays";
import { PlaybookDetailClient } from "./ui";

type Props = { params: Promise<{ playbookId: string }> };

export default async function PlaybookDetailPage({ params }: Props) {
  const { playbookId } = await params;

  if (!hasSupabaseEnv()) {
    return (
      <div>
        <p className="text-sm text-slate-600">Configure Supabase to load this playbook.</p>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: book, error } = await supabase
    .from("playbooks")
    .select("id, name")
    .eq("id", playbookId)
    .single();

  if (error || !book) notFound();

  const plays = await listPlaysAction(playbookId);

  return (
    <div className="space-y-8">
      <div>
        <Link href="/playbooks" className="text-sm text-slate-500 hover:text-slate-800">
          ← Playbooks
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">{book.name}</h1>
      </div>
      <PlaybookDetailClient playbookId={playbookId} initialPlays={plays.ok ? plays.plays : []} />
    </div>
  );
}
