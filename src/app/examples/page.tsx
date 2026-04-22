import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { getExamplesPageEnabled } from "@/lib/site/examples-config";
import type { PlayDocument, Player, Route, Zone } from "@/domain/play/types";
import {
  ExampleBookTile,
  type ExampleBookTileData,
} from "@/features/dashboard/ExampleBookTile";

export const metadata: Metadata = {
  title: "Example playbooks",
  description:
    "Browse real football playbooks built in PlayGrid — plays, formations, and wristband cards for flag, youth tackle, and 7v7 coaches. Create your own free in minutes.",
  alternates: { canonical: "/examples" },
  openGraph: {
    title: "Example football playbooks — built in PlayGrid",
    description:
      "Real plays and playbooks coaches have designed with PlayGrid. Browse the examples, then create your own free.",
    url: "/examples",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Example football playbooks — built in PlayGrid",
    description:
      "Real plays and playbooks coaches have designed with PlayGrid.",
  },
};

const PREVIEWS_PER_BOOK = 12;

async function loadExamplePlaybooks(): Promise<ExampleBookTileData[]> {
  if (!hasSupabaseEnv()) return [];
  const svc = createServiceRoleClient();
  const { data: books } = await svc
    .from("playbooks")
    .select(
      "id, name, season, logo_url, color, updated_at, example_author_label, plays(count)",
    )
    .eq("is_public_example", true)
    .eq("is_archived", false)
    .order("updated_at", { ascending: false });

  if (!books || books.length === 0) return [];

  type Row = {
    id: string;
    name: string;
    season: string | null;
    logo_url: string | null;
    color: string | null;
    updated_at: string | null;
    example_author_label: string | null;
    plays: { count: number }[] | { count: number } | null;
  };

  const ids = (books as Row[]).map((b) => b.id);

  // Pull a small set of recent offensive plays per book, then fetch the
  // current_version document for each so we can thumbnail them on the
  // book's back page.
  const { data: playRows } = await svc
    .from("plays")
    .select("id, playbook_id, current_version_id, updated_at")
    .in("playbook_id", ids)
    .eq("is_archived", false)
    .eq("play_type", "offense")
    .order("updated_at", { ascending: false });

  const versionIdsByBook = new Map<string, string[]>();
  for (const p of (playRows ?? []) as Array<{
    playbook_id: string;
    current_version_id: string | null;
  }>) {
    if (!p.current_version_id) continue;
    const arr = versionIdsByBook.get(p.playbook_id) ?? [];
    if (arr.length < PREVIEWS_PER_BOOK) {
      arr.push(p.current_version_id);
      versionIdsByBook.set(p.playbook_id, arr);
    }
  }

  const allVersionIds = Array.from(versionIdsByBook.values()).flat();
  const docsByVid = new Map<string, PlayDocument>();
  if (allVersionIds.length > 0) {
    const { data: versions } = await svc
      .from("play_versions")
      .select("id, document")
      .in("id", allVersionIds);
    for (const v of (versions ?? []) as Array<{ id: string; document: PlayDocument | null }>) {
      if (v.document) docsByVid.set(v.id, v.document);
    }
  }

  return (books as Row[]).map((b) => {
    const agg = Array.isArray(b.plays) ? b.plays[0] : b.plays;
    const vids = versionIdsByBook.get(b.id) ?? [];
    const previews = vids
      .map((vid) => docsByVid.get(vid))
      .filter((d): d is PlayDocument => d != null)
      .map((doc) => ({
        players: (doc.layers?.players ?? []) as Player[],
        routes: (doc.layers?.routes ?? []) as Route[],
        zones: (doc.layers?.zones ?? []) as Zone[],
        lineOfScrimmageY:
          typeof doc.lineOfScrimmageY === "number" ? doc.lineOfScrimmageY : 0.4,
      }));
    return {
      id: b.id,
      name: b.name,
      season: b.season,
      logo_url: b.logo_url,
      color: b.color,
      play_count: agg?.count ?? 0,
      author_label: b.example_author_label,
      previews,
    } satisfies ExampleBookTileData;
  });
}

export default async function ExamplesPage() {
  const enabled = await getExamplesPageEnabled();
  if (!enabled) notFound();
  const playbooks = await loadExamplePlaybooks();

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-12 sm:py-16">
      <header className="max-w-2xl">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
          Example playbooks
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted">
          Real PlayGrid playbooks built by coaches — open one to explore the
          plays, formations, and wristband cards. Nothing you do inside
          will be saved; the &quot;Create your playbook&quot; button is
          always one click away.
        </p>
      </header>

      {playbooks.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-border bg-surface-raised p-6 text-sm text-muted">
          No example playbooks are published yet. Check back soon.
        </div>
      ) : (
        <section className="mt-12 flex flex-wrap justify-start gap-6">
          {playbooks.map((pb) => (
            <div key={pb.id} className="w-40 sm:w-48 lg:w-56">
              <ExampleBookTile tile={pb} />
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
