import { FlaskConical } from "lucide-react";

import { resolveExampleMakerScope } from "@/lib/examples/mode";
import { ExampleMakerExitButton } from "./ExampleMakerExitButton";

export async function ExampleMakerBanner() {
  const scope = await resolveExampleMakerScope();
  if (!scope.active) return null;
  return (
    <div className="border-b border-amber-500/30 bg-amber-100/80 px-4 py-2 text-center text-xs text-amber-950 dark:bg-amber-500/15 dark:text-amber-100">
      <span className="inline-flex flex-wrap items-center justify-center gap-2">
        <FlaskConical className="size-3.5" />
        <span>
          You&apos;re in <strong className="font-semibold">example maker mode</strong>
          . Playbooks you list, create, and edit belong to the public
          /examples author.
        </span>
        <ExampleMakerExitButton />
      </span>
    </div>
  );
}
