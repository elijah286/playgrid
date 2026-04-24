import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import {
  getBetaFeatures,
  isBetaFeatureAvailable,
} from "@/lib/site/beta-features-config";
import { GameDetailClient, type GameDetailData } from "./ui";

type Props = {
  params: Promise<{ playbookId: string; sessionId: string }>;
};

export const metadata = { robots: { index: false, follow: false } };

export default async function GameDetailPage({ params }: Props) {
  const { playbookId, sessionId } = await params;

  if (!hasSupabaseEnv()) notFound();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=/playbooks/${playbookId}/games/${sessionId}`);

  const [{ data: membership }, { data: profile }, betaFeatures] =
    await Promise.all([
      supabase
        .from("playbook_members")
        .select("role")
        .eq("playbook_id", playbookId)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
      getBetaFeatures(),
    ]);

  const role = (membership?.role as string | null) ?? null;
  const isCoachInPlaybook = role === "owner" || role === "editor";
  const isAdmin = (profile?.role as string | null) === "admin";
  const allowed = isBetaFeatureAvailable(betaFeatures.game_results, {
    isAdmin,
    isEntitled: isCoachInPlaybook,
  });
  if (!allowed) notFound();

  const { data: session } = await supabase
    .from("game_sessions")
    .select(
      "id, playbook_id, status, started_at, ended_at, kind, opponent, score_us, score_them, notes",
    )
    .eq("id", sessionId)
    .eq("playbook_id", playbookId)
    .eq("status", "ended")
    .maybeSingle();
  if (!session) notFound();

  const [{ data: calls }, { data: events }] = await Promise.all([
    supabase
      .from("game_plays")
      .select(
        "id, play_id, position, called_at, thumb, tag, snapshot",
      )
      .eq("session_id", sessionId)
      .order("position", { ascending: true }),
    supabase
      .from("game_score_events")
      .select("id, side, delta, created_at, created_by, play_id")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true }),
  ]);

  const coachIds = Array.from(
    new Set((events ?? []).map((e) => e.created_by as string).filter(Boolean)),
  );
  const nameByCoach = new Map<string, string>();
  if (coachIds.length > 0) {
    const { data: coaches } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", coachIds);
    for (const c of coaches ?? []) {
      nameByCoach.set(
        c.id as string,
        ((c.display_name as string | null) ?? "").trim() || "A coach",
      );
    }
  }

  const data: GameDetailData = {
    playbookId,
    session: {
      id: session.id as string,
      startedAt: session.started_at as string,
      endedAt: (session.ended_at as string | null) ?? null,
      kind:
        (session.kind as string | null) === "scrimmage" ? "scrimmage" : "game",
      opponent: (session.opponent as string | null) ?? null,
      scoreUs: (session.score_us as number | null) ?? null,
      scoreThem: (session.score_them as number | null) ?? null,
      notes: (session.notes as string | null) ?? null,
    },
    calls: (calls ?? []).map((c) => ({
      id: c.id as string,
      playId: c.play_id as string,
      position: c.position as number,
      calledAt: c.called_at as string,
      thumb: (c.thumb as "up" | "down" | null) ?? null,
      tag: (c.tag as string | null) ?? null,
      snapshot: (c.snapshot as Record<string, unknown> | null) ?? {},
    })),
    events: (events ?? []).map((e) => ({
      id: e.id as string,
      side: (e.side as string) === "them" ? "them" : "us",
      delta: e.delta as number,
      createdAt: e.created_at as string,
      createdBy: (e.created_by as string | null) ?? null,
      createdByName: nameByCoach.get((e.created_by as string) ?? "") ?? null,
      playId: (e.play_id as string | null) ?? null,
    })),
  };

  return <GameDetailClient data={data} />;
}
