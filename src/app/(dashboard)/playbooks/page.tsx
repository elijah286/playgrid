import { listPlaybooksAction } from "@/app/actions/playbooks";
import { PlaybooksClient } from "./ui";

export default async function PlaybooksPage() {
  const res = await listPlaybooksAction();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground">Playbooks</h1>
        <p className="mt-1 text-sm text-muted">
          Open a playbook, add plays, then edit on desktop for the best experience.
        </p>
      </div>
      {!res.ok && (
        <p className="rounded-lg bg-danger-light px-3 py-2 text-sm text-danger">{res.error}</p>
      )}
      <PlaybooksClient initial={res.ok ? res.playbooks : []} />
    </div>
  );
}
