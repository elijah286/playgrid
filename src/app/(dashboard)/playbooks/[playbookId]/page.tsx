import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { listPlaysAction } from "@/app/actions/plays";
import { listPlaybookRosterAction } from "@/app/actions/playbook-roster";
import { listInvitesAction } from "@/app/actions/invites";
import { SPORT_VARIANT_LABELS } from "@/domain/play/factory";
import type { SportVariant } from "@/domain/play/types";
import { PlaybookDetailClient } from "./ui";
import { PlaybookHeader } from "./PlaybookHeader";

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
    .select("id, name, season, sport_variant, player_count, logo_url, color")
    .eq("id", playbookId)
    .single();

  if (error || !book) notFound();

  const listed = await listPlaysAction(playbookId, { includeArchived: true });
  const rosterRes = await listPlaybookRosterAction(playbookId);
  const invitesRes = await listInvitesAction(playbookId);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const variantLabel =
    SPORT_VARIANT_LABELS[book.sport_variant as SportVariant] ?? book.sport_variant ?? "";
  const accentColor = (book.color as string | null) || "#134e2a";
  const logoUrl = (book.logo_url as string | null) ?? null;

  const canManage = !!user;

  let senderName: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();
    senderName =
      (profile?.display_name as string | null) || user.email || null;
  }

  const pageHeader = (
    <PlaybookHeader
      playbookId={playbookId}
      name={book.name as string}
      season={(book.season as string | null) ?? null}
      variantLabel={variantLabel}
      logoUrl={logoUrl}
      accentColor={accentColor}
      canManage={canManage}
      senderName={senderName}
    />
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
