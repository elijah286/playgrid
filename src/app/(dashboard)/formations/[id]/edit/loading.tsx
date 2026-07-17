import { FormationEditorSkeleton } from "@/features/formations/FormationEditorSkeleton";

/** Shown while the server page loads the formation and its siblings. Without
 *  it, tapping a formation card left the Formations tab frozen for the whole
 *  round-trip — the gap the play editor's loading.tsx already covers. */
export default function EditFormationLoading() {
  return <FormationEditorSkeleton />;
}
