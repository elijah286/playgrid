import { FormationEditorClient } from "@/features/formations/FormationEditorClient";
import { ExamplePreviewProvider } from "@/features/admin/ExamplePreviewContext";
import type { SportVariant } from "@/domain/play/types";

export const metadata = { title: "New Formation — XO Gridmaker" };

const VALID_VARIANTS: SportVariant[] = ["flag_5v5", "flag_7v7", "other", "tackle_11"];

type Props = {
  searchParams: Promise<{
    variant?: string;
    returnToPlay?: string;
    returnToPlaybook?: string;
    preview?: string;
  }>;
};

export default async function NewFormationPage({ searchParams }: Props) {
  const params = await searchParams;
  const variant =
    VALID_VARIANTS.find((v) => v === params.variant) ?? "flag_7v7";
  const returnToPlay = params.returnToPlay ?? null;
  const returnToPlaybook = params.returnToPlaybook ?? null;
  const isPreview = params.preview === "1";

  return (
    <ExamplePreviewProvider isPreview={isPreview}>
      <FormationEditorClient
        mode="new"
        initialVariant={variant}
        returnToPlay={returnToPlay}
        returnToPlaybook={returnToPlaybook}
      />
    </ExamplePreviewProvider>
  );
}
