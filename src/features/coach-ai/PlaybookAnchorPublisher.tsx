"use client";

import { useEffect } from "react";
import { setPlaybookAnchor, clearPlaybookAnchor } from "./playbook-anchor";

// Mounts under any page that lives inside a single playbook's scope (the
// playbook detail page, the play editor) and publishes its id/name/color
// to the shared anchor store so the global Coach AI launcher can keep its
// playbook anchor stable across same-playbook navigations.

export function PlaybookAnchorPublisher({
  playbookId,
  playbookName,
  playbookColor,
}: {
  playbookId: string;
  playbookName?: string | null;
  playbookColor?: string | null;
}) {
  useEffect(() => {
    setPlaybookAnchor({
      id: playbookId,
      name: playbookName ?? null,
      color: playbookColor ?? null,
    });
    return () => {
      clearPlaybookAnchor(playbookId);
    };
  }, [playbookId, playbookName, playbookColor]);

  return null;
}
