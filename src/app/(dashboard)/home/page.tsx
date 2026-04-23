import { getDashboardSummaryAction } from "@/app/actions/plays";
import { listPendingApprovalsForOwnerAction } from "@/app/actions/playbook-roster";
import { getHideLobbyAnimation } from "@/lib/site/lobby-config";
import { getCurrentUserProfile } from "@/app/actions/admin-guard";
import { PendingApprovalsCard } from "@/features/dashboard/PendingApprovalsCard";
import { DashboardClient } from "./ui";

type Props = { searchParams: Promise<{ error?: string }> };

export default async function HomePage({ searchParams }: Props) {
  const { error: errFromQuery } = await searchParams;
  const [res, approvals, hideAnimation, profileRes] = await Promise.all([
    getDashboardSummaryAction(),
    listPendingApprovalsForOwnerAction(),
    getHideLobbyAnimation(),
    getCurrentUserProfile(),
  ]);
  const isAdmin = profileRes.profile?.role === "admin";

  return (
    <div className="space-y-8">
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
      {res.ok && (
        <DashboardClient
          data={res.data}
          hideAnimation={hideAnimation}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}
