// Dev-only preview of the canonical play editor running in library mode.
// Renders the Mesh concept (5v5 Flag) with libraryMode=true so we can verify:
//   - editor mounts with no auth context
//   - no toolbars / inspector / autosave
//   - no Cal observation side effects fire
//   - the diagram renders identically to the in-app editor
// Delete this route once the real /learn/library/[category]/[slug] page lands.

import { notFound } from "next/navigation";
import { generateConceptSkeleton } from "@/domain/play/conceptSkeleton";
import { playSpecToCoachDiagram } from "@/domain/play/specRenderer";
import { coachDiagramToPlayDocument } from "@/features/coach-ai/coachDiagramConverter";
import { defaultSettingsForVariant } from "@/domain/playbook/settings";
import type { SportVariant } from "@/domain/play/types";
import { PlayEditorClient } from "@/features/editor/PlayEditorClient";

export const dynamic = "force-dynamic";

export default async function LibraryEditorPreviewPage() {
  // Hard kill switch — never serve this in production builds.
  if (process.env.NODE_ENV === "production") notFound();

  const variant: SportVariant = "flag_5v5";
  const skeleton = generateConceptSkeleton("mesh", { variant, strength: "right" });
  if (!skeleton.ok) {
    return (
      <main style={{ padding: 32 }}>
        <h1>Library editor preview — skeleton error</h1>
        <pre>{skeleton.error}</pre>
      </main>
    );
  }

  const { diagram } = playSpecToCoachDiagram(skeleton.spec);
  const doc = coachDiagramToPlayDocument(diagram);
  const playbookSettings = defaultSettingsForVariant(variant);

  return (
    <main style={{ padding: 16 }}>
      <div
        style={{
          background: "#FFFBEB",
          border: "1px dashed #FCD34D",
          borderRadius: 10,
          padding: "10px 14px",
          fontSize: 13,
          color: "#78350F",
          marginBottom: 16,
        }}
      >
        <strong>Dev preview · library mode.</strong> Editor rendered with{" "}
        <code>libraryMode=true</code>. Toolbars, inspector, autosave, and Cal
        observation hooks should all be inert. Drag should not commit changes.
      </div>
      <PlayEditorClient
        playId="library-preview:mesh:flag-5v5"
        playbookId="library-preview"
        playbookName="Football Library"
        playbookVariant={variant}
        initialDocument={doc}
        initialNav={[]}
        initialGroups={[]}
        allFormations={[]}
        opponentFormations={[]}
        playbookSettings={playbookSettings}
        canEdit={false}
        libraryMode={true}
      />
    </main>
  );
}
