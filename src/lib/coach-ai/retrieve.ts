import { createClient } from "@/lib/supabase/server";
import { getStoredOpenAIApiKey } from "@/lib/site/openai-key";

const EMBED_MODEL = "text-embedding-3-small";
const EMBED_DIMS = 1536;

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

async function embedQuery(text: string): Promise<number[]> {
  const apiKey = await getStoredOpenAIApiKey();
  if (!apiKey) {
    throw new Error(
      "Coach AI knowledge search needs an OpenAI API key (used for embeddings). Set it in Settings → Integrations.",
    );
  }
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: text }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Embedding request failed (${res.status}): ${body}`);
  }
  const json = (await res.json()) as { data: { embedding: number[] }[] };
  const vec = json.data?.[0]?.embedding;
  if (!Array.isArray(vec) || vec.length !== EMBED_DIMS) {
    throw new Error(`Unexpected embedding shape (got ${vec?.length ?? 0} dims)`);
  }
  return vec;
}

/** Vector search KB with metadata filters. RLS applies — caller's session is used. */
export async function searchKb(query: string, filter: KbFilter = {}): Promise<KbMatch[]> {
  const q = query.trim();
  if (!q) return [];
  const embedding = await embedQuery(q);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("match_rag_documents", {
    p_query_embedding: `[${embedding.join(",")}]`,
    p_match_count: filter.matchCount ?? 8,
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
