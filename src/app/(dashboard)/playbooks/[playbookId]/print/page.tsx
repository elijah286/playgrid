import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FlaskConical, Printer } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { loadPlaybookPrintPackAction } from "@/app/actions/plays";
import { SPORT_VARIANT_LABELS } from "@/domain/play/factory";
import type { SportVariant } from "@/domain/play/types";
import { getCurrentEntitlement } from "@/lib/billing/entitlement";
import { getPlaybookOwnerEntitlement } from "@/lib/billing/owner-entitlement";
import { canRemovePlaysheetWatermark, canUseWristbands } from "@/lib/billing/features";
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
    .select("id, name, season, sport_variant, logo_url, color, is_example, is_public_example")
    .eq("id", playbookId)
    .single();

  if (error || !book) notFound();

  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();
  let isMember = false;
  if (currentUser) {
    const { data: membership } = await supabase
      .from("playbook_members")
      .select("role")
      .eq("playbook_id", playbookId)
      .eq("user_id", currentUser.id)
      .maybeSingle();
    isMember = membership?.role != null;
  }
  const isExamplePreview =
    !isMember && Boolean(book.is_example || book.is_public_example);

  if (isExamplePreview) {
    return <PrintPreviewLockedCard playbookName={book.name as string} playbookId={playbookId} />;
  }

  const pack = await loadPlaybookPrintPackAction(playbookId);

  let coachName: string | null = null;
  if (currentUser) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", currentUser.id)
      .maybeSingle();
    coachName = (profile?.display_name as string | null) || currentUser.email || null;
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
        canUseWristbands={canUseWristbands(await getCurrentEntitlement())}
        canRemovePlaysheetWatermark={canRemovePlaysheetWatermark(
          await getPlaybookOwnerEntitlement(playbookId),
        )}
      />
    </div>
  );
}

function PrintPreviewLockedCard({
  playbookName,
  playbookId,
}: {
  playbookName: string;
  playbookId: string;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Link
          href={`/playbooks/${playbookId}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
          {playbookName}
        </Link>
        <h1 className="text-lg font-extrabold tracking-tight text-foreground">
          Print playbook
        </h1>
      </div>
      <div className="rounded-2xl border border-border bg-surface-raised p-10 text-center shadow-sm">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Printer className="size-6" />
        </div>
        <h2 className="mt-4 text-xl font-extrabold tracking-tight text-foreground">
          Get started with your first playbook
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          Printing, wristband cards, and practice packs are part of your own
          playbook. This is just an example — create your own in under a
          minute and print from there.
        </p>
        <div className="mt-5 flex items-center justify-center gap-2">
          <Link
            href="/home"
            className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-hover"
          >
            Create your playbook
          </Link>
          <Link
            href={`/playbooks/${playbookId}`}
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-muted hover:bg-surface-inset hover:text-foreground"
          >
            <FlaskConical className="size-4" />
            Keep exploring
          </Link>
        </div>
      </div>
    </div>
  );
}
