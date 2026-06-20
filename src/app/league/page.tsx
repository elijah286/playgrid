import type { Metadata } from "next";

import { getCurrentLeagueMemberships } from "@/lib/league/access";

export const metadata: Metadata = {
  title: "League Operations · XO Gridmaker",
};

/**
 * Wave 0 foundation preview. The layout has already gated access, so the user
 * here is a league member. The full operator console arrives in a later track;
 * this page exists to prove the gate + membership wiring end-to-end.
 */
export default async function LeagueHomePage() {
  const memberships = await getCurrentLeagueMemberships();

  return (
    <div className="mx-auto max-w-3xl px-6 py-12 text-foreground">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
        Foundation preview
      </p>
      <h1 className="mt-1 text-2xl font-extrabold tracking-tight">
        League Operations
      </h1>
      <p className="mt-2 text-sm text-muted">
        This surface is gated and invisible to everyone except league members.
        The operator console (dashboard, registration, rosters, communications)
        ships in the next tracks.
      </p>

      <h2 className="mt-8 text-sm font-semibold">Your league memberships</h2>
      <ul className="mt-3 space-y-2 text-sm">
        {memberships.map((m) => (
          <li
            key={`${m.leagueId}-${m.role}`}
            className="rounded-lg border px-4 py-3"
          >
            <span className="text-muted">League</span>{" "}
            <code className="text-foreground">{m.leagueId}</code>{" "}
            <span className="text-muted">— role</span>{" "}
            <strong>{m.role}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
