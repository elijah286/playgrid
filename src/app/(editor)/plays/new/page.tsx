import { redirect } from "next/navigation";
import { createPlayAction, quickCreatePlayAction } from "@/app/actions/plays";
import { listFormationsAction } from "@/app/actions/formations";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import type { SportVariant } from "@/domain/play/types";

/**
 * Quick-create route: creates a new play in the user's Inbox and bounces to the editor.
 * Used by the first-run flow and the dashboard's "New play" shortcut.
 *
 * When `playbookId` and `formationId` are provided, creates the play in that
 * playbook seeded from the given formation — used by the formation editor
 * and the formation action menu.
 */
export default async function NewPlayPage({
  searchParams,
}: {
  searchParams: Promise<{ playbookId?: string; formationId?: string }>;
}) {
  if (!hasSupabaseEnv()) {
    redirect("/login");
  }
  const { playbookId, formationId } = await searchParams;

  if (playbookId && formationId) {
    const supabase = await createClient();
    const { data: book } = await supabase
      .from("playbooks")
      .select("sport_variant")
      .eq("id", playbookId)
      .single();
    const variant = (book?.sport_variant as SportVariant | undefined) ?? "flag_7v7";

    const formationsRes = await listFormationsAction();
    const formation = formationsRes.ok
      ? formationsRes.formations.find((f) => f.id === formationId)
      : null;

    if (formation) {
      const res = await createPlayAction(playbookId, {
        initialPlayers: formation.players,
        formationId: formation.id,
        formationName: formation.displayName,
        variant,
      });
      if (!res.ok) {
        redirect(
          `/playbooks/${playbookId}?tab=formations&error=${encodeURIComponent(res.error)}`,
        );
      }
      redirect(`/plays/${res.playId}/edit`);
    }
    // Formation not found or not accessible — fall through to back-to-playbook.
    redirect(`/playbooks/${playbookId}?tab=formations`);
  }

  const res = await quickCreatePlayAction();
  if (!res.ok) {
    redirect(`/home?error=${encodeURIComponent(res.error)}`);
  }
  redirect(`/plays/${res.playId}/edit`);
}
