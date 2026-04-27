import { createClient } from "@/lib/supabase/server";
import { embedText } from "./embed";

export type KbMatch = {
  id: string;
  scope: "global" | "playbook";
  scope_id: string | null;
  topic: string;
  subtopic: string | null;
  title: string;
  content: string;
  sport_variant: string | null;
  game_level: string | null;
  sanctioning_body: string | null;
  age_division: string | null;
  source: string;
  source_url: string | null;
  authoritative: boolean;
  needs_review: boolean;
  similarity: number;
};

export type KbFilter = {
  scope?: "global" | "playbook" | null;
  playbookId?: string | null;
  sportVariant?: string | null;
  gameLevel?: string | null;
  sanctioningBody?: string | null;
  ageDivision?: string | null;
  matchCount?: number;
};

/** Vector search KB with metadata filters. RLS applies — caller's session is used. */
export async function searchKb(query: string, filter: KbFilter = {}): Promise<KbMatch[]> {
  const q = query.trim();
  if (!q) return [];
  const embedding = await embedText(q);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("match_rag_documents", {
    p_query_embedding: `[${embedding.join(",")}]`,
    p_match_count: filter.matchCount ?? 12,
    p_scope: filter.scope ?? null,
    p_playbook_id: filter.playbookId ?? null,
    p_sport_variant: filter.sportVariant ?? null,
    p_game_level: filter.gameLevel ?? null,
    p_sanctioning_body: filter.sanctioningBody ?? null,
    p_age_division: filter.ageDivision ?? null,
  });
  if (error) throw new Error(`KB search: ${error.message}`);
  return (data ?? []) as KbMatch[];
}
