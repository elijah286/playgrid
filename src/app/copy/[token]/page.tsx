import type { Metadata } from "next";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { previewCopyLinkAction } from "@/app/actions/copy-links";
import { AuthFlow } from "@/features/auth/AuthFlow";
import { SPORT_VARIANT_LABELS } from "@/domain/play/factory";
import type { SportVariant } from "@/domain/play/types";
import { ClaimCopyButton } from "./ui";

type Props = { params: Promise<{ token: string }> };

function buildTitle(preview: {
  playbook_name: string;
  sport_variant: string | null;
  season: string | null;
}): string {
  const parts: string[] = [preview.playbook_name];
  const variantLabel = preview.sport_variant
    ? SPORT_VARIANT_LABELS[preview.sport_variant as SportVariant]
    : null;
  if (variantLabel) parts.push(variantLabel);
  if (preview.season) parts.push(preview.season);
  return `Get your own copy of ${parts.join(" ")}`;
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
  const description = res.preview.head_coach_name
    ? `${res.preview.head_coach_name} shared a playbook with you. Claim your own editable copy on xogridmaker.`
    : "Claim your own editable copy of this playbook on xogridmaker.";
  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const next = `/copy/${token}`;
  const accent = preview.color || "#2563eb";

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5 px-6 pb-16 pt-10 sm:pt-16">
      <PreviewCard
        playbookName={preview.playbook_name}
        season={preview.season}
        logoUrl={preview.logo_url}
        color={accent}
        playCount={preview.play_count}
        headCoachName={preview.head_coach_name}
      />

      {user ? (
        <div className="rounded-2xl border border-border bg-surface-raised p-6 shadow-elevated">
          <p className="text-sm text-foreground">
            Signed in as <span className="font-semibold">{user.email}</span>
          </p>
          <p className="mt-1 text-xs text-muted">
            Claiming creates your own editable playbook with these plays. The
            sender keeps theirs — you can edit yours freely without affecting
            theirs.
          </p>
          <div className="mt-4">
            <ClaimCopyButton token={token} />
          </div>
        </div>
      ) : (
        <AuthFlow
          next={next}
          heading="Sign in or create an account"
          subheading="Sign up to claim your own copy of this playbook. We'll send a code if you're new."
        />
      )}
    </div>
  );
}

function PreviewCard({
  playbookName,
  season,
  logoUrl,
  color,
  playCount,
  headCoachName,
}: {
  playbookName: string;
  season: string | null;
  logoUrl: string | null;
  color: string;
  playCount: number;
  headCoachName: string | null;
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
            Get your own copy of
          </p>
          <h1 className="mt-0.5 truncate text-xl font-extrabold tracking-tight text-foreground">
            {playbookName}
          </h1>
          {subline && (
            <p className="truncate text-sm text-muted">{subline}</p>
          )}
        </div>
      </div>
      <dl className="grid grid-cols-3 divide-x divide-border border-t border-border bg-surface text-xs">
        <Stat label="Plays" value={String(playCount)} />
        <Stat
          label="From"
          value={headCoachName ?? "—"}
          mutedWhenDash={!headCoachName}
        />
        <Stat label="You become" value="Owner" />
      </dl>
    </div>
  );
}

function Stat({
  label,
  value,
  mutedWhenDash = false,
}: {
  label: string;
  value: string;
  mutedWhenDash?: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-0.5 px-3 py-3 text-center">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted">
        {label}
      </dt>
      <dd
        className={`truncate text-sm font-semibold ${
          mutedWhenDash ? "text-muted" : "text-foreground"
        }`}
        title={value}
      >
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
