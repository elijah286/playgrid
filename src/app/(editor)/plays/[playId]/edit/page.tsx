import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlayForEditorAction, listPlaybookPlaysForNavigationAction } from "@/app/actions/plays";
import { getPlaybookSettingsAction } from "@/app/actions/playbooks";
import { listFormationsAction, listFormationsForPlaybookAction } from "@/app/actions/formations";
import { defaultSettingsForVariant } from "@/domain/playbook/settings";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { getMobileEditingEnabled } from "@/lib/site/mobile-editing-config";
import { getCoachAiEvalDays } from "@/lib/site/coach-ai-eval-config";
import { getCurrentEntitlement, hasUsedCoachProTrial } from "@/lib/billing/entitlement";
import { canUseAiFeatures, canUseGameMode } from "@/lib/billing/features";
import { getCoachCalFreePromptState } from "@/lib/billing/coach-cal-free-prompts";
import {
  getBetaFeatures,
  isBetaFeatureAvailable,
} from "@/lib/site/beta-features-config";
import { getFreeMaxPlaysPerPlaybook } from "@/lib/site/free-plays-config";
import { PlayEditorClient } from "@/features/editor/PlayEditorClient";
import {
  BuildYourOwnPlaybookCta,
  MadeWithBadge,
} from "@/features/marketing/SharedViewerCta";
import { StickyExampleCta } from "@/features/marketing/StickyExampleCta";
import { PlaybookAnchorPublisher } from "@/features/coach-ai/PlaybookAnchorPublisher";
import { PlayAnchorPublisher } from "@/features/coach-ai/PlayAnchorPublisher";
import { CoachCalPlaybookCta } from "@/features/coach-ai/CoachCalPlaybookCta";
import type { SavedFormation } from "@/app/actions/formations";

type Props = { params: Promise<{ playId: string }> };

export default async function PlayEditPage({ params }: Props) {
  const { playId } = await params;

  if (!hasSupabaseEnv()) {
    return (
      <div className="rounded-xl bg-white p-6 ring-1 ring-slate-200">
        <p className="text-sm text-slate-600">Configure Supabase to edit plays.</p>
        <Link href="/home" className="mt-4 inline-block text-sm text-indigo-600">
          Back to playbooks
        </Link>
      </div>
    );
  }

  const res = await getPlayForEditorAction(playId);
  if (!res.ok) notFound();

  // Fire every independent query for the editor in a single batch so the
  // page renders after one network round-trip instead of waterfalling
  // through 7+ sequential awaits (auth → membership → book → owner → owner
  // profile → beta → entitlement → …). The follow-up batch below covers
  // queries that need the user id or owner row from this batch.
  const supabase = await createClient();
  const [
    nav,
    formationsRes,
    allFormationsRes,
    settingsRes,
    userResp,
    bookResp,
    ownerRowResp,
    mobileEditingEnabled,
    betaFeatures,
    editorEntitlement,
    coachAiEvalDays,
    freeMaxPlays,
  ] = await Promise.all([
    listPlaybookPlaysForNavigationAction(res.play.playbook_id),
    listFormationsForPlaybookAction(res.play.playbook_id),
    // Fallback list — used only to resolve the play's currently-linked or
    // opponent formation when it isn't in the playbook-scoped list (e.g.
    // defense/special-teams formations, or one the coach removed later).
    listFormationsAction(),
    getPlaybookSettingsAction(res.play.playbook_id),
    supabase.auth.getUser(),
    // Example preview: a signed-in visitor who isn't a member of this
    // example playbook gets the full editor (can draw, drag, undo, etc.)
    // but autosave is suppressed and any save attempt surfaces the CTA.
    supabase
      .from("playbooks")
      .select(
        "is_example, is_public_example, is_archived, name, color, logo_url, season, sport_variant",
      )
      .eq("id", res.play.playbook_id)
      .maybeSingle(),
    // Owner row for the banner subtitle — mirrors the playbook page's
    // "Spring 2026 · Flag · OWNER" line. We fetch the display name in the
    // dependent batch below.
    supabase
      .from("playbook_members")
      .select("user_id")
      .eq("playbook_id", res.play.playbook_id)
      .eq("role", "owner")
      .limit(1)
      .maybeSingle(),
    getMobileEditingEnabled(),
    getBetaFeatures(),
    getCurrentEntitlement(),
    getCoachAiEvalDays(),
    // Global free-tier cap for the in-editor create surface's cap-upgrade
    // copy (cached; effectively free). Owner-specific overrides aren't worth
    // an extra round-trip on every editor load for this edge-case modal.
    getFreeMaxPlaysPerPlaybook(),
  ]);

  const user = userResp.data.user;
  const book = bookResp.data;
  const ownerRow = ownerRowResp.data;

  const playbookSettings = settingsRes.ok
    ? settingsRes.settings
    : defaultSettingsForVariant("flag_7v7");

  const allFormationsForLookup = allFormationsRes.ok ? allFormationsRes.formations : [];

  // If the document has a linked formation, find it from the global list so
  // it still resolves even when excluded from this playbook.
  let linkedFormation: SavedFormation | null = null;
  const formationId = res.document.metadata.formationId;
  if (formationId) {
    linkedFormation = allFormationsForLookup.find((f) => f.id === formationId) ?? null;
  }

  let opponentFormation: SavedFormation | null = null;
  const opponentFormationId = res.document.metadata.opponentFormationId;
  if (opponentFormationId) {
    opponentFormation =
      allFormationsForLookup.find((f) => f.id === opponentFormationId) ?? null;
  }

  // Picker options: formations scoped to this playbook (variant match, not
  // excluded). OpponentOverlayCard does its own cross-variant filtering so
  // we feed it the full list.
  const allFormations = formationsRes.ok ? formationsRes.formations : [];

  // Second batch — three queries that need user.id / ownerRow.user_id from
  // the first batch. Still parallelized so we pay one network round-trip
  // for all three rather than chaining them.
  const ownerId = (ownerRow?.user_id as string | null) ?? null;
  const [membershipResp, selfRoleResp, ownerProfileResp] = await Promise.all([
    user
      ? supabase
          .from("playbook_members")
          .select("role")
          .eq("playbook_id", res.play.playbook_id)
          .eq("user_id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null as { role: string } | null }),
    user
      ? supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
      : Promise.resolve({ data: null as { role: string } | null }),
    ownerId
      ? supabase
          .from("profiles")
          .select("display_name")
          .eq("id", ownerId)
          .maybeSingle()
      : Promise.resolve({ data: null as { display_name: string } | null }),
  ]);

  // Viewers (read-only members) see the play + playback + opponent overlay
  // but no editing surfaces. Owners/editors get the full editor. If the
  // user somehow isn't a member at all we fall back to read-only — the
  // server actions already enforce writes via RLS.
  let canEdit = false;
  let isMember = false;
  {
    const role = (membershipResp.data?.role as
      | "owner"
      | "editor"
      | "viewer"
      | undefined) ?? undefined;
    isMember = role != null;
    canEdit = role === "owner" || role === "editor";
  }

  const ownerDisplayName =
    (ownerProfileResp.data?.display_name as string | null) || null;

  const isExamplePreview =
    !isMember && Boolean(book?.is_public_example || book?.is_example);
  if (isExamplePreview) canEdit = true;
  const isArchived = Boolean(book?.is_archived);
  const isPlayArchived = Boolean((res.play as { is_archived?: boolean | null }).is_archived);

  const isAdmin = (selfRoleResp.data?.role as string | null) === "admin";
  const isCoachInPlaybook = canEdit && !isExamplePreview;
  const gameModeAvailable = isCoachInPlaybook;
  // Drive the editor bottom nav's "More" sheet — same per-playbook
  // beta-feature flags the playbook page uses to decide which tabs to
  // show. We expose only the flags relevant to navigation; the editor
  // doesn't render those tabs itself, just links back to the playbook.
  const teamCalendarAvailable = isBetaFeatureAvailable(
    betaFeatures.team_calendar,
    { isAdmin, isEntitled: true },
  );
  const teamMessagingAvailable = isBetaFeatureAvailable(
    betaFeatures.team_messaging,
    { isAdmin, isEntitled: true },
  );
  const gameResultsAvailable = isBetaFeatureAvailable(
    betaFeatures.game_results,
    { isAdmin, isEntitled: isCoachInPlaybook },
  );
  const practicePlansAvailable = isCoachInPlaybook;
  const viewerCanUseGameMode = isAdmin || canUseGameMode(editorEntitlement);
  const coachAiEntitled = isAdmin || canUseAiFeatures(editorEntitlement);
  // Photo import method card in the create surface — same gate as the
  // playbook page (photo_play_import beta; admin-only while at "me").
  const photoImportAvailable =
    !isExamplePreview &&
    isCoachInPlaybook &&
    isBetaFeatureAvailable(betaFeatures.photo_play_import, {
      isAdmin,
      isEntitled: coachAiEntitled,
    });
  // Free users with trial prompts left get the real launcher, not the promo
  // (mirrors SiteHeader / the playbook page).
  const freeCalState =
    !coachAiEntitled && user !== null
      ? await getCoachCalFreePromptState(user.id)
      : null;
  const hasFreeCalPrompts = freeCalState?.hasRemaining ?? false;
  // Remaining free prompts for the empty-editor Cal nudge — null for entitled
  // coaches (unlimited; the nudge's "free prompts" pitch doesn't apply to them).
  const coachCalFreePromptsRemaining = coachAiEntitled
    ? null
    : freeCalState?.remaining ?? 0;
  const coachAiAvailable = coachAiEntitled || hasFreeCalPrompts;
  const showCoachCalCta = !coachAiAvailable && user !== null && !isAdmin;
  // Cal launcher promo: only logged-in users without entitlement (and out of
  // free prompts) see the upgrade preview. Anonymous example viewers don't see
  // Cal at all.
  const showCoachCalPromo = user !== null && !coachAiAvailable;
  // Trial-eligibility for the floating CTA copy. Only matters for free
  // users showing the CTA; paid `coach` users already get upgrade copy
  // and entitled users don't see the CTA at all.
  const coachProTrialUsed =
    showCoachCalCta && (editorEntitlement?.tier ?? "free") === "free" && user
      ? await hasUsedCoachProTrial(user.id)
      : false;

  return (
    <>
      <PlaybookAnchorPublisher
        playbookId={res.play.playbook_id}
        playbookName={(book?.name as string | null) ?? null}
        playbookColor={(book?.color as string | null) ?? null}
      />
      <PlayAnchorPublisher
        playId={res.play.id}
        playName={(res.play.name as string | null) ?? null}
      />
      <CoachCalPlaybookCta
        show={showCoachCalCta}
        evalDays={coachAiEvalDays}
        userTier={editorEntitlement?.tier ?? "free"}
        coachProTrialUsed={coachProTrialUsed}
      />
      <PlayEditorClient
      playId={res.play.id}
      playbookId={res.play.playbook_id}
      // The version this session starts from. getPlayForEditorAction has always
      // returned it and this page has always dropped it on the floor — so every
      // save was a blind full-document overwrite of whatever the server head
      // happened to be by then. Forwarding it lets a local draft record its
      // base, which is what makes honest conflict detection possible later
      // (mine==base → take theirs; theirs==base → just upload; both moved → ask).
      baseVersionId={(res.version?.id as string | null | undefined) ?? null}
      playbookName={(book?.name as string | null) ?? null}
      playbookColor={(book?.color as string | null) ?? null}
      playbookLogoUrl={(book?.logo_url as string | null) ?? null}
      playbookSeason={(book?.season as string | null) ?? null}
      playbookVariant={(book?.sport_variant as string | null) ?? null}
      playbookOwnerName={ownerDisplayName}
      initialDocument={res.document}
      initialNav={nav.ok ? nav.plays : []}
      initialGroups={nav.ok ? nav.groups : []}
      linkedFormation={linkedFormation}
      opponentFormation={opponentFormation}
      allFormations={allFormations}
      opponentFormations={allFormationsForLookup}
      playbookSettings={playbookSettings}
      canEdit={canEdit}
      isExamplePreview={isExamplePreview}
      isArchived={isArchived}
      isPlayArchived={isPlayArchived}
      mobileEditingEnabled={mobileEditingEnabled}
      gameModeAvailable={gameModeAvailable}
      canUseGameMode={viewerCanUseGameMode}
      coachAiAvailable={coachAiAvailable}
      showCoachCalPromo={showCoachCalPromo}
      coachCalFreePromptsRemaining={coachCalFreePromptsRemaining}
      freeMaxPlays={freeMaxPlays}
      photoImportAvailable={photoImportAvailable}
      teamCalendarAvailable={teamCalendarAvailable}
      teamMessagingAvailable={teamMessagingAvailable}
      gameResultsAvailable={gameResultsAvailable}
      practicePlansAvailable={practicePlansAvailable}
      initialCustomOpponentPlayId={res.customOpponentPlayId}
      initialOpponentHidden={res.opponentHidden}
      isAdmin={isAdmin}
      isTutorialPlay={Boolean(res.play.is_tutorial)}
    />
    {isExamplePreview && (
      <>
        <BuildYourOwnPlaybookCta examplePlaybookId={res.play.playbook_id} />
        <MadeWithBadge />
        <StickyExampleCta
          playbookId={res.play.playbook_id}
          playbookName={(book?.name as string | null) ?? "this example"}
        />
      </>
    )}
    </>
  );
}
