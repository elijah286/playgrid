"use client";

import { installDefenseToPlaybookAction } from "@/app/actions/plays";
import { InstallButton } from "@/app/learn/library/_components/InstallButton";
import type { LibraryVariant } from "@/lib/learn/variant";

export function InstallDefenseButton({
  alignmentName,
  variant,
  loginHref,
}: {
  alignmentName: string;
  variant: LibraryVariant;
  loginHref: string;
}) {
  return (
    <InstallButton
      variant={variant}
      loginHref={loginHref}
      dialogTitle="Install defense"
      installing={alignmentName}
      onInstall={(playbookId) =>
        installDefenseToPlaybookAction({ alignmentName, variant, playbookId })
      }
    />
  );
}
