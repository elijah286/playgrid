import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import {
  getBetaFeatures,
  isBetaFeatureAvailable,
} from "@/lib/site/beta-features-config";
import { listPlaysAction } from "@/app/actions/plays";
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

  return <GameModeClient playbookId={playbookId} plays={offensePlays} />;
}
