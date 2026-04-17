import { loadPlaybooksDashboardAction } from "@/app/actions/playbooks";
import { PlaybooksClient } from "./ui";

export default async function PlaybooksPage() {
  const data = await loadPlaybooksDashboardAction();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-4xl tracking-wide text-pg-turf">Playbooks</h1>
        <p className="mt-1 text-sm text-pg-muted">
          Open a playbook, add plays, then edit on the sideline laptop for the best experience.
        </p>
      </div>
      {!data.ok && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
          {data.error}
        </p>
      )}
      <PlaybooksClient initial={data.ok ? data.playbooks : []} teams={data.ok ? data.teams : []} />
    </div>
  );
}
