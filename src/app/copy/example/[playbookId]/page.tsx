import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { previewExamplePlaybookAction } from "@/app/actions/example-claim";
import { AuthFlow } from "@/features/auth/AuthFlow";
import { getUserEntitlement } from "@/lib/billing/entitlement";
import { FREE_MAX_PLAYBOOKS_OWNED, tierAtLeast } from "@/lib/billing/features";
import { ClaimExampleForm } from "./ui";
import { defaultClaimedPlaybookName } from "@/lib/playbook/default-name";
import type { SportVariant } from "@/domain/play/types";

type Props = { params: Promise<{ playbookId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { playbookId } = await params;
  if (!hasSupabaseEnv()) return { title: "Start with this example · XO Gridmaker" };
  const res = await previewExamplePlaybookAction(playbookId);
  if (!res.ok) return { title: "Start with this example · XO Gridmaker" };
  const title = `Start with ${res.preview.name} · XO Gridmaker`;
  const description = "Get your own editable copy of this example playbook.";
  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

type QuotaState =
  | { kind: "anon" }
  | { kind: "paid" }
  | { kind: "free_room" }
  | { kind: "free_full" };

async function getQuotaState(): Promise<QuotaState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "anon" };

  const entitlement = await getUserEntitlement(user.id);
  if (tierAtLeast(entitlement, "coach")) return { kind: "paid" };

  const { count } = await supabase
    .from("playbook_members")
    .select("playbook_id, playbooks!inner(id)", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("role", "owner")
    .eq("playbooks.is_default", false);
  if ((count ?? 0) >= FREE_MAX_PLAYBOOKS_OWNED) return { kind: "free_full" };
  return { kind: "free_room" };
}

export default async function ExampleClaimPage({ params }: Props) {
  const { playbookId } = await params;

  if (!hasSupabaseEnv()) {
    return (
      <Frame title="Start with this example">
        <p className="text-sm text-muted">Configure Supabase to claim examples.</p>
      </Frame>
    );
  }

  const previewRes = await previewExamplePlaybookAction(playbookId);
  if (!previewRes.ok) {
    return (
      <Frame title="Example not found">
        <p className="text-sm text-muted">{previewRes.error}</p>
      </Frame>
    );
  }
  const preview = previewRes.preview;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Owners of an example (typically site admins who built it) shouldn't
  // re-claim — bounce to the source. Non-owner members CAN still claim;
  // a Team Coach added as an editor on an example is a real use case (they
  // want a customizable copy of their own).
  let viewerDisplayName: string | null = null;
  if (user) {
    const { data: ownerMembership } = await supabase
      .from("playbook_members")
      .select("role")
      .eq("playbook_id", preview.playbookId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .eq("role", "owner")
      .maybeSingle();
    if (ownerMembership) {
      redirect(`/playbooks/${preview.playbookId}`);
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();
    viewerDisplayName = (profile?.display_name as string | null) ?? null;
  }

  const quota = await getQuotaState();
  const next = `/copy/example/${playbookId}`;
  const accent = preview.color || "#2563eb";
  const suggestedName = defaultClaimedPlaybookName(
    viewerDisplayName,
    preview.sportVariant as SportVariant | null,
  );

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5 px-6 pb-16 pt-10 sm:pt-16">
      <PreviewCard
        playbookName={preview.name}
        season={preview.season}
        logoUrl={preview.logoUrl}
        color={accent}
        playCount={preview.playCount}
        authorLabel={preview.exampleAuthorLabel}
      />

      {user ? (
        <ClaimExampleForm
          playbookId={playbookId}
          suggestedName={suggestedName}
          sourceColor={accent}
          sourceLogoUrl={preview.logoUrl}
          userEmail={user.email ?? null}
          blockedByQuota={quota.kind === "free_full"}
          quotaNote={<QuotaDisclosure quota={quota} />}
        />
      ) : (
        <div className="space-y-4 rounded-2xl border border-border bg-surface-raised p-6 shadow-elevated">
          <div>
            <p className="text-sm font-semibold text-foreground">
              Sign up to start with this — it&rsquo;s free.
            </p>
            <p className="mt-0.5 text-xs text-muted">
              You&rsquo;ll get your own editable copy of this example as your
              first playbook. Free accounts get one playbook; upgrade later
              for more.
            </p>
          </div>
          <AuthFlow next={next} heading="" subheading="" />
        </div>
      )}
    </div>
  );
}

function QuotaDisclosure({ quota }: { quota: QuotaState }) {
  if (quota.kind === "paid" || quota.kind === "anon") return null;
  if (quota.kind === "free_room") {
    return (
      <div className="rounded-md bg-surface-inset px-3 py-2 text-[11px] text-muted">
        This will use your free playbook slot. Team Coach plan unlocks more —{" "}
        <Link
          href="/pricing"
          className="font-medium text-foreground underline-offset-2 hover:underline"
        >
          see pricing
        </Link>
        .
      </div>
    );
  }
  return (
    <div className="rounded-md bg-warning-light px-3 py-2 text-xs text-warning ring-1 ring-warning/30">
      <p className="font-semibold">
        Free accounts get 1 playbook, and you already have one.
      </p>
      <p className="mt-0.5 text-warning/90">
        Upgrade to Team Coach to claim this example alongside it, or delete
        your existing playbook first.
      </p>
      <Link
        href="/pricing"
        className="mt-1.5 inline-block font-medium underline-offset-2 hover:underline"
      >
        See pricing →
      </Link>
    </div>
  );
}

function PreviewCard({
  playbookName,
  season,
  logoUrl,
  color,
  playCount,
  authorLabel,
}: {
  playbookName: string;
  season: string | null;
  logoUrl: string | null;
  color: string;
  playCount: number;
  authorLabel: string | null;
}) {
  const subline = season ?? "";
  return (
    <div
      className="overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-elevated"
      style={{ borderTopWidth: 4, borderTopColor: color }}
    >
      <div className="flex items-center gap-4 p-6">
        <div
          className="relative shrink-0 overflow-hidden rounded-xl bg-white ring-1 ring-black/10"
          style={{ width: 72, height: 72 }}
        >
          {logoUrl ? (
            <Image
              src={logoUrl}
              alt=""
              fill
              sizes="72px"
              className="object-contain p-1.5"
              unoptimized
            />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center text-2xl font-extrabold text-white"
              style={{ backgroundColor: color }}
            >
              {playbookName.slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            Start with this example
          </p>
          <h1 className="mt-0.5 truncate text-xl font-extrabold tracking-tight text-foreground">
            {playbookName}
          </h1>
          {(subline || authorLabel) && (
            <p className="truncate text-sm text-muted">
              {[subline, authorLabel ? `by ${authorLabel}` : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
      </div>
      <dl className="grid grid-cols-2 divide-x divide-border border-t border-border bg-surface text-xs">
        <Stat label="Plays" value={String(playCount)} />
        <Stat label="You become" value="Owner" />
      </dl>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-0.5 px-3 py-3 text-center">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted">
        {label}
      </dt>
      <dd className="truncate text-sm font-semibold text-foreground" title={value}>
        {value}
      </dd>
    </div>
  );
}

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md px-6 pb-16 pt-10 sm:pt-16">
      <div className="rounded-2xl border border-border bg-surface-raised p-6 shadow-elevated">
        <h1 className="text-xl font-extrabold tracking-tight text-foreground">{title}</h1>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}
