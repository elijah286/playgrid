/**
 * Retention sweep for the functional-testing harness — keeps storage bounded so
 * nightly runs never fill the disk.
 *
 * Keeps the most recent N runs (FUNCTEST_RETAIN_RUNS, default 14 ≈ two weeks of
 * nightlies) and deletes everything older: the run row (which cascade-deletes its
 * functional_test_steps), the per-step PNG stills under `<runId>/…`, and the
 * scenario replay GIFs referenced in meta.gifs. Idempotent + best-effort per run.
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (service-role
 * bypasses the admin-only RLS on functional_test_runs).
 * Run: npm run functest:retention
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadDotEnvLocal() {
  const p = join(root, ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}

loadDotEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Need NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const RETAIN = Math.max(1, parseInt(process.env.FUNCTEST_RETAIN_RUNS || "14", 10));
const BUCKET = "test-screenshots";
const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

/** Object key from a public storage URL (".../object/public/<bucket>/<key>"). */
function keyFromUrl(u) {
  const marker = `/${BUCKET}/`;
  const i = String(u).indexOf(marker);
  return i === -1 ? null : decodeURIComponent(String(u).slice(i + marker.length));
}

async function main() {
  const { data: runs, error } = await admin
    .from("functional_test_runs")
    .select("id, meta, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const old = (runs ?? []).slice(RETAIN);
  if (old.length === 0) {
    console.log(`Nothing to prune (${runs?.length ?? 0} run(s) ≤ retain=${RETAIN}).`);
    return;
  }

  let removedObjects = 0;
  for (const run of old) {
    try {
      // 1) Per-step PNG stills live under `<runId>/`.
      const { data: files } = await admin.storage.from(BUCKET).list(run.id, { limit: 1000 });
      if (files?.length) {
        const keys = files.map((f) => `${run.id}/${f.name}`);
        await admin.storage.from(BUCKET).remove(keys);
        removedObjects += keys.length;
      }
      // 2) Scenario replay GIFs referenced in meta.gifs.
      const gifs = (run.meta && run.meta.gifs) || {};
      const gifKeys = Object.values(gifs).map(keyFromUrl).filter(Boolean);
      if (gifKeys.length) {
        await admin.storage.from(BUCKET).remove(gifKeys);
        removedObjects += gifKeys.length;
      }
      // 3) The run row — cascade-deletes its functional_test_steps.
      const { error: delErr } = await admin.from("functional_test_runs").delete().eq("id", run.id);
      if (delErr) console.error(`  run ${run.id}: ${delErr.message}`);
    } catch (e) {
      console.error(`  run ${run.id}: ${e.message ?? e}`);
    }
  }
  console.log(
    `Kept latest ${RETAIN} run(s); pruned ${old.length} older run(s) and ~${removedObjects} storage object(s).`,
  );
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
