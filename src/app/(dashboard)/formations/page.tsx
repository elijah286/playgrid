import { listFormationsAction } from "@/app/actions/formations";
import { getCurrentUserProfile } from "@/app/actions/admin-guard";
import { DashboardTabs } from "@/components/layout/DashboardTabs";
import { FormationsClient } from "./ui";

export const metadata = { title: "Formations — xogridmaker" };

export default async function FormationsPage() {
  const [result, profileRes] = await Promise.all([
    listFormationsAction(),
    getCurrentUserProfile(),
  ]);
  const formations = result.ok ? result.formations : [];
  const isAdmin = profileRes.profile?.role === "admin";

  return (
    <div className="space-y-6">
      <DashboardTabs active="formations" />
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Formations</h1>
        <p className="mt-1 text-sm text-muted">
          Starting player layouts across every playbook you can edit. New
          playbooks automatically receive the seed formations for their
          sport type.
        </p>
      </div>
      <FormationsClient initial={formations} isAdmin={isAdmin} />
    </div>
  );
}
