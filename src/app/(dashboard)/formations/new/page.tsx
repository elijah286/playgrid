import { FormationEditorClient } from "@/features/formations/FormationEditorClient";

export const metadata = { title: "New Formation — PlayGrid" };

export default function NewFormationPage() {
  return <FormationEditorClient mode="new" />;
}
