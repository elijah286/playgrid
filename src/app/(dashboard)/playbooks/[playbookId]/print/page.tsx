import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { loadPlaybookPrintPackAction } from "@/app/actions/plays";
import { SPORT_VARIANT_LABELS } from "@/domain/play/factory";
import type { SportVariant } from "@/domain/play/types";
import { getCurrentEntitlement } from "@/lib/billing/entitlement";
import { getPlaybookOwnerEntitlement } from "@/lib/billing/owner-entitlement";
import { canRemovePlaysheetWatermark, canUseWristbands } from "@/lib/billing/features";
import { PrintPlaybookClient } from "./ui";
import { StickyExampleCta } from "@/features/marketing/StickyExampleCta";

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

  // Example viewers get the full print UI to browse layouts and visuals,
  // but Print + PDF are gated behind an upgrade modal — see
  // ExamplePrintLockOverlay in ui.tsx. This is the highest-quality
  // demo moment we have: visitors *see* exactly what they'd export
  // before being asked to claim a copy.
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
        headCoachName={coachName}
        canUseWristbands={
          isExamplePreview ? true : canUseWristbands(await getCurrentEntitlement())
        }
        canRemovePlaysheetWatermark={
          isExamplePreview
            ? false
            : canRemovePlaysheetWatermark(
                await getPlaybookOwnerEntitlement(playbookId),
              )
        }
        isExamplePreview={isExamplePreview}
      />
      {isExamplePreview && (
        <StickyExampleCta
          playbookId={playbookId}
          playbookName={book.name as string}
        />
      )}
    </div>
  );
}
