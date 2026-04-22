import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { listPlaysAction } from "@/app/actions/plays";
import { listPlaybookRosterAction } from "@/app/actions/playbook-roster";
import { listInvitesAction } from "@/app/actions/invites";
import { listFormationsForPlaybookAction } from "@/app/actions/formations";
import { getPlaybookViewPrefsAction } from "@/app/actions/playbook-view-prefs";
import { SPORT_VARIANT_LABELS } from "@/domain/play/factory";
import type { SportVariant } from "@/domain/play/types";
import { normalizePlaybookSettings } from "@/domain/playbook/settings";
import { getCurrentEntitlement } from "@/lib/billing/entitlement";
import { tierAtLeast } from "@/lib/billing/features";
import { ExamplePreviewBanner } from "@/features/admin/ExamplePreviewBanner";
import { PlaybookDetailClient } from "./ui";

type Props = { params: Promise<{ playbookId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { playbookId } = await params;
  const noIndex: Metadata = { robots: { index: false, follow: false } };

  if (!hasSupabaseEnv()) return noIndex;
  try {
    const svc = createServiceRoleClient();
    const { data: book } = await svc
      .from("playbooks")
      .select(
        "name, season, sport_variant, is_public_example, example_author_label, plays(count)",
      )
      .eq("id", playbookId)
      .eq("is_archived", false)
      .maybeSingle();

    if (!book || !book.is_public_example) return noIndex;

    const name = (book.name as string) || "Example playbook";
    const season = (book.season as string | null) || null;
    const author = (book.example_author_label as string | null) || null;
    const playsAgg = Array.isArray(book.plays) ? book.plays[0] : book.plays;
    const playCount = (playsAgg as { count?: number } | null)?.count ?? 0;

    const titleParts = [name, season].filter(Boolean).join(" · ");
    const descParts = [
      author ? `Playbook by ${author}` : null,
      playCount > 0 ? `${playCount} plays` : null,
      "built in xogridmaker",
    ].filter(Boolean);
    const description = `${descParts.join(" · ")}. Explore formations, plays, and wristband cards.`;
    const canonical = `/playbooks/${playbookId}`;

    return {
      title: `${titleParts} — example playbook`,
      description,
      alternates: { canonical },
      openGraph: {
        title: `${titleParts} — example playbook`,
        description,
        url: canonical,
        type: "article",
      },
      twitter: {
        card: "summary_large_image",
        title: `${titleParts} — example playbook`,
        description,
      },
    };
  } catch {
    return noIndex;
  }
}

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
    .select("id, name, season, sport_variant, player_count, logo_url, color, custom_offense_count, settings, allow_coach_duplication, allow_player_duplication, is_example, is_public_example, example_author_label")
    .eq("id", playbookId)
    .single();

  if (error || !book) notFound();

  const [listed, rosterRes, invitesRes, formationsRes, prefsRes] = await Promise.all([
    listPlaysAction(playbookId, { includeArchived: true }),
    listPlaybookRosterAction(playbookId),
    listInvitesAction(playbookId),
    listFormationsForPlaybookAction(playbookId),
    getPlaybookViewPrefsAction(playbookId),
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

  type ViewerRole = "owner" | "editor" | "viewer" | null;
  let senderName: string | null = null;
  let viewerRole: ViewerRole = null;
  let isMember = false;
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
    isMember = viewerRole != null;

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

  // Non-members viewing a published example get a synthesized viewer
  // role so the read-only UI paths activate. All mutation attempts are
  // intercepted client-side (see isExamplePreview) and surface a CTA
  // instead of hitting the server.
  if (!viewerRole && book.is_public_example) {
    viewerRole = "viewer" as ViewerRole;
  }
  const effectiveRole: ViewerRole = viewerRole;
  const isExamplePreview =
    Boolean(book.is_example || book.is_public_example) && !isMember;

  // Owners can customize everything. Editors (coaches) can share the
  // playbook with teammates but can't rename/recolor/delete. Viewers get a
  // read-only header.
  const canManage = effectiveRole === "owner";
  const canShare = effectiveRole === "owner" || effectiveRole === "editor";
  const viewerIsCoach = tierAtLeast(await getCurrentEntitlement(), "coach");

  // Site admins get two extra action menu items: "Use as Example"
  // (toggle is_example) and "Publish / Unpublish" (toggle
  // is_public_example, only while is_example is true). Both live in
  // the playbook action menu; the banner above just conveys state.
  const isExample = Boolean(
    (book as unknown as { is_example?: boolean | null }).is_example,
  );
  const isPublicExample = Boolean(
    (book as unknown as { is_public_example?: boolean | null })
      .is_public_example,
  );
  const exampleAuthorLabel =
    ((book as unknown as { example_author_label?: string | null })
      .example_author_label as string | null) ?? null;

  let isAdmin = false;
  if (user) {
    const { data: selfRoleRow } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    isAdmin = (selfRoleRow?.role as string | null) === "admin";
  }
  const canManageExample = isAdmin && (effectiveRole === "owner" || effectiveRole === "editor");

  const publicExampleJsonLd = isPublicExample
    ? {
        "@context": "https://schema.org",
        "@type": "CreativeWork",
        name: book.name as string,
        description: `${
          exampleAuthorLabel ? `Playbook by ${exampleAuthorLabel}. ` : ""
        }Example football playbook built in xogridmaker.`,
        inLanguage: "en",
        genre: "Football playbook",
        isAccessibleForFree: true,
        url: `${
          process.env.NEXT_PUBLIC_SITE_URL || "https://www.xogridmaker.com"
        }/playbooks/${playbookId}`,
        ...(exampleAuthorLabel
          ? { creator: { "@type": "Person", name: exampleAuthorLabel } }
          : {}),
        ...(book.season ? { dateCreated: book.season as string } : {}),
      }
    : null;

  return (
    <>
      {publicExampleJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(publicExampleJsonLd) }}
        />
      )}
      {isExamplePreview && <ExamplePreviewBanner />}
      <PlaybookDetailClient
        isExamplePreview={isExamplePreview}
        playbookId={playbookId}
        sportVariant={book.sport_variant as string}
        playerCount={(book.player_count as number | null) ?? undefined}
        initialPlays={listed.ok ? listed.plays : []}
        initialGroups={listed.ok ? listed.groups : []}
        truncated={listed.truncated}
        initialRoster={rosterRes.ok ? rosterRes.members : []}
        initialInvites={invitesRes.ok ? invitesRes.invites : []}
        initialFormations={formationsRes.ok ? formationsRes.formations : []}
        initialPrefs={prefsRes.ok ? prefsRes.prefs : null}
        headerProps={{
          name: book.name as string,
          season: (book.season as string | null) ?? null,
          variantLabel,
          settings: playbookSettings,
          logoUrl,
          accentColor,
          canManage,
          canShare,
          viewerIsCoach,
          senderName,
          ownerDisplayName,
          allowCoachDuplication: (book.allow_coach_duplication as boolean | null) ?? true,
          allowPlayerDuplication: (book.allow_player_duplication as boolean | null) ?? true,
          exampleAdmin: canManageExample
            ? {
                isExample,
                isPublished: isPublicExample,
                authorLabel: exampleAuthorLabel,
              }
            : null,
          exampleStatus:
            !isExamplePreview && isExample
              ? { isPublished: isPublicExample }
              : null,
        }}
      />
    </>
  );
}
