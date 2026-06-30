import { LeagueContentSkeleton } from "@/features/league/LeagueContentSkeleton";

/** Suspense fallback for the league area — instant feedback on navigation while
 *  the (dynamic) page renders. The rail in the layout stays mounted. */
export default function Loading() {
  return <LeagueContentSkeleton />;
}
