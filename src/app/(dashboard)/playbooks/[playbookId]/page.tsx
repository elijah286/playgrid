import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { listPlaysAction } from "@/app/actions/plays";
import { listPlaybookRosterAction } from "@/app/actions/playbook-roster";
import { listInvitesAction } from "@/app/actions/invites";
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
  const rosterRes = await listPlaybookRosterAction(playbookId);
  const invitesRes = await listInvitesAction(playbookId);

  const variantLabel =
    SPORT_VARIANT_LABELS[book.sport_variant as SportVariant] ?? book.sport_variant ?? "";
  const accentColor = (book.color as string | null) || "#134e2a";
  const logoUrl = (book.logo_url as string | null) ?? null;
  const initial = (book.name as string).trim().charAt(0).toUpperCase();

  const pageHeader = (
    <div
      className="relative -mx-6 -mt-3 overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}d9 55%, ${accentColor}99 100%)`,
      }}
    >
      <div className="relative mx-auto flex max-w-7xl items-center gap-4 px-6 py-4">
        <Link
          href="/home"
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Back to home"
        >
          <ArrowLeft className="size-4" />
          Home
        </Link>
        <div className="h-6 w-px bg-white/25" />
        <div
          className="relative size-11 shrink-0 overflow-hidden rounded-xl bg-white/20 ring-1 ring-white/30 flex items-center justify-center text-white text-lg font-extrabold"
        >
          {logoUrl ? (
            <Image src={logoUrl} alt="" fill className="object-cover" sizes="44px" />
          ) : (
            <span>{initial}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-extrabold tracking-tight text-white sm:text-2xl">
            {book.name}
          </h1>
          {variantLabel && (
            <p className="truncate text-xs font-medium text-white/80 sm:text-sm">{variantLabel}</p>
          )}
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
      initialRoster={rosterRes.ok ? rosterRes.members : []}
      initialInvites={invitesRes.ok ? invitesRes.invites : []}
      pageHeader={pageHeader}
    />
  );
}
