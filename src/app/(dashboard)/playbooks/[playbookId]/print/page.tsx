import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { loadPlaybookPrintPackAction } from "@/app/actions/plays";
import { SPORT_VARIANT_LABELS } from "@/domain/play/factory";
import type { SportVariant } from "@/domain/play/types";
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
    .select("id, name, season, sport_variant, logo_url, color")
    .eq("id", playbookId)
    .single();

  if (error || !book) notFound();

  const pack = await loadPlaybookPrintPackAction(playbookId);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let coachName: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();
    coachName = (profile?.display_name as string | null) || user.email || null;
  }

  const variantLabel =
    SPORT_VARIANT_LABELS[book.sport_variant as SportVariant] ?? (book.sport_variant as string) ?? "";
  const subtext = [book.season as string | null, variantLabel, coachName]
    .filter((s): s is string => !!s && String(s).trim().length > 0)
    .join(" · ");

  const team = {
    teamName: book.name as string,
    subtext,
    logoUrl: (book.logo_url as string | null) ?? null,
    accentColor: (book.color as string | null) || "#134e2a",
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Link
          href={`/playbooks/${playbookId}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
          {book.name}
        </Link>
        <h1 className="text-lg font-extrabold tracking-tight text-foreground">
          Print playbook
        </h1>
      </div>
      <PrintPlaybookClient
        playbookId={playbookId}
        initialPack={pack.ok ? pack.pack : []}
        initialGroups={pack.ok ? pack.groups : []}
        loadError={pack.ok ? null : pack.error}
        team={team}
        logoUrl={(book.logo_url as string | null) ?? null}
      />
    </div>
  );
}
