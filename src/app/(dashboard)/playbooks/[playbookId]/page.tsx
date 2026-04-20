import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { listPlaysAction } from "@/app/actions/plays";
import { SPORT_VARIANT_LABELS } from "@/domain/play/factory";
import type { SportVariant } from "@/domain/play/types";
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
    .select("id, name, sport_variant, player_count, logo_url, color")
    .eq("id", playbookId)
    .single();

  if (error || !book) notFound();

  const listed = await listPlaysAction(playbookId, { includeArchived: true });

  const variantLabel =
    SPORT_VARIANT_LABELS[book.sport_variant as SportVariant] ?? book.sport_variant ?? "";
  const accentColor = (book.color as string | null) || "#134e2a";
  const logoUrl = (book.logo_url as string | null) ?? null;
  const initial = (book.name as string).trim().charAt(0).toUpperCase();

  const pageHeader = (
    <div className="space-y-4">
      {/* Back link */}
      <Link
        href="/home"
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-4" />
        Home
      </Link>

      {/* Playbook identity: logo avatar + name + game type */}
      <div className="flex items-center gap-4">
        <div
          className="relative size-14 shrink-0 overflow-hidden rounded-2xl flex items-center justify-center text-white text-xl font-extrabold shadow-sm"
          style={{ backgroundColor: accentColor }}
        >
          {logoUrl ? (
            <Image src={logoUrl} alt="" fill className="object-cover" sizes="56px" />
          ) : (
            <span>{initial}</span>
          )}
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground leading-tight truncate">
            {book.name}
          </h1>
          {variantLabel && <p className="mt-0.5 text-sm text-muted">{variantLabel}</p>}
        </div>
      </div>
    </div>
  );

  return (
    <PlaybookDetailClient
      playbookId={playbookId}
      sportVariant={book.sport_variant as string}
      playerCount={(book.player_count as number | null) ?? undefined}
      initialPlays={listed.ok ? listed.plays : []}
      initialGroups={listed.ok ? listed.groups : []}
      pageHeader={pageHeader}
    />
  );
}
