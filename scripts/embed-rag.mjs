/**
 * Backfill embeddings for rag_documents rows where embedding IS NULL.
 *
 * Reads the OpenAI API key from site_settings (same place the admin UI
 * stores it), or falls back to OPENAI_API_KEY env var.
 *
 * Uses text-embedding-3-small (1536 dims) — matches the vector(1536)
 * column in supabase/migrations/0094_rag_documents.sql.
 *
 * Run: npm run embed:rag
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadDotEnvLocal() {
  const p = join(root, ".env.local");
  if (!existsSync(p)) {
    console.error("Missing .env.local");
    process.exit(1);
  }
  const raw = readFileSync(p, "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadDotEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(
    "Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const MODEL = "text-embedding-3-small";
const DIMS = 1536;
const BATCH_SIZE = 100;

async function getOpenAIKey() {
  const { data, error } = await admin
    .from("site_settings")
    .select("openai_api_key")
    .eq("id", "default")
    .maybeSingle();
  if (error) throw new Error(`site_settings: ${error.message}`);
  const fromDb = (data?.openai_api_key ?? "").trim();
  if (fromDb) return fromDb;
  const fromEnv = (process.env.OPENAI_API_KEY ?? "").trim();
  if (fromEnv) return fromEnv;
  throw new Error(
    "No OpenAI API key found. Set it in the admin UI (site_settings.openai_api_key) or as OPENAI_API_KEY in .env.local.",
  );
}

async function embedBatch(apiKey, inputs) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: MODEL, input: inputs }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI ${res.status}: ${text}`);
  }
  const json = await res.json();
  return json.data.map((d) => d.embedding);
}

function chunkText(title, content) {
  // Single chunk per row — rows are already topically narrow.
  // Title front-loads the most important keywords for retrieval.
  return `${title}\n\n${content}`;
}

async function main() {
  const apiKey = await getOpenAIKey();

  const { data: rows, error } = await admin
    .from("rag_documents")
    .select("id, title, content")
    .is("embedding", null)
    .is("retired_at", null)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`fetch rows: ${error.message}`);

  if (!rows.length) {
    console.log("No rows to embed.");
    return;
  }

  console.log(`Embedding ${rows.length} rows in batches of ${BATCH_SIZE}…`);

  let done = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const inputs = batch.map((r) => chunkText(r.title, r.content));
    const embeddings = await embedBatch(apiKey, inputs);

    if (embeddings.length !== batch.length) {
      throw new Error(
        `OpenAI returned ${embeddings.length} embeddings for ${batch.length} inputs`,
      );
    }

    // Update each row. pgvector accepts a stringified array literal.
    for (let j = 0; j < batch.length; j++) {
      const vec = embeddings[j];
      if (vec.length !== DIMS) {
        throw new Error(`Embedding length ${vec.length} != ${DIMS}`);
      }
      const { error: upErr } = await admin
        .from("rag_documents")
        .update({ embedding: `[${vec.join(",")}]` })
        .eq("id", batch[j].id);
      if (upErr) {
        throw new Error(`update ${batch[j].id}: ${upErr.message}`);
      }
    }

    done += batch.length;
    console.log(`  ${done}/${rows.length}`);
  }

  console.log(`Done. Embedded ${done} rows.`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
