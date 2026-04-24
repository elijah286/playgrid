import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlayForEditorAction, listPlaybookPlaysForNavigationAction } from "@/app/actions/plays";
import { getPlaybookSettingsAction } from "@/app/actions/playbooks";
import { listFormationsAction, listFormationsForPlaybookAction } from "@/app/actions/formations";
import { defaultSettingsForVariant } from "@/domain/playbook/settings";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { getMobileEditingEnabled } from "@/lib/site/mobile-editing-config";
import {
  getBetaFeatures,
  isBetaFeatureAvailable,
} from "@/lib/site/beta-features-config";
import { PlayEditorClient } from "@/features/editor/PlayEditorClient";
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

  const [nav, formationsRes, allFormationsRes, settingsRes] = await Promise.all([
    listPlaybookPlaysForNavigationAction(res.play.playbook_id),
    listFormationsForPlaybookAction(res.play.playbook_id),
    // Fallback list — used only to resolve the play's currently-linked or
    // opponent formation when it isn't in the playbook-scoped list (e.g.
    // defense/special-teams formations, or one the coach removed later).
    listFormationsAction(),
    getPlaybookSettingsAction(res.play.playbook_id),
  ]);
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

  // Viewers (read-only members) see the play + playback + opponent overlay
  // but no editing surfaces. Owners/editors get the full editor. If the
  // user somehow isn't a member at all we fall back to read-only — the
  // server actions already enforce writes via RLS.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let canEdit = false;
  let isMember = false;
  if (user) {
    const { data: membership } = await supabase
      .from("playbook_members")
      .select("role")
      .eq("playbook_id", res.play.playbook_id)
      .eq("user_id", user.id)
      .maybeSingle();
    const role = membership?.role as "owner" | "editor" | "viewer" | undefined;
    isMember = role != null;
    canEdit = role === "owner" || role === "editor";
  }

  // Example preview: a signed-in visitor who isn't a member of this
  // example playbook gets the full editor (can draw, drag, undo, etc.)
  // but autosave is suppressed and any save attempt surfaces the CTA.
  const { data: book } = await supabase
    .from("playbooks")
    .select("is_example, is_public_example, is_archived")
    .eq("id", res.play.playbook_id)
    .maybeSingle();
  const isExamplePreview =
    !isMember && Boolean(book?.is_public_example || book?.is_example);
  if (isExamplePreview) canEdit = true;
  const isArchived = Boolean(book?.is_archived);

  const mobileEditingEnabled = await getMobileEditingEnabled();

  const betaFeatures = await getBetaFeatures();
  let isAdmin = false;
  if (user) {
    const { data: selfRoleRow } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    isAdmin = (selfRoleRow?.role as string | null) === "admin";
  }
  const isCoachInPlaybook = canEdit && !isExamplePreview;
  const gameModeAvailable = isBetaFeatureAvailable(betaFeatures.game_mode, {
    isAdmin,
    isEntitled: isCoachInPlaybook,
  });

  return (
    <PlayEditorClient
      playId={res.play.id}
      playbookId={res.play.playbook_id}
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
      mobileEditingEnabled={mobileEditingEnabled}
      gameModeAvailable={gameModeAvailable}
    />
  );
}
