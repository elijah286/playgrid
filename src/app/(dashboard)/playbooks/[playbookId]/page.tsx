import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
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
        <p className="text-sm text-muted">Configure Supabase to load this playbook.</p>
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

  const plays = await listPlaysAction(playbookId, { includeArchived: true });

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/playbooks"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
          Playbooks
        </Link>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-foreground">{book.name}</h1>
      </div>
      <PlaybookDetailClient playbookId={playbookId} initialPlays={plays.ok ? plays.plays : []} />
    </div>
  );
}
