import { getDashboardSummaryAction } from "@/app/actions/plays";
import { getHideLobbyAnimation } from "@/lib/site/lobby-config";
import { DashboardTabs } from "@/components/layout/DashboardTabs";
import { DashboardClient } from "./ui";

type Props = { searchParams: Promise<{ error?: string }> };

export default async function HomePage({ searchParams }: Props) {
  const { error: errFromQuery } = await searchParams;
  const [res, hideAnimation] = await Promise.all([
    getDashboardSummaryAction(),
    getHideLobbyAnimation(),
  ]);

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
      {res.ok && (
        <DashboardClient data={res.data} hideAnimation={hideAnimation} />
      )}
    </div>
  );
}
