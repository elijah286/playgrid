import { getStoredOpenAIApiKey } from "@/lib/site/openai-key";

const EMBED_MODEL = "text-embedding-3-small";
const EMBED_DIMS = 1536;

/** Embed a single text. Returns a number[] of length 1536. Throws on failure. */
export async function embedText(text: string): Promise<number[]> {
  const apiKey = await getStoredOpenAIApiKey();
  if (!apiKey) {
    throw new Error(
      "Embedding requires an OpenAI API key (used for vector search). Set it in Settings → Integrations.",
    );
  }
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: EMBED_MODEL, input: text }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Embedding failed (${res.status}): ${body}`);
  }
  const json = (await res.json()) as { data: { embedding: number[] }[] };
  const vec = json.data?.[0]?.embedding;
  if (!Array.isArray(vec) || vec.length !== EMBED_DIMS) {
    throw new Error(`Unexpected embedding shape (${vec?.length ?? 0} dims)`);
  }
  return vec;
}

/** pgvector literal for an embedding array. */
export function vectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}
