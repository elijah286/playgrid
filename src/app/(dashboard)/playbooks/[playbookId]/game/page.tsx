import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import {
  getBetaFeatures,
  isBetaFeatureAvailable,
} from "@/lib/site/beta-features-config";

type Props = { params: Promise<{ playbookId: string }> };

export default async function GameModePage({ params }: Props) {
  const { playbookId } = await params;

  if (!hasSupabaseEnv()) redirect(`/playbooks/${playbookId}`);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/playbooks/${playbookId}`);

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

  const allowed = isBetaFeatureAvailable(betaFeatures.game_mode, {
    isAdmin,
    isEntitled: isCoachInPlaybook,
  });
  if (!allowed) redirect(`/playbooks/${playbookId}`);

  return (
    <div className="space-y-4">
      <Link
        href={`/playbooks/${playbookId}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to playbook
      </Link>
      <h1 className="text-xl font-semibold tracking-tight text-foreground">
        Game mode
      </h1>
      <p className="text-sm text-muted">
        Game mode UI is coming soon. (Phase 3 wires up the in-game flow.)
      </p>
    </div>
  );
}
