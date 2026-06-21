import type { Metadata } from "next";
import Link from "next/link";

import { getMyLeagues } from "@/lib/league/console";
import { CreateLeagueForm } from "@/features/league/CreateLeagueForm";

export const metadata: Metadata = {
  title: "League Operations · XO Gridmaker",
};

/** League picker. The layout has already gated access to league members. */
export default async function LeagueHomePage() {
  const leagues = await getMyLeagues();

  return (
    <div className="mx-auto max-w-3xl px-6 py-12 text-foreground">
      <h1 className="text-2xl font-extrabold tracking-tight">League Operations</h1>
      <p className="mt-2 text-sm text-muted">
        Select a league to open its operator console.
      </p>

      {leagues.length === 0 ? (
        <p className="mt-8 text-sm text-muted">
          You don&apos;t run any leagues yet. Create your first one to open the console.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {leagues.map((l) => (
            <li key={l.id}>
              <Link
                href={`/league/${l.id}`}
                className="block rounded-lg border px-4 py-3 transition hover:bg-foreground/5"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold">{l.name}</span>
                  <span className="text-xs uppercase tracking-wide text-muted">
                    {l.sport}
                  </span>
                </div>
                <div className="mt-1 text-xs text-muted">{l.roles.join(" · ")}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8 border-t pt-6">
        <CreateLeagueForm />
      </div>
    </div>
  );
}
