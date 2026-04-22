import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import {
  createEmptyPlayDocument,
  defaultPlayersForVariant,
  sportProfileForVariant,
} from "@/domain/play/factory";
import {
  defaultSettingsForVariant,
  normalizePlaybookSettings,
} from "@/domain/playbook/settings";
import type {
  PlayDocument,
  Player,
  SportProfile,
  SportVariant,
} from "@/domain/play/types";
import type { SavedFormation } from "@/app/actions/formations";
import { PlayEditorClient } from "@/features/editor/PlayEditorClient";

/**
 * Scratch play editor for the public-example experience. A visitor
 * clicks "New play" in an example playbook and lands here with an
 * empty in-memory PlayDocument. They can draw, drag, and animate — but
 * nothing persists. Routing away discards the work.
 *
 * We only render for playbooks flagged as public examples; everything
 * else 404s.
 */
type Props = {
  searchParams: Promise<{
    playbookId?: string;
    formationId?: string;
    variant?: string;
  }>;
};

export default async function PreviewNewPlayPage({ searchParams }: Props) {
  const { playbookId, formationId } = await searchParams;
  if (!playbookId) notFound();
  if (!hasSupabaseEnv()) notFound();

  const supabase = await createClient();
  const { data: book } = await supabase
    .from("playbooks")
    .select(
      "id, sport_variant, custom_offense_count, settings, is_example, is_public_example",
    )
    .eq("id", playbookId)
    .single();

  if (!book) notFound();
  // Only public examples get the scratch surface. Members of a private
  // playbook should use the real create flow.
  if (!(book.is_public_example || book.is_example)) notFound();

  const variant = (book.sport_variant as SportVariant) ?? "flag_7v7";
  const sportProfile: SportProfile = sportProfileForVariant(variant);

  let seedPlayers: Player[] = defaultPlayersForVariant(variant);
  let seedFormation: SavedFormation | null = null;
  if (formationId) {
    const { data: f } = await supabase
      .from("formations")
      .select("id, params, kind, is_system")
      .eq("id", formationId)
      .maybeSingle();
    const params = f?.params as
      | {
          displayName?: string;
          players?: Player[];
          sportProfile?: Partial<SportProfile>;
          lineOfScrimmageY?: number;
        }
      | null;
    if (params?.players) {
      seedPlayers = params.players;
      seedFormation = {
        id: f?.id as string,
        displayName: params.displayName ?? "Formation",
        players: params.players,
        sportProfile: params.sportProfile ?? {},
        isSystem: Boolean(f?.is_system),
        kind: (f?.kind as SavedFormation["kind"] | null) ?? "offense",
        losY:
          typeof params.lineOfScrimmageY === "number"
            ? params.lineOfScrimmageY
            : 0.4,
      };
    }
  }

  const baseDoc = createEmptyPlayDocument({ sportProfile });
  const doc: PlayDocument = {
    ...baseDoc,
    layers: { ...baseDoc.layers, players: seedPlayers },
    metadata: {
      ...baseDoc.metadata,
      formationId: seedFormation?.id ?? null,
      formation: seedFormation?.displayName ?? "",
    },
  };

  const playbookSettings = normalizePlaybookSettings(
    book.settings,
    variant,
    (book.custom_offense_count as number | null) ?? null,
  );
  // Fallback for when settings haven't been normalized yet — keeps types happy.
  void defaultSettingsForVariant;

  return (
    <PlayEditorClient
      playId="preview"
      playbookId={playbookId}
      initialDocument={doc}
      initialNav={[]}
      initialGroups={[]}
      linkedFormation={seedFormation}
      opponentFormation={null}
      allFormations={[]}
      opponentFormations={[]}
      playbookSettings={playbookSettings}
      canEdit={true}
      isExamplePreview={true}
    />
  );
}
