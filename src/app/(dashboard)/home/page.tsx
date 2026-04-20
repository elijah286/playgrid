import { redirect } from "next/navigation";
import { getDashboardSummaryAction } from "@/app/actions/plays";
import { DashboardTabs } from "@/components/layout/DashboardTabs";
import { DashboardClient } from "./ui";

type Props = { searchParams: Promise<{ error?: string }> };

export default async function HomePage({ searchParams }: Props) {
  const { error: errFromQuery } = await searchParams;
  const res = await getDashboardSummaryAction();

  // First-run: user has no plays at all → send them straight into the editor.
  // Also covers the case where a brand-new account just logged in.
  if (res.ok && res.data.totalPlays === 0) {
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
