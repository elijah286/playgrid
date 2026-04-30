import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { listPlaysAction } from "@/app/actions/plays";
import {
  listPendingRosterClaimsAction,
  listPlaybookRosterAction,
} from "@/app/actions/playbook-roster";
import { listInvitesAction } from "@/app/actions/invites";
import { listFormationsForPlaybookAction } from "@/app/actions/formations";
import { getPlaybookViewPrefsAction } from "@/app/actions/playbook-view-prefs";
import { getCalendarRsvpPendingCountAction } from "@/app/actions/calendar";
import { SPORT_VARIANT_LABELS } from "@/domain/play/factory";
import type { SportVariant } from "@/domain/play/types";
import { normalizePlaybookSettings } from "@/domain/playbook/settings";
import { getCurrentEntitlement } from "@/lib/billing/entitlement";
import { canUseGameMode, tierAtLeast } from "@/lib/billing/features";
import { getFreeMaxPlaysPerPlaybook } from "@/lib/site/free-plays-config";
import {
  getBetaFeatures,
  isBetaFeatureAvailable,
} from "@/lib/site/beta-features-config";
import { getReferralConfig } from "@/lib/site/referral-config";
import { PlaybookDetailClient } from "./ui";
import { CoachCalPlaybookCta } from "@/features/coach-ai/CoachCalPlaybookCta";
import {
  BuildYourOwnPlaybookCta,
  MadeWithBadge,
} from "@/features/marketing/SharedViewerCta";
import { StickyExampleCta } from "@/features/marketing/StickyExampleCta";

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
      "built in XO Gridmaker",
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
    .select("id, name, season, sport_variant, player_count, logo_url, color, custom_offense_count, settings, allow_coach_duplication, allow_player_duplication, allow_game_results_duplication, is_example, is_public_example, example_author_label, is_archived")
    .eq("id", playbookId)
    .single();

  if (error || !book) notFound();

  const [listed, rosterRes, invitesRes, formationsRes, prefsRes, claimsRes] =
    await Promise.all([
      listPlaysAction(playbookId, { includeArchived: true }),
      listPlaybookRosterAction(playbookId),
      listInvitesAction(playbookId),
      listFormationsForPlaybookAction(playbookId),
      getPlaybookViewPrefsAction(playbookId),
      listPendingRosterClaimsAction(playbookId),
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
  const viewerEntitlement = await getCurrentEntitlement();
  const viewerIsCoach = tierAtLeast(viewerEntitlement, "coach");
  const viewerCanUseGameMode = canUseGameMode(viewerEntitlement);

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
  const isHeroMarketingExample = Boolean(
    (book as unknown as { is_hero_marketing_example?: boolean | null })
      .is_hero_marketing_example,
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

  const freeMaxPlays = await getFreeMaxPlaysPerPlaybook();

  const betaFeatures = await getBetaFeatures();
  const showCoachCalCta =
    betaFeatures.coach_ai === "all" &&
    (viewerEntitlement?.tier ?? "free") !== "coach_ai" &&
    user !== null &&
    !isAdmin;
  // Mirror SiteHeader's logic so the in-playbook (mobile) launcher uses the
  // same entitlement gate as the global one — non-entitled users get the
  // marketing popover, entitled users get the chat.
  const coachAiEntitled = isAdmin || (viewerEntitlement?.tier ?? "free") === "coach_ai";
  const coachAiAvailable = isBetaFeatureAvailable(betaFeatures.coach_ai, {
    isAdmin,
    isEntitled: coachAiEntitled,
  });
  const showCoachCalPromoInPlaybook =
    betaFeatures.coach_ai === "all" && !coachAiAvailable && user !== null;
  const referralConfig = await getReferralConfig();
  const isCoachInPlaybook =
    effectiveRole === "owner" || effectiveRole === "editor";
  // Examples always expose Game Mode so visitors can experience the full
  // end-to-end flow. The /game route renders a preview client for example
  // visitors that keeps everything in local state — nothing persists.
  const gameModeAvailable =
    isExamplePreview ||
    isBetaFeatureAvailable(betaFeatures.game_mode, {
      isAdmin,
      isEntitled: isCoachInPlaybook,
    });
  const gameResultsAvailable =
    !isExamplePreview &&
    isBetaFeatureAvailable(betaFeatures.game_results, {
      isAdmin,
      isEntitled: isCoachInPlaybook,
    });
  // Calendar tab is visible to anyone who can view the playbook once the
  // beta is enabled — coaches and players both need access to the schedule.
  const teamCalendarAvailable =
    !isExamplePreview &&
    isBetaFeatureAvailable(betaFeatures.team_calendar, {
      isAdmin,
      isEntitled: true,
    });
  // Version history (trash + history panel) is coach-only.
  const versionHistoryAvailable =
    !isExamplePreview &&
    isBetaFeatureAvailable(betaFeatures.version_history, {
      isAdmin,
      isEntitled: isCoachInPlaybook,
    });
  // Practice Plans tab is coach-only and behind a beta gate. Currently
  // scoped "me" so only site admins see it while the UX is iterated.
  const practicePlansAvailable =
    !isExamplePreview &&
    isBetaFeatureAvailable(betaFeatures.practice_plans, {
      isAdmin,
      isEntitled: isCoachInPlaybook,
    });
  // Wrapped in try/catch because the count expands every event's recurrence
  // rule — a single bad rule (or a transient Supabase blip) shouldn't crash
  // the entire playbook page render.
  const calendarCounts = teamCalendarAvailable
    ? await (async () => {
        try {
          const res = await getCalendarRsvpPendingCountAction(playbookId);
          return res.ok ? { upcomingTotal: res.upcomingTotal } : { upcomingTotal: 0 };
        } catch {
          return { upcomingTotal: 0 };
        }
      })()
    : { upcomingTotal: 0 };

  const publicExampleJsonLd = isPublicExample
    ? [
        {
          "@context": "https://schema.org",
          "@type": "CreativeWork",
          name: book.name as string,
          description: `${
            exampleAuthorLabel ? `Playbook by ${exampleAuthorLabel}. ` : ""
          }Example football playbook built in XO Gridmaker.`,
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
        },
        {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: "/" },
            { "@type": "ListItem", position: 2, name: "Examples", item: "/examples" },
            {
              "@type": "ListItem",
              position: 3,
              name: book.name as string,
              item: `/playbooks/${playbookId}`,
            },
          ],
        },
      ]
    : null;

  return (
    <>
      <CoachCalPlaybookCta show={showCoachCalCta} />
      {publicExampleJsonLd?.map((ld, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
        />
      ))}
      <PlaybookDetailClient
        isArchived={Boolean((book as unknown as { is_archived?: boolean | null }).is_archived)}
        isExamplePreview={isExamplePreview}
        playbookId={playbookId}
        sportVariant={book.sport_variant as string}
        playerCount={(book.player_count as number | null) ?? undefined}
        initialPlays={listed.ok ? listed.plays : []}
        initialGroups={listed.ok ? listed.groups : []}
        truncated={listed.truncated}
        initialRoster={rosterRes.ok ? rosterRes.members : []}
        initialRosterClaims={claimsRes.ok ? claimsRes.claims : []}
        initialInvites={invitesRes.ok ? invitesRes.invites : []}
        initialFormations={formationsRes.ok ? formationsRes.formations : []}
        initialPrefs={prefsRes.ok ? prefsRes.prefs : null}
        isAdmin={isAdmin}
        freeMaxPlays={freeMaxPlays}
        gameModeAvailable={gameModeAvailable}
        gameResultsAvailable={gameResultsAvailable}
        teamCalendarAvailable={teamCalendarAvailable}
        versionHistoryAvailable={versionHistoryAvailable}
        practicePlansAvailable={practicePlansAvailable}
        initialCalendarUpcomingTotal={calendarCounts.upcomingTotal}
        canUseGameMode={viewerCanUseGameMode || isAdmin || isExamplePreview}
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
          allowGameResultsDuplication:
            (book.allow_game_results_duplication as boolean | null) ?? false,
          gameResultsAvailable,
          exampleAdmin: canManageExample
            ? {
                isExample,
                isPublished: isPublicExample,
                isHero: isHeroMarketingExample,
                authorLabel: exampleAuthorLabel,
              }
            : null,
          exampleStatus:
            !isExamplePreview && isExample
              ? { isPublished: isPublicExample }
              : null,
          isExamplePreview,
          coachAiAvailable,
          showCoachCalPromo: showCoachCalPromoInPlaybook,
          referralConfig,
        }}
      />
      {isExamplePreview && (
        <>
          <BuildYourOwnPlaybookCta examplePlaybookId={playbookId} />
          <MadeWithBadge />
          <StickyExampleCta playbookId={playbookId} playbookName={book.name as string} />
        </>
      )}
    </>
  );
}
