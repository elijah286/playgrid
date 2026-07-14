import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { getUserWithTimeout } from "@/lib/supabase/get-user-with-timeout";
import { listPlaysAction } from "@/app/actions/plays";
import {
  listPendingRosterClaimsAction,
  listPlaybookRosterAction,
} from "@/app/actions/playbook-roster";
import { listInvitesAction } from "@/app/actions/invites";
import { listFormationsForPlaybookAction } from "@/app/actions/formations";
import {
  getPlaybookUnreadCountAction,
  listPlaybookMessagesAction,
} from "@/app/actions/playbook-messages";
import type { PlaybookMessageRow } from "@/domain/messages/types";
import { getPlaybookViewPrefsAction } from "@/app/actions/playbook-view-prefs";
import { getCalendarRsvpPendingCountAction } from "@/app/actions/calendar";
import { SPORT_VARIANT_LABELS } from "@/domain/play/factory";
import type { SportVariant } from "@/domain/play/types";
import { normalizePlaybookSettings } from "@/domain/playbook/settings";
import { getCurrentEntitlement, hasUsedCoachProTrial } from "@/lib/billing/entitlement";
import { canUseAiFeatures, canUseGameMode, tierAtLeast } from "@/lib/billing/features";
import { getCoachCalFreePromptState } from "@/lib/billing/coach-cal-free-prompts";
import { getFreePlayCapForOwner } from "@/lib/site/free-plays-config";
import { getPlaybookOwnerId } from "@/lib/billing/owner-entitlement";
import {
  getBetaFeatures,
  isBetaFeatureAvailable,
} from "@/lib/site/beta-features-config";
import { getReferralPromo } from "@/lib/data/referral-summary";
import { withFullContext } from "@/lib/seo/ld-json";
import { getCoachAiEvalDays } from "@/lib/site/coach-ai-eval-config";
import { defaultClaimedPlaybookName } from "@/lib/playbook/default-name";
import { timed } from "@/lib/perf/timed";
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
      .is("plays.deleted_at", null)
      .eq("plays.is_archived", false)
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
  const { data: book, error } = await timed(
    `playbook-page:books-select pb=${playbookId}`,
    () =>
      supabase
        .from("playbooks")
        .select("id, name, season, sport_variant, player_count, logo_url, color, custom_offense_count, settings, allow_coach_duplication, allow_player_duplication, allow_game_results_duplication, player_invite_policy, roster_approval_required, is_example, is_public_example, example_author_label, is_archived")
        .eq("id", playbookId)
        .single(),
  );

  if (error || !book) notFound();

  // Auth doesn't depend on the playbook fan-out below, so kick it off
  // concurrently instead of awaiting the fan-out first. Time-bound it
  // (see getUserWithTimeout) so a stalled token refresh on a flaky/offline
  // connection can't trap the page — on timeout we render anonymous and
  // the next navigation retries auth.
  const authPromise = timed(`playbook-page:auth-getUser pb=${playbookId}`, () =>
    getUserWithTimeout(supabase),
  );

  const [listed, rosterRes, invitesRes, formationsRes, prefsRes, claimsRes] =
    await timed(`playbook-page:promise-all pb=${playbookId}`, () =>
      Promise.all([
        timed(`playbook-page:listPlays pb=${playbookId}`, () =>
          listPlaysAction(playbookId, { includeArchived: true }),
        ),
        timed(`playbook-page:listRoster pb=${playbookId}`, () =>
          listPlaybookRosterAction(playbookId),
        ),
        timed(`playbook-page:listInvites pb=${playbookId}`, () =>
          listInvitesAction(playbookId),
        ),
        timed(`playbook-page:listFormations pb=${playbookId}`, () =>
          listFormationsForPlaybookAction(playbookId),
        ),
        timed(`playbook-page:getViewPrefs pb=${playbookId}`, () =>
          getPlaybookViewPrefsAction(playbookId),
        ),
        timed(`playbook-page:listClaims pb=${playbookId}`, () =>
          listPendingRosterClaimsAction(playbookId),
        ),
      ]),
    );

  const authResult = await authPromise;
  const user = authResult.kind === "ok" ? authResult.user : null;

  // Fetch the viewer's profile (display_name + role + avatar_url) and their
  // membership row ONCE, in parallel. role drives the admin check;
  // display_name/avatar feed the header + messaging. Previously this same
  // profile row was read three separate times (viewer-block, isAdmin,
  // messaging) — three extra cross-region round-trips on the critical path.
  type ViewerProfileRow = {
    display_name: string | null;
    role: string | null;
    avatar_url: string | null;
  };
  let viewerProfile: ViewerProfileRow | null = null;
  let viewerMembershipRole: "owner" | "editor" | "viewer" | null = null;
  if (user) {
    const [profileRes, membershipRes] = await timed(
      `playbook-page:viewer-profile+membership pb=${playbookId}`,
      () =>
        Promise.all([
          supabase
            .from("profiles")
            .select("display_name, role, avatar_url")
            .eq("id", user.id)
            .maybeSingle(),
          supabase
            .from("playbook_members")
            .select("role")
            .eq("playbook_id", playbookId)
            .eq("user_id", user.id)
            .maybeSingle(),
        ]),
    );
    viewerProfile = (profileRes.data as ViewerProfileRow | null) ?? null;
    viewerMembershipRole =
      (membershipRes.data?.role as "owner" | "editor" | "viewer" | null) ??
      null;
  }

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
  let viewerDisplayName: string | null = null;
  let viewerRole: ViewerRole = null;
  let isMember = false;
  let ownerDisplayName: string | null = null;
  if (user) {
    viewerDisplayName = viewerProfile?.display_name ?? null;
    senderName = viewerDisplayName || user.email || null;
    viewerRole = viewerMembershipRole;
    isMember = viewerRole != null;

    // Only a non-owner member needs the owner's display name for the
    // header, and it genuinely depends on the membership result, so this
    // lookup stays sequential — but it no longer runs for owners (the
    // common case) or anonymous viewers.
    if (viewerRole && viewerRole !== "owner") {
      const { data: ownerRow } = await timed(
        `playbook-page:owner-lookup pb=${playbookId}`,
        () =>
          supabase
            .from("playbook_members")
            .select("user_id")
            .eq("playbook_id", playbookId)
            .eq("role", "owner")
            .limit(1)
            .maybeSingle(),
      );
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
  // Owner-controlled: whether viewers (players) can invite other players.
  // Stored on playbooks.player_invite_policy. Default 'disabled' so
  // existing playbooks behave as they did before this column was added.
  const playerInvitePolicy =
    ((book.player_invite_policy as string | null) ?? "disabled") as
      | "disabled"
      | "approval"
      | "open";
  // Owner-controlled: whether joiners must be approved before they're
  // confirmed on the roster. Default false (auto-confirmed). Enforced in
  // accept_invite; surfaced as a toggle in the Roster tab.
  const rosterApprovalRequired = Boolean(
    (book as unknown as { roster_approval_required?: boolean | null })
      .roster_approval_required,
  );
  // Players can hit Share when the owner has opted in. The dialog will
  // run in `viewerOnly` mode for them — straight to a player invite,
  // no "Send a copy" / "Co-coach" cards.
  const canInvitePlayers =
    canShare ||
    (effectiveRole === "viewer" && playerInvitePolicy !== "disabled");
  const inviteAsViewerOnly = !canShare && canInvitePlayers;
  const viewerEntitlement = await timed(
    `playbook-page:getEntitlement pb=${playbookId}`,
    () => getCurrentEntitlement(),
  );
  const viewerIsCoach = tierAtLeast(viewerEntitlement, "coach");
  const viewerCanUseGameMode = canUseGameMode(viewerEntitlement);
  const viewerCanUseTeamFeatures = tierAtLeast(viewerEntitlement, "coach");

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

  // Derived from the single profile read above — no extra round-trip.
  const isAdmin = (viewerProfile?.role as string | null) === "admin";
  const canManageExample = isAdmin && (effectiveRole === "owner" || effectiveRole === "editor");

  const freeMaxPlays = await timed(
    `playbook-page:freeMaxPlays pb=${playbookId}`,
    async () => {
      const ownerId = await getPlaybookOwnerId(playbookId);
      return getFreePlayCapForOwner(ownerId);
    },
  );

  const betaFeatures = await timed(
    `playbook-page:betaFeatures pb=${playbookId}`,
    () => getBetaFeatures(),
  );
  // Mirror SiteHeader's logic so the in-playbook (mobile) launcher uses the
  // same entitlement gate as the global one — non-entitled users get the
  // marketing popover, entitled users get the chat.
  const coachAiEntitled = isAdmin || canUseAiFeatures(viewerEntitlement);
  // Free users with trial prompts left get the real launcher, not the promo
  // (see SiteHeader for the canonical version of this gate).
  const freeCalState =
    !coachAiEntitled && user !== null
      ? await getCoachCalFreePromptState(user.id)
      : null;
  const hasFreeCalPrompts = freeCalState?.hasRemaining ?? false;
  // Remaining free Cal prompts for the new-play sheet's Cal door; null when
  // entitled (unlimited — the "N free" pitch doesn't apply).
  const coachCalFreePromptsRemaining = coachAiEntitled
    ? null
    : freeCalState?.remaining ?? 0;
  const coachAiAvailable = coachAiEntitled || hasFreeCalPrompts;
  const showCoachCalCta =
    !coachAiAvailable && user !== null && !isAdmin;
  const showCoachCalPromoInPlaybook = !coachAiAvailable && user !== null;
  const referralPromo = await timed(
    `playbook-page:referralPromo pb=${playbookId}`,
    () => getReferralPromo(user?.id ?? null),
  );
  const coachAiEvalDays = await timed(
    `playbook-page:coachAiEvalDays pb=${playbookId}`,
    () => getCoachAiEvalDays(),
  );
  const isCoachInPlaybook =
    effectiveRole === "owner" || effectiveRole === "editor";
  // New two-door "Start a new play" sheet, behind the beta gate. "me" = admins
  // preview in prod; widen to "all" from the Beta features panel when verified.
  const newPlaySheet = isBetaFeatureAvailable(betaFeatures.new_play_sheet, {
    isAdmin,
    isEntitled: isCoachInPlaybook,
  });
  // Game Mode: example previewers and any coach in the playbook can use it.
  // The /game route renders a preview client for example visitors that keeps
  // everything in local state — nothing persists.
  const gameModeAvailable = isExamplePreview || isCoachInPlaybook;
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
  // Photo play import (photo_play_import beta): coach-only toolbar entry.
  // The import page and its API routes re-run the authoritative gate
  // server-side — this flag only controls whether the button renders.
  // ("custom" allowlist scope isn't evaluated here; allowlisted
  // non-admins reach the flow via the direct URL until this computes it.)
  const photoImportAvailable =
    !isExamplePreview &&
    isCoachInPlaybook &&
    isBetaFeatureAvailable(betaFeatures.photo_play_import, {
      isAdmin,
      isEntitled: coachAiEntitled,
    });
  // Practice Plans tab is coach-only.
  const practicePlansAvailable = !isExamplePreview && isCoachInPlaybook;
  // Team messaging is available to anyone who can view the playbook once
  // the beta is enabled. Example-preview viewers (non-members of an
  // example playbook) see a CTA instead of the chat — `messagingExamplePreview`
  // tells the UI to render the upsell instead of the live chat.
  const teamMessagingAvailable = isBetaFeatureAvailable(
    betaFeatures.team_messaging,
    { isAdmin, isEntitled: true },
  );
  const messagingExamplePreview = teamMessagingAvailable && isExamplePreview;
  // Pre-fetch the viewer profile + first page of messages on the server so
  // the tab renders without a loading flash. Skipped for example previews
  // (CTA replaces the chat) and for unauth/unavailable cases.
  let messagingViewer: {
    id: string;
    displayName: string | null;
    avatarUrl: string | null;
  } | null = null;
  let initialMessages: {
    messages: PlaybookMessageRow[];
    hasMore: boolean;
    messagingEnabled: boolean;
  } | null = null;
  let initialMessagesUnread = 0;
  if (teamMessagingAvailable && user && !isExamplePreview) {
    messagingViewer = {
      id: user.id,
      displayName: viewerProfile?.display_name ?? null,
      avatarUrl: viewerProfile?.avatar_url ?? null,
    };
    const [messagesRes, unreadRes] = await Promise.all([
      listPlaybookMessagesAction(playbookId),
      getPlaybookUnreadCountAction(playbookId),
    ]);
    if (messagesRes.ok) {
      initialMessages = {
        messages: messagesRes.messages,
        hasMore: messagesRes.hasMore,
        messagingEnabled: messagesRes.messagingEnabled,
      };
    } else {
      // Fall back to an empty stream so the tab still renders. The hook
      // will retry on mount and surface any error there.
      initialMessages = { messages: [], hasMore: false, messagingEnabled: true };
    }
    if (unreadRes.ok) initialMessagesUnread = unreadRes.unread;
  }
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
      <CoachCalPlaybookCta
        show={showCoachCalCta}
        evalDays={coachAiEvalDays}
        userTier={viewerEntitlement?.tier ?? "free"}
        coachProTrialUsed={
          showCoachCalCta &&
          (viewerEntitlement?.tier ?? "free") === "free" &&
          user
            ? await hasUsedCoachProTrial(user.id)
            : false
        }
      />
      {publicExampleJsonLd?.map((ld, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(withFullContext(ld)) }}
        />
      ))}
      <PlaybookDetailClient
        isArchived={Boolean((book as unknown as { is_archived?: boolean | null }).is_archived)}
        isExamplePreview={isExamplePreview}
        playbookId={playbookId}
        viewerUserId={user?.id ?? null}
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
        photoImportAvailable={photoImportAvailable}
        newPlaySheet={newPlaySheet}
        coachCalFreePromptsRemaining={coachCalFreePromptsRemaining}
        gameResultsAvailable={gameResultsAvailable}
        teamCalendarAvailable={teamCalendarAvailable}
        versionHistoryAvailable={versionHistoryAvailable}
        practicePlansAvailable={practicePlansAvailable}
        teamMessagingAvailable={teamMessagingAvailable}
        messagingExamplePreview={messagingExamplePreview}
        messagingExampleClaimableId={
          messagingExamplePreview && isPublicExample ? playbookId : null
        }
        messagingViewer={messagingViewer}
        messagingViewerRole={effectiveRole}
        initialMessages={initialMessages}
        initialMessagesUnread={initialMessagesUnread}
        initialCalendarUpcomingTotal={calendarCounts.upcomingTotal}
        canUseGameMode={viewerCanUseGameMode || isAdmin || isExamplePreview}
        canUseTeamFeatures={
          viewerCanUseTeamFeatures || isAdmin || isExamplePreview
        }
        headerProps={{
          name: book.name as string,
          season: (book.season as string | null) ?? null,
          variant: sportVariant,
          variantLabel,
          settings: playbookSettings,
          logoUrl,
          accentColor,
          canManage,
          canShare,
          canInvitePlayers,
          inviteAsViewerOnly,
          playerInvitePolicy,
          rosterApprovalRequired,
          viewerIsCoach,
          senderName,
          ownerDisplayName,
          allowCoachDuplication: (book.allow_coach_duplication as boolean | null) ?? true,
          allowPlayerDuplication: (book.allow_player_duplication as boolean | null) ?? true,
          allowGameResultsDuplication:
            (book.allow_game_results_duplication as boolean | null) ?? false,
          gameResultsAvailable,
          suggestedDuplicateName: defaultClaimedPlaybookName(
            viewerDisplayName,
            sportVariant,
          ),
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
          coachAiEvalDays,
          referralPromo,
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
