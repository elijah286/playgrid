import { listFormationsAction } from "@/app/actions/formations";
import { DashboardTabs } from "@/components/layout/DashboardTabs";
import { FormationsClient } from "./ui";

export const metadata = { title: "Formations — xogridmaker" };

export default async function FormationsPage() {
  const result = await listFormationsAction();
  const formations = result.ok ? result.formations : [];

  return (
    <div className="space-y-6">
      <DashboardTabs active="formations" />
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Formations</h1>
        <p className="mt-1 text-sm text-muted">
          Starting player layouts for each sport type. System formations are built in; custom
          formations can be created here or saved from the play editor's Formation tab.
        </p>
      </div>
      <FormationsClient initial={formations} />
    </div>
  );
}
