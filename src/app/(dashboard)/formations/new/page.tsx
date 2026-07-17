import {
  FormationEditorClient,
  type FormationEditorKind,
} from "@/features/formations/FormationEditorClient";
import { ExamplePreviewProvider } from "@/features/admin/ExamplePreviewContext";
import type { SportVariant } from "@/domain/play/types";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";

export const metadata = { title: "New Formation — XO Gridmaker" };

const VALID_VARIANTS: SportVariant[] = ["flag_5v5", "flag_7v7", "other", "tackle_11"];

// An unrecognised ?kind= falls back to offense rather than 404ing.
const VALID_KINDS: FormationEditorKind[] = ["offense", "defense", "special_teams"];

type Props = {
  searchParams: Promise<{
    variant?: string;
    kind?: string;
    returnToPlay?: string;
    returnToPlaybook?: string;
    preview?: string;
  }>;
};

export default async function NewFormationPage({ searchParams }: Props) {
  const params = await searchParams;
  const queryVariant =
    VALID_VARIANTS.find((v) => v === params.variant) ?? "flag_7v7";
  const queryKind = VALID_KINDS.find((k) => k === params.kind) ?? "offense";
  const returnToPlay = params.returnToPlay ?? null;
  const returnToPlaybook = params.returnToPlaybook ?? null;
  const isPreview = params.preview === "1";

  // When entering from a specific playbook, lock the sport-type selector to
  // that playbook's variant. Otherwise a coach could pick a mismatched
  // variant ("Other" in a flag_7v7 playbook) and the saved formation would
  // be invisible in the playbook's Formations tab — it gets filtered out
  // server-side by listFormationsForPlaybookAction.
  //
  // For multi-playbook saves (comma-joined ids from the picker), we lock to
  // the first playbook's variant; the picker only surfaces same-variant
  // playbooks in practice. If the lookup fails we fall back to the query
  // param and leave the selector unlocked.
  let initialVariant: SportVariant = queryVariant;
  let lockVariant = false;
  const firstPlaybookId = (returnToPlaybook ?? "").split(",").map((s) => s.trim()).filter(Boolean)[0];
  if (firstPlaybookId && hasSupabaseEnv()) {
    const supabase = await createClient();
    const { data: pb } = await supabase
      .from("playbooks")
      .select("sport_variant")
      .eq("id", firstPlaybookId)
      .single();
    const pbVariant = (pb?.sport_variant as string | null) ?? null;
    const matched = VALID_VARIANTS.find((v) => v === pbVariant);
    if (matched) {
      initialVariant = matched;
      lockVariant = true;
    }
  }

  // Special teams fields 11 and only tackle has a roster for it. The side is
  // fixed once the editor opens — it has no control to recover with — so a
  // hand-typed ?kind=special_teams on a 5v5 playbook would strand the coach on
  // an empty field. Resolve it here, where the variant is already known.
  const kind: FormationEditorKind =
    queryKind === "special_teams" && initialVariant !== "tackle_11"
      ? "offense"
      : queryKind;

  return (
    <ExamplePreviewProvider isPreview={isPreview}>
      <FormationEditorClient
        mode="new"
        kind={kind}
        initialVariant={initialVariant}
        lockVariant={lockVariant}
        returnToPlay={returnToPlay}
        returnToPlaybook={returnToPlaybook}
      />
    </ExamplePreviewProvider>
  );
}
