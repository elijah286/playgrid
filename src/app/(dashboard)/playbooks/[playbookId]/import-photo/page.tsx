import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
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
      <Link
        href={`/playbooks/${playbookId}`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to {playbook.name}
      </Link>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Import a play from a photo</h1>
        <p className="mt-1 max-w-xl text-sm text-muted">
          Photograph a play sheet or a hand-drawn play. You&apos;ll review the read and fix anything before it&apos;s
          saved to <span className="font-medium text-foreground">{playbook.name}</span>.
        </p>
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
