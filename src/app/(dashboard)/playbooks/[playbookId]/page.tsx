import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { listPlaysAction } from "@/app/actions/plays";
import { listPlaybookRosterAction } from "@/app/actions/playbook-roster";
import { listInvitesAction } from "@/app/actions/invites";
import { listFormationsForPlaybookAction } from "@/app/actions/formations";
import { SPORT_VARIANT_LABELS } from "@/domain/play/factory";
import type { SportVariant } from "@/domain/play/types";
import { normalizePlaybookSettings } from "@/domain/playbook/settings";
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
    .select("id, name, season, sport_variant, player_count, logo_url, color, custom_offense_count, settings")
    .eq("id", playbookId)
    .single();

  if (error || !book) notFound();

  const [listed, rosterRes, invitesRes, formationsRes] = await Promise.all([
    listPlaysAction(playbookId, { includeArchived: true }),
    listPlaybookRosterAction(playbookId),
    listInvitesAction(playbookId),
    listFormationsForPlaybookAction(playbookId),
  ]);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const sportVariant = (book.sport_variant as SportVariant) ?? "flag_7v7";
  const variantLabel = SPORT_VARIANT_LABELS[sportVariant] ?? (book.sport_variant as string) ?? "";
  const playbookSettings = normalizePlaybookSettings(
    book.settings,
    sportVariant,
    (book.custom_offense_count as number | null) ?? null,
  );
  const accentColor = (book.color as string | null) || "#134e2a";
  const logoUrl = (book.logo_url as string | null) ?? null;

  let senderName: string | null = null;
  let viewerRole: "owner" | "editor" | "viewer" | null = null;
  let ownerDisplayName: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();
    senderName =
      (profile?.display_name as string | null) || user.email || null;

    const { data: membership } = await supabase
      .from("playbook_members")
      .select("role")
      .eq("playbook_id", playbookId)
      .eq("user_id", user.id)
      .maybeSingle();
    viewerRole = (membership?.role as typeof viewerRole) ?? null;

    if (viewerRole && viewerRole !== "owner") {
      const { data: ownerRow } = await supabase
        .from("playbook_members")
        .select("user_id")
        .eq("playbook_id", playbookId)
        .eq("role", "owner")
        .limit(1)
        .maybeSingle();
      const ownerId = (ownerRow?.user_id as string | null) ?? null;
      if (ownerId) {
        const { data: ownerProfile } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("id", ownerId)
          .maybeSingle();
        ownerDisplayName = (ownerProfile?.display_name as string | null) || null;
      }
    }
  }

  // Only owners can invite/customize. Editors and viewers see a read-style
  // header without the management controls.
  const canManage = viewerRole === "owner";

  return (
    <PlaybookDetailClient
      playbookId={playbookId}
      sportVariant={book.sport_variant as string}
      playerCount={(book.player_count as number | null) ?? undefined}
      initialPlays={listed.ok ? listed.plays : []}
      initialGroups={listed.ok ? listed.groups : []}
      truncated={listed.truncated}
      initialRoster={rosterRes.ok ? rosterRes.members : []}
      initialInvites={invitesRes.ok ? invitesRes.invites : []}
      initialFormations={formationsRes.ok ? formationsRes.formations : []}
      headerProps={{
        name: book.name as string,
        season: (book.season as string | null) ?? null,
        variantLabel,
        settings: playbookSettings,
        logoUrl,
        accentColor,
        canManage,
        senderName,
        ownerDisplayName,
      }}
    />
  );
}
