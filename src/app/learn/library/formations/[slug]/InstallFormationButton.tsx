"use client";

import { installFormationToPlaybookAction } from "@/app/actions/plays";
import { InstallButton } from "@/app/learn/library/_components/InstallButton";
import type { LibraryVariant } from "@/lib/learn/variant";

export function InstallFormationButton({
  formationName,
  variant,
  loginHref,
}: {
  formationName: string;
  variant: LibraryVariant;
  loginHref: string;
}) {
  return (
    <InstallButton
      variant={variant}
      loginHref={loginHref}
      dialogTitle="Install formation"
      installing={formationName}
      onInstall={(playbookId) =>
        installFormationToPlaybookAction({ formationName, variant, playbookId })
      }
    />
  );
}
