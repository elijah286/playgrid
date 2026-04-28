import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { previewCopyLinkAction } from "@/app/actions/copy-links";
import { AuthFlow } from "@/features/auth/AuthFlow";
import { getUserEntitlement } from "@/lib/billing/entitlement";
import {
  FREE_MAX_PLAYBOOKS_OWNED,
  tierAtLeast,
} from "@/lib/billing/features";
import { ClaimCopyButton } from "./ui";

type Props = { params: Promise<{ token: string }> };

function buildTitle(preview: {
  playbook_name: string;
  sender_name: string | null;
}): string {
  const who = preview.sender_name?.trim() || "A coach";
  return `${who} sent you a copy of ${preview.playbook_name}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  if (!hasSupabaseEnv()) return { title: "Copy a playbook · xogridmaker" };
  const res = await previewCopyLinkAction(token);
  if (
    !res.ok ||
    res.preview.revoked ||
    res.preview.expired ||
    res.preview.disabled
  ) {
    return { title: "Copy a playbook · xogridmaker" };
  }
  const title = buildTitle(res.preview);
  const description = "Claim your own editable copy on xogridmaker.";
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

/** Compute the recipient's free-quota state so we can show the right
 *  disclosure before they claim. Better to over-communicate the "this
 *  counts as your free playbook" implication up front than surprise
 *  them with a paywall after they've already invested in signing up. */
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

export default async function CopyPage({ params }: Props) {
  const { token } = await params;

  if (!hasSupabaseEnv()) {
    return (
      <Frame title="Copy link">
        <p className="text-sm text-muted">Configure Supabase to claim copies.</p>
      </Frame>
    );
  }

  const previewRes = await previewCopyLinkAction(token);
  if (!previewRes.ok) {
    return (
      <Frame title="Copy link not found">
        <p className="text-sm text-muted">{previewRes.error}</p>
      </Frame>
    );
  }
  const preview = previewRes.preview;

  if (preview.revoked) {
    return (
      <Frame title="Copy link revoked">
        <p className="text-sm text-muted">This copy link was revoked by the owner.</p>
      </Frame>
    );
  }
  if (preview.expired) {
    return (
      <Frame title="Copy link expired">
        <p className="text-sm text-muted">Ask the owner for a fresh link.</p>
      </Frame>
    );
  }
  if (preview.exhausted) {
    return (
      <Frame title="Copy link fully used">
        <p className="text-sm text-muted">This copy link has reached its maximum uses.</p>
      </Frame>
    );
  }
  if (preview.disabled) {
    return (
      <Frame title="Copies disabled">
        <p className="text-sm text-muted">
          The owner has disabled copies of this playbook.
        </p>
      </Frame>
    );
  }

  const quota = await getQuotaState();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const next = `/copy/${token}`;
  const accent = preview.color || "#2563eb";
  const senderName =
    preview.sender_name?.trim() || preview.head_coach_name?.trim() || null;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5 px-6 pb-16 pt-10 sm:pt-16">
      <PreviewCard
        playbookName={preview.playbook_name}
        season={preview.season}
        logoUrl={preview.logo_url}
        color={accent}
        playCount={preview.play_count}
        senderName={senderName}
      />

      {user ? (
        <div className="space-y-3 rounded-2xl border border-border bg-surface-raised p-6 shadow-elevated">
          <div>
            <p className="text-sm font-semibold text-foreground">
              This becomes yours.
            </p>
            <p className="mt-0.5 text-xs text-muted">
              Rename it, swap the logo, change colors, edit any play. Your edits
              stay yours — the sender keeps their original.
            </p>
          </div>

          <QuotaDisclosure quota={quota} />

          <ClaimCopyButton
            token={token}
            blockedByQuota={quota.kind === "free_full"}
          />

          <p className="text-[11px] text-muted">
            Signed in as <span className="font-medium">{user.email}</span>
          </p>
        </div>
      ) : (
        <div className="space-y-4 rounded-2xl border border-border bg-surface-raised p-6 shadow-elevated">
          <div>
            <p className="text-sm font-semibold text-foreground">
              Sign up to claim it — it&rsquo;s free.
            </p>
            <p className="mt-0.5 text-xs text-muted">
              Once you claim, the playbook is yours to rename, edit, and share.
              Free accounts get one playbook; you can upgrade later for more.
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
        Upgrade to Team Coach to claim this copy alongside it, or delete your
        existing playbook first.
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
  senderName,
}: {
  playbookName: string;
  season: string | null;
  logoUrl: string | null;
  color: string;
  playCount: number;
  senderName: string | null;
}) {
  const subline = season ?? "";
  const lede = senderName
    ? `${senderName} sent you a copy of`
    : "You've been sent a copy of";
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
            {lede}
          </p>
          <h1 className="mt-0.5 truncate text-xl font-extrabold tracking-tight text-foreground">
            {playbookName}
          </h1>
          {subline && (
            <p className="truncate text-sm text-muted">{subline}</p>
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
