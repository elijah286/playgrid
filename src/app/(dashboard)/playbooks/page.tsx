import { listPlaybooksAction } from "@/app/actions/playbooks";
import { PlaybooksClient } from "./ui";

export default async function PlaybooksPage() {
  const res = await listPlaybooksAction();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Playbooks</h1>
        <p className="mt-1 text-sm text-slate-600">
          Open a playbook, add plays, then edit on desktop for the best experience.
        </p>
      </div>
      {!res.ok && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{res.error}</p>
      )}
      <PlaybooksClient initial={res.ok ? res.playbooks : []} />
    </div>
  );
}
