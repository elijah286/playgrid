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
        <p className="text-sm text-pg-muted">Configure Supabase to load this playbook.</p>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: book, error } = await supabase
    .from("playbooks")
    .select("id, name, teams ( name )")
    .eq("id", playbookId)
    .single();

  if (error || !book) notFound();

  const plays = await listPlaysAction(playbookId);

  return (
    <div className="space-y-8">
      <div>
        <Link href="/playbooks" className="text-sm text-pg-subtle hover:text-pg-ink">
          ← Playbooks
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-pg-ink">{book.name}</h1>
        {(() => {
          const t = book.teams as { name: string } | { name: string }[] | null | undefined;
          const teamName = Array.isArray(t) ? t[0]?.name : t?.name;
          return teamName ? <p className="mt-1 text-sm text-pg-muted">{teamName}</p> : null;
        })()}
      </div>
      <PlaybookDetailClient playbookId={playbookId} initialPlays={plays.ok ? plays.plays : []} />
    </div>
  );
}
