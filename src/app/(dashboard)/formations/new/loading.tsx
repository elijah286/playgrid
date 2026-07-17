import { FormationEditorSkeleton } from "@/features/formations/FormationEditorSkeleton";

/** Shown while the server page resolves the playbook's variant. Same skeleton
 *  as the edit route — it's the same editor. */
export default function NewFormationLoading() {
  return <FormationEditorSkeleton />;
}
