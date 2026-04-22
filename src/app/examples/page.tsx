import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { SPORT_VARIANT_LABELS } from "@/domain/play/factory";
import type { SportVariant } from "@/domain/play/types";

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

type ExamplePlay = {
  id: string;
  name: string;
  shorthand: string | null;
  concept: string | null;
  play_type: string | null;
  formation_name: string | null;
};

type ExamplePlaybook = {
  id: string;
  name: string;
  season: string | null;
  sport_variant: SportVariant;
  logo_url: string | null;
  color: string | null;
  play_count: number;
  plays: ExamplePlay[];
  updated_at: string | null;
};

const MAX_PLAYS_PER_PLAYBOOK = 12;

async function loadExamplePlaybooks(): Promise<ExamplePlaybook[]> {
  if (!hasSupabaseEnv()) return [];
  const svc = createServiceRoleClient();
  const { data: books } = await svc
    .from("playbooks")
    .select(
      "id, name, season, sport_variant, logo_url, color, updated_at, plays(count)",
    )
    .eq("is_public_example", true)
    .eq("is_archived", false)
    .order("updated_at", { ascending: false });

  if (!books || books.length === 0) return [];

  type Row = {
    id: string;
    name: string;
    season: string | null;
    sport_variant: string | null;
    logo_url: string | null;
    color: string | null;
    updated_at: string | null;
    plays: { count: number }[] | { count: number } | null;
  };

  const ids = (books as Row[]).map((b) => b.id);
  const { data: playRows } = await svc
    .from("plays")
    .select(
      "id, playbook_id, name, shorthand, concept, play_type, formation_name, sort_order, is_archived",
    )
    .in("playbook_id", ids)
    .eq("is_archived", false)
    .order("sort_order", { ascending: true });

  const playsByBook = new Map<string, ExamplePlay[]>();
  for (const p of (playRows ?? []) as Array<{
    id: string;
    playbook_id: string;
    name: string;
    shorthand: string | null;
    concept: string | null;
    play_type: string | null;
    formation_name: string | null;
  }>) {
    const arr = playsByBook.get(p.playbook_id) ?? [];
    if (arr.length < MAX_PLAYS_PER_PLAYBOOK) {
      arr.push({
        id: p.id,
        name: p.name,
        shorthand: p.shorthand,
        concept: p.concept,
        play_type: p.play_type,
        formation_name: p.formation_name,
      });
      playsByBook.set(p.playbook_id, arr);
    }
  }

  return (books as Row[]).map((b) => {
    const agg = Array.isArray(b.plays) ? b.plays[0] : b.plays;
    return {
      id: b.id,
      name: b.name,
      season: b.season,
      sport_variant: (b.sport_variant as SportVariant) ?? "flag_7v7",
      logo_url: b.logo_url,
      color: b.color,
      play_count: agg?.count ?? 0,
      plays: playsByBook.get(b.id) ?? [],
      updated_at: b.updated_at,
    } satisfies ExamplePlaybook;
  });
}

export default async function ExamplesPage() {
  const playbooks = await loadExamplePlaybooks();

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12 sm:py-16">
      <header className="max-w-2xl">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
          Example playbooks
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted">
          These are real PlayGrid playbooks — real formations, real routes,
          real wristband cards. Browse the plays to see how coaches are
          using PlayGrid for flag football, youth tackle, and 7v7, then
          create your own free.
        </p>
        <div className="mt-5">
          <Link
            href="/login"
            className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            Create your playbook
          </Link>
        </div>
      </header>

      {playbooks.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-border bg-surface-raised p-6 text-sm text-muted">
          No example playbooks are published yet. Check back soon.
        </div>
      ) : (
        <section className="mt-10 grid gap-6 sm:grid-cols-2">
          {playbooks.map((pb) => (
            <ExamplePlaybookCard key={pb.id} playbook={pb} />
          ))}
        </section>
      )}
    </main>
  );
}

function ExamplePlaybookCard({ playbook }: { playbook: ExamplePlaybook }) {
  const accent = playbook.color || "#2563eb";
  const variantLabel =
    SPORT_VARIANT_LABELS[playbook.sport_variant] ?? playbook.sport_variant;
  return (
    <article
      className="overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-sm"
      style={{ borderTopWidth: 4, borderTopColor: accent }}
    >
      <header className="flex items-center gap-4 p-5">
        <div
          className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-white ring-1 ring-black/10"
        >
          {playbook.logo_url ? (
            <Image
              src={playbook.logo_url}
              alt=""
              fill
              sizes="56px"
              className="object-contain p-1"
              unoptimized
            />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center text-xl font-extrabold text-white"
              style={{ backgroundColor: accent }}
            >
              {playbook.name.slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-bold tracking-tight text-foreground">
            {playbook.name}
          </h2>
          <p className="truncate text-xs text-muted">
            {[variantLabel, playbook.season, `${playbook.play_count} plays`]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </header>
      {playbook.plays.length > 0 && (
        <ol className="divide-y divide-border border-t border-border text-sm">
          {playbook.plays.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-5 py-2.5">
              <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                {p.name}
              </span>
              {p.formation_name && (
                <span className="truncate text-xs text-muted">
                  {p.formation_name}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}
