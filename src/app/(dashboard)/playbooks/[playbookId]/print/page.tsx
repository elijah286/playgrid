import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { loadPlaybookPrintPackAction } from "@/app/actions/plays";
import { PrintPlaybookClient } from "./ui";

type Props = { params: Promise<{ playbookId: string }> };

export default async function PlaybookPrintPage({ params }: Props) {
  const { playbookId } = await params;

  if (!hasSupabaseEnv()) {
    return (
      <div>
        <p className="text-sm text-muted">Configure Supabase to print this playbook.</p>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: book, error } = await supabase
    .from("playbooks")
    .select("id, name")
    .eq("id", playbookId)
    .single();

  if (error || !book) notFound();

  const pack = await loadPlaybookPrintPackAction(playbookId);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/playbooks/${playbookId}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
          {book.name}
        </Link>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-foreground">
          Print playbook
        </h1>
        <p className="mt-1 text-sm text-muted">
          Choose plays and configure a wrist coach or playcard export.
        </p>
      </div>
      <PrintPlaybookClient
        playbookId={playbookId}
        initialPack={pack.ok ? pack.pack : []}
        initialGroups={pack.ok ? pack.groups : []}
        loadError={pack.ok ? null : pack.error}
      />
    </div>
  );
}
