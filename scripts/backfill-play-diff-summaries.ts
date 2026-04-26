// One-off: compute and store diff_summary for every play_versions row that
// has a parent_version_id but no diff. Run with:
//   npx tsx scripts/backfill-play-diff-summaries.ts

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { summarizePlayDiff } from "../src/lib/versions/play-diff";
import type { PlayDocument } from "../src/domain/play/types";

config({ path: "/Users/elijahkerry/playbook/.env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE env vars");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  const PAGE = 500;
  let scanned = 0;
  let updated = 0;
  let emptyDiff = 0;
  let noDoc = 0;

  for (;;) {
    const { data, error } = await sb
      .from("play_versions")
      .select("id, parent_version_id, document")
      .is("diff_summary", null)
      .not("parent_version_id", "is", null)
      .order("created_at", { ascending: true })
      .limit(PAGE);
    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const row of data) {
      scanned++;
      const { data: parent } = await sb
        .from("play_versions")
        .select("document")
        .eq("id", row.parent_version_id as string)
        .maybeSingle();
      const parentDoc = (parent?.document as PlayDocument | null) ?? null;
      const doc = (row.document as PlayDocument | null) ?? null;
      if (!parentDoc || !doc) {
        noDoc++;
        await sb.from("play_versions").update({ diff_summary: "" }).eq("id", row.id as string);
        continue;
      }
      const summary = summarizePlayDiff(parentDoc, doc);
      const value = summary && summary.trim().length > 0 ? summary : "";
      if (!value) emptyDiff++;
      const { error: uErr } = await sb
        .from("play_versions")
        .update({ diff_summary: value })
        .eq("id", row.id as string);
      if (uErr) {
        console.error("update failed", row.id, uErr.message);
        continue;
      }
      if (value) updated++;
    }

    console.log(`scanned=${scanned} updated=${updated} emptyDiff=${emptyDiff} noDoc=${noDoc}`);
    if (data.length < PAGE) break;
  }
  console.log("done", { scanned, updated, emptyDiff, noDoc });
}

void main().then(() => process.exit(0));
