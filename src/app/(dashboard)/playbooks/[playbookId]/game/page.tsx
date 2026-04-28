import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import {
  getBetaFeatures,
  isBetaFeatureAvailable,
} from "@/lib/site/beta-features-config";
import { getCurrentEntitlement } from "@/lib/billing/entitlement";
import { canUseGameMode } from "@/lib/billing/features";
import { listPlaysAction } from "@/app/actions/plays";
import type { PlayDocument } from "@/domain/play/types";
import { GameModeClient } from "@/features/game-mode/GameModeClient";
import { GameModePreviewClient } from "@/features/game-mode/GameModePreviewClient";
import type {
  LiveGameCall,
  LiveGameSession,
  LiveParticipant,
  LiveScoreEvent,
} from "@/features/game-mode/live-session-types";
import type { GameModePlay } from "@/features/game-mode/types";
import type { PlaybookDetailPlayRow } from "@/app/actions/plays";

type Props = {
  params: Promise<{ playbookId: string }>;
  searchParams: Promise<{ play?: string }>;
};

export default async function GameModePage({ params, searchParams }: Props) {
  const { playbookId } = await params;
  const { play: initialPlayParam } = await searchParams;

  if (!hasSupabaseEnv()) redirect(`/playbooks/${playbookId}`);

  const supabase = await createClient();

  // Inspect playbook first so example visitors can enter preview Game Mode
  // without auth. Examples are intended to showcase the full end-to-end
  // flow; the preview client keeps everything in local state so nothing
  // gets persisted against the public example row.
  const { data: book } = await supabase
    .from("playbooks")
    .select("id, name, sport_variant, color, is_example, is_public_example")
    .eq("id", playbookId)
    .maybeSingle();
  if (!book) redirect(`/playbooks/${playbookId}`);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isExample = Boolean(book.is_example || book.is_public_example);
  let isMember = false;
  if (user) {
    const { data: membership } = await supabase
      .from("playbook_members")
      .select("role")
      .eq("playbook_id", playbookId)
      .eq("user_id", user.id)
      .maybeSingle();
    isMember = membership?.role != null;
  }
  const isExamplePreview = isExample && !isMember;

  if (isExamplePreview) {
    // Only published examples are exposed to non-members.
    if (!book.is_public_example) redirect(`/playbooks/${playbookId}`);

    // listPlaysAction already handles anon visitors for public examples
    // via RLS, so the same loader works here.
    const listedPreview = await listPlaysAction(playbookId);
    const previewOffense = (listedPreview.ok ? listedPreview.plays : []).filter(
      (p) => p.play_type === "offense" && !p.is_archived,
    );
    const svc = createServiceRoleClient();
    const playsWithDocs = await loadPlayDocuments(svc, previewOffense);

    return (
      <GameModePreviewClient
        playbookId={playbookId}
        plays={playsWithDocs}
        playbookName={(book.name as string | null) ?? "Home"}
        sportVariant={(book.sport_variant as string | null) ?? "flag_7v7"}
        accentColor={(book.color as string | null) || "#134e2a"}
      />
    );
  }

  // Authed, full Game Mode path.
  if (!user) redirect(`/playbooks/${playbookId}`);

  const [{ data: profile }, betaFeatures, listed] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    getBetaFeatures(),
    listPlaysAction(playbookId),
  ]);

  const isCoachInPlaybook = isMember; // owner or editor role already implies member
  const isAdmin = (profile?.role as string | null) === "admin";

  const allowed = isBetaFeatureAvailable(betaFeatures.game_mode, {
    isAdmin,
    isEntitled: isCoachInPlaybook,
  });
  if (!allowed) redirect(`/playbooks/${playbookId}`);

  // Tier gate: Game Mode is a Team Coach feature. Admins bypass so they can
  // QA without a paid seat. Non-entitled users hitting the URL directly land
  // on /pricing with an upgrade hint instead of silently back on the playbook.
  const entitlement = await getCurrentEntitlement();
  if (!isAdmin && !canUseGameMode(entitlement)) {
    redirect("/pricing?upgrade=game-mode");
  }

  // Offense only for now — defense and special-teams game flows look
  // different and aren't covered by this beta.
  const offensePlays = (listed.ok ? listed.plays : []).filter(
    (p) => p.play_type === "offense" && !p.is_archived,
  );
  const playsWithDocs = await loadPlayDocuments(supabase, offensePlays);

  const initialPlayId =
    initialPlayParam && offensePlays.some((p) => p.id === initialPlayParam)
      ? initialPlayParam
      : null;

  // Load any already-active session for this playbook so the client can
  // render the shared state immediately (no "starting…" flash) and skip
  // the intro for coaches who are joining mid-game.
  const { data: sessionRow } = await supabase
    .from("game_sessions")
    .select(
      "id, playbook_id, status, caller_user_id, current_play_id, next_play_id, started_at, kind, opponent",
    )
    .eq("playbook_id", playbookId)
    .eq("status", "active")
    .maybeSingle();

  let initialSession: LiveGameSession | null = null;
  let initialCalls: LiveGameCall[] = [];
  let initialParticipants: LiveParticipant[] = [];
  let initialScoreEvents: LiveScoreEvent[] = [];
  if (sessionRow) {
    initialSession = {
      id: sessionRow.id as string,
      playbookId: sessionRow.playbook_id as string,
      status: sessionRow.status as "active" | "ended",
      callerUserId: (sessionRow.caller_user_id as string | null) ?? null,
      currentPlayId: (sessionRow.current_play_id as string | null) ?? null,
      nextPlayId: (sessionRow.next_play_id as string | null) ?? null,
      startedAt: sessionRow.started_at as string,
      kind: ((sessionRow.kind as string | null) === "scrimmage"
        ? "scrimmage"
        : "game") as "game" | "scrimmage",
      opponent: (sessionRow.opponent as string | null) ?? null,
    };
    const [{ data: callRows }, { data: partRows }] = await Promise.all([
      supabase
        .from("game_plays")
        .select("id, play_id, position, called_at, thumb, tag")
        .eq("session_id", initialSession.id)
        .order("position", { ascending: true }),
      supabase
        .from("game_session_participants")
        .select("user_id, last_seen_at")
        .eq("session_id", initialSession.id),
    ]);
    initialCalls = (callRows ?? []).map((r) => ({
      id: r.id as string,
      playId: r.play_id as string,
      position: r.position as number,
      calledAt: r.called_at as string,
      thumb: (r.thumb as "up" | "down" | null) ?? null,
      tag: (r.tag as string | null) ?? null,
    }));
    const partIds = Array.from(
      new Set((partRows ?? []).map((p) => p.user_id as string)),
    );
    const nameByUser = new Map<string, string | null>();
    if (partIds.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", partIds);
      for (const p of profs ?? []) {
        nameByUser.set(p.id as string, (p.display_name as string | null) ?? null);
      }
    }
    initialParticipants = (partRows ?? []).map((p) => ({
      userId: p.user_id as string,
      displayName: nameByUser.get(p.user_id as string) ?? null,
      lastSeenAt: p.last_seen_at as string,
    }));

    const { data: scoreRows } = await supabase
      .from("game_score_events")
      .select("id, side, delta, play_id, created_at")
      .eq("session_id", initialSession.id)
      .order("created_at", { ascending: true });
    initialScoreEvents = (scoreRows ?? []).map((r) => ({
      id: r.id as string,
      side: (r.side as "us" | "them") ?? "us",
      delta: r.delta as number,
      playId: (r.play_id as string | null) ?? null,
      createdAt: r.created_at as string,
    }));
  }

  const { data: myProfile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <GameModeClient
      playbookId={playbookId}
      plays={playsWithDocs}
      initialPlayId={initialPlayId}
      currentUserId={user.id}
      currentUserName={(myProfile?.display_name as string | null) ?? null}
      initialSession={initialSession}
      initialCalls={initialCalls}
      initialParticipants={initialParticipants}
      initialScoreEvents={initialScoreEvents}
      playbookName={(book.name as string | null) ?? "Home"}
      sportVariant={(book.sport_variant as string | null) ?? "flag_7v7"}
      accentColor={(book.color as string | null) || "#134e2a"}
    />
  );
}

type PgResult = { data: unknown[] | null };

/** Fetch full PlayDocuments for the given play rows — needed for the
 *  on-field animation pipeline. Works with either an authed server
 *  client or the service-role client. We only touch the `.from().select()
 *  .in()` surface, so accept anything that exposes it. */
async function loadPlayDocuments(
  client: unknown,
  offensePlays: PlaybookDetailPlayRow[],
): Promise<GameModePlay[]> {
  const c = client as {
    from: (t: string) => {
      select: (cols: string) => { in: (col: string, vals: string[]) => Promise<PgResult> };
    };
  };
  const entries = offensePlays.map((p) => ({
    row: p,
    doc: null as PlayDocument | null,
  }));
  if (offensePlays.length === 0) return entries.map((e) => ({ ...e.row, document: e.doc }));

  const playIds = offensePlays.map((p) => p.id);
  const { data: docRows } = await c
    .from("plays")
    .select("id, current_version_id")
    .in("id", playIds);
  const versionByPlay = new Map<string, string>();
  for (const r of (docRows as Array<Record<string, unknown>> | null) ?? []) {
    const vid = r.current_version_id as string | null;
    if (vid) versionByPlay.set(r.id as string, vid);
  }
  const versionIds = Array.from(new Set(versionByPlay.values()));
  if (versionIds.length > 0) {
    const { data: versions } = await c
      .from("play_versions")
      .select("id, document")
      .in("id", versionIds);
    const docByVersion = new Map<string, PlayDocument>();
    for (const v of (versions as Array<Record<string, unknown>> | null) ?? []) {
      const d = v.document as PlayDocument | null;
      if (d) docByVersion.set(v.id as string, d);
    }
    for (const entry of entries) {
      const vid = versionByPlay.get(entry.row.id);
      entry.doc = vid ? docByVersion.get(vid) ?? null : null;
    }
  }
  return entries.map((e) => ({ ...e.row, document: e.doc }));
}
