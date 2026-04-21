import { redirect } from "next/navigation";
import { getDashboardSummaryAction } from "@/app/actions/plays";
import { DashboardTabs } from "@/components/layout/DashboardTabs";
import { DashboardClient } from "./ui";

type Props = { searchParams: Promise<{ error?: string }> };

export default async function HomePage({ searchParams }: Props) {
  const { error: errFromQuery } = await searchParams;
  const res = await getDashboardSummaryAction();

  // First-run shortcut: only send editors/owners straight into the editor.
  // Viewers (invited with read-only access) should see the dashboard even
  // when empty, so they don't get dropped into an editor they can't use.
  const canEditSomewhere = res.ok
    ? res.data.playbooks.some((p) => p.role === "owner" || p.role === "editor")
    : false;
  if (res.ok && res.data.totalPlays === 0 && canEditSomewhere) {
    redirect("/plays/new");
  }

  return (
    <div className="space-y-8">
      <DashboardTabs active="playbooks" />
      {errFromQuery && (
        <p className="rounded-lg bg-danger-light px-3 py-2 text-sm text-danger">
          {errFromQuery}
        </p>
      )}
      {!res.ok && (
        <p className="rounded-lg bg-danger-light px-3 py-2 text-sm text-danger">{res.error}</p>
      )}
      {res.ok && <DashboardClient data={res.data} />}
    </div>
  );
}
