import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { SportVariant } from "@/domain/play/types";
import { checkPhotoImportAccess } from "@/lib/coach-ai/photo-import/access";
import { PhotoImportClient } from "@/features/photo-import/PhotoImportClient";

export const metadata: Metadata = { title: "Import play from photo" };

type Props = { params: Promise<{ playbookId: string }> };

export default async function ImportPhotoPage({ params }: Props) {
  const { playbookId } = await params;

  // Authoritative gate (auth + photo_play_import beta + entitlement).
  // The API routes re-run it per call; this keeps the page itself dark
  // for anyone outside the beta.
  const access = await checkPhotoImportAccess();
  if (!access.ok) notFound();

  // RLS-scoped read doubles as the playbook permission check.
  const supabase = await createClient();
  const { data: playbook } = await supabase
    .from("playbooks")
    .select("name, sport_variant")
    .eq("id", playbookId)
    .maybeSingle();
  if (!playbook) notFound();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Import play from photo</h1>
          <p className="mt-0.5 text-sm text-muted">
            Photograph a play sheet or a hand-drawn play — review the read, fix anything, then save it to{" "}
            <span className="font-medium text-foreground">{playbook.name}</span>.
          </p>
        </div>
        <Link
          href={`/playbooks/${playbookId}`}
          className="whitespace-nowrap rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-raised"
        >
          Back to playbook
        </Link>
      </div>
      <PhotoImportClient
        playbookId={playbookId}
        variant={(playbook.sport_variant ?? "flag_7v7") as SportVariant}
        capRemaining={access.cap.remaining}
        capLimit={access.cap.limit}
        capExempt={access.isAdmin}
      />
    </div>
  );
}
