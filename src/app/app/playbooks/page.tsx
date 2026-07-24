import { listAllShellPlaybooks } from "@/features/preview-shell/team-context";
import { PlaybooksLibraryClient } from "./PlaybooksLibraryClient";

/**
 * Playbooks library — every playbook the user belongs to (active, archived,
 * examples), the exhaustive counterpart to the curated Home shelf. A book opens
 * the Team hub. Desktop-first (a sidebar destination); on mobile it's reached
 * from Home's "See all", not a bottom-nav tab.
 */
export default async function AppPlaybooksPage() {
  const books = await listAllShellPlaybooks();
  return <PlaybooksLibraryClient books={books} />;
}
