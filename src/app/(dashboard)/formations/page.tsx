import { listFormationsAction } from "@/app/actions/formations";
import { FormationsClient } from "./ui";

export const metadata = { title: "Formations — PlayGrid" };

export default async function FormationsPage() {
  const result = await listFormationsAction();
  const formations = result.ok ? result.formations : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Formations</h1>
        <p className="mt-1 text-sm text-muted">
          System formations ship with PlayGrid for each sport type. Save custom formations
          from the play editor to add your own here.
        </p>
      </div>
      <FormationsClient initial={formations} />
    </div>
  );
}
