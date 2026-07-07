import { redirect } from "next/navigation";

/** Practice-plan distribution merged into the Playbooks page (library plan,
 *  Phase 4) — one distribution surface per league. This route sticks around
 *  as a redirect so old links, bookmarks, and Leo replies keep working. */
export default async function CurriculumRedirect({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  redirect(`/league/${leagueId}/playbooks`);
}
