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
    .select("id, name, sport_variant, player_count, season")
    .eq("id", playbookId)
    .single();

  if (error || !book) notFound();

  const listed = await listPlaysAction(playbookId, { includeArchived: true });

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/home"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
          Home
        </Link>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-foreground">{book.name}</h1>
        {book.season ? (
          <p className="mt-0.5 text-sm text-muted">{book.season as string}</p>
        ) : null}
      </div>
      <PlaybookDetailClient
        playbookId={playbookId}
        sportVariant={book.sport_variant as string}
        playerCount={(book.player_count as number | null) ?? undefined}
        initialPlays={listed.ok ? listed.plays : []}
        initialGroups={listed.ok ? listed.groups : []}
      />
    </div>
  );
}
