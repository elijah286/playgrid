import { getDashboardSummaryAction } from "@/app/actions/plays";
import { listPendingApprovalsForOwnerAction } from "@/app/actions/playbook-roster";
import { DashboardTabs } from "@/components/layout/DashboardTabs";
import { PendingApprovalsCard } from "@/features/dashboard/PendingApprovalsCard";
import { DashboardClient } from "./ui";

type Props = { searchParams: Promise<{ error?: string }> };

export default async function HomePage({ searchParams }: Props) {
  const { error: errFromQuery } = await searchParams;
  const [res, approvals] = await Promise.all([
    getDashboardSummaryAction(),
    listPendingApprovalsForOwnerAction(),
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
      {approvals.ok && approvals.tiles.length > 0 && (
        <PendingApprovalsCard initialTiles={approvals.tiles} />
      )}
      {res.ok && <DashboardClient data={res.data} />}
    </div>
  );
}
