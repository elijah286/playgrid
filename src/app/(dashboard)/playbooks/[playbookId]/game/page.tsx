import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import {
  getBetaFeatures,
  isBetaFeatureAvailable,
} from "@/lib/site/beta-features-config";
import { listPlaysAction } from "@/app/actions/plays";
import type { PlayDocument } from "@/domain/play/types";
import { GameModeClient } from "@/features/game-mode/GameModeClient";

type Props = { params: Promise<{ playbookId: string }> };

export default async function GameModePage({ params }: Props) {
  const { playbookId } = await params;

  if (!hasSupabaseEnv()) redirect(`/playbooks/${playbookId}`);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/playbooks/${playbookId}`);

  const [{ data: membership }, { data: profile }, betaFeatures, listed] =
    await Promise.all([
      supabase
        .from("playbook_members")
        .select("role")
        .eq("playbook_id", playbookId)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
      getBetaFeatures(),
      listPlaysAction(playbookId),
    ]);

  const role = (membership?.role as string | null) ?? null;
  const isCoachInPlaybook = role === "owner" || role === "editor";
  const isAdmin = (profile?.role as string | null) === "admin";

  const allowed = isBetaFeatureAvailable(betaFeatures.game_mode, {
    isAdmin,
    isEntitled: isCoachInPlaybook,
  });
  if (!allowed) redirect(`/playbooks/${playbookId}`);

  // Offense only for now — defense and special-teams game flows look
  // different and aren't covered by this beta.
  const offensePlays = (listed.ok ? listed.plays : []).filter(
    (p) => p.play_type === "offense" && !p.is_archived,
  );

  // Fetch full PlayDocuments for the offense plays so the on-field view
  // can run playback (motion + snap). The plays-list rows only carry a
  // trimmed `preview` slice that's enough for the picker thumbnails but
  // missing sportProfile etc. needed by the animation pipeline.
  const playRows = offensePlays.map((p) => ({ row: p, doc: null as PlayDocument | null }));
  if (offensePlays.length > 0) {
    const playIds = offensePlays.map((p) => p.id);
    const { data: docRows } = await supabase
      .from("plays")
      .select("id, current_version_id")
      .in("id", playIds);
    const versionByPlay = new Map<string, string>();
    for (const r of docRows ?? []) {
      const vid = r.current_version_id as string | null;
      if (vid) versionByPlay.set(r.id as string, vid);
    }
    const versionIds = Array.from(new Set(versionByPlay.values()));
    if (versionIds.length > 0) {
      const { data: versions } = await supabase
        .from("play_versions")
        .select("id, document")
        .in("id", versionIds);
      const docByVersion = new Map<string, PlayDocument>();
      for (const v of versions ?? []) {
        const d = v.document as PlayDocument | null;
        if (d) docByVersion.set(v.id as string, d);
      }
      for (const entry of playRows) {
        const vid = versionByPlay.get(entry.row.id);
        entry.doc = vid ? docByVersion.get(vid) ?? null : null;
      }
    }
  }

  return (
    <GameModeClient
      playbookId={playbookId}
      plays={playRows.map((e) => ({ ...e.row, document: e.doc }))}
    />
  );
}
