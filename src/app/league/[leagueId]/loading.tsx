import { LeagueContentSkeleton } from "@/features/league/LeagueContentSkeleton";

/** Per-league Suspense fallback — switching sections inside a league shows the
 *  skeleton in the content column while the rail + league context stay put. */
export default function Loading() {
  return <LeagueContentSkeleton />;
}
