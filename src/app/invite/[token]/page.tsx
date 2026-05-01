import type { Metadata } from "next";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { previewInviteAction } from "@/app/actions/invites";
import { AuthFlow } from "@/features/auth/AuthFlow";
import { getAuthProvidersConfig } from "@/lib/site/auth-providers-config";
import { SPORT_VARIANT_LABELS } from "@/domain/play/factory";
import type { SportVariant } from "@/domain/play/types";
import { AcceptInviteButton } from "./ui";

type Props = { params: Promise<{ token: string }> };

function buildInviteTitle(preview: {
  playbook_name: string;
  sport_variant: string | null;
  season: string | null;
}): string {
  // playbook_name is the team's real display name as set by the owner.
  // teams.name is a stale default ("Varsity") the user can't edit from the
  // playbook UI, so we never show it.
  const parts: string[] = [preview.playbook_name];
  const variantLabel = preview.sport_variant
    ? SPORT_VARIANT_LABELS[preview.sport_variant as SportVariant]
    : null;
  if (variantLabel) parts.push(variantLabel);
  if (preview.season) parts.push(preview.season);
  return `You're invited to the Playbook for ${parts.join(" ")}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  if (!hasSupabaseEnv()) return { title: "Invite · XO Gridmaker" };
  const res = await previewInviteAction(token);
  if (!res.ok || res.preview.revoked || res.preview.expired) {
    return { title: "Invite · XO Gridmaker" };
  }
  const title = buildInviteTitle(res.preview);
  const description = res.preview.head_coach_name
    ? `Join ${res.preview.head_coach_name}'s playbook on XO Gridmaker.`
    : "Join this team's playbook on XO Gridmaker.";
  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function InvitePage({ params }: Props) {
  const { token } = await params;
  const authProviders = await getAuthProvidersConfig();

  if (!hasSupabaseEnv()) {
    return (
      <Frame title="Invite link">
        <p className="text-sm text-muted">Configure Supabase to use invites.</p>
      </Frame>
    );
  }

  const previewRes = await previewInviteAction(token);
  if (!previewRes.ok) {
    return (
      <Frame title="Invite not found">
        <p className="text-sm text-muted">{previewRes.error}</p>
      </Frame>
    );
  }
  const preview = previewRes.preview;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Smart deep-link: if the recipient is already an active member of this
  // playbook, the invite landing page is just a speed bump. Redirect
  // straight to the playbook so a forwarded link "just works" as a
  // shortcut for people who already have access.
  if (user && !preview.revoked && !preview.expired && !preview.exhausted) {
    const { data: existingMembership } = await supabase
      .from("playbook_members")
      .select("playbook_id")
      .eq("playbook_id", preview.playbook_id)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    if (existingMembership) {
      const { redirect } = await import("next/navigation");
      redirect(`/playbooks/${preview.playbook_id}`);
    }
  }

  // If the link is dead (revoked / expired / fully used) but the signed-in
  // user is already a member of the target playbook, route them in instead
  // of dead-ending. Common case: someone who used their own single-use
  // link and later clicks it again.
  const isDead = preview.revoked || preview.expired || preview.exhausted;
  if (isDead) {
    let alreadyMember = false;
    if (user) {
      const { data: m } = await supabase
        .from("playbook_members")
        .select("status")
        .eq("playbook_id", preview.playbook_id)
        .eq("user_id", user.id)
        .maybeSingle();
      alreadyMember = m?.status === "active";
    }
    if (alreadyMember) {
      return (
        <Frame title="You're already on this playbook">
          <p className="text-sm text-muted">
            This invite link has already been used, but you have access to
            <span className="font-semibold text-foreground"> {preview.playbook_name}</span>.
          </p>
          <a
            href={`/playbooks/${preview.playbook_id}`}
            className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary/90"
          >
            Open playbook
          </a>
        </Frame>
      );
    }
    if (preview.revoked) {
      return (
        <Frame title="Invite revoked">
          <p className="text-sm text-muted">This invite was revoked by the coach.</p>
        </Frame>
      );
    }
    if (preview.expired) {
      return (
        <Frame title="Invite expired">
          <p className="text-sm text-muted">Ask the coach for a new link.</p>
        </Frame>
      );
    }
    return (
      <Frame title="Invite fully used">
        <p className="text-sm text-muted">This invite has reached its maximum uses.</p>
      </Frame>
    );
  }

  const isCoachInvite = preview.role === "editor";
  const roleLabel = isCoachInvite ? "Coach" : "Player";
  const next = `/invite/${token}`;
  const accent = preview.color || "#2563eb";

  // Pick the right "what happens next" line. Coach invites are usually
  // auto-approved; player invites usually need owner approval.
  const accessLine = preview.auto_approve
    ? isCoachInvite
      ? "Tap accept and you're in — full coach access immediately, no approval needed."
      : "Tap accept and you're in — you'll see plays right away."
    : isCoachInvite
      ? "After you accept, the playbook owner will approve your coach access."
      : "After you accept, the coach will approve your access before you can see plays.";

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5 px-6 pb-16 pt-10 sm:pt-16">
      <PreviewCard
        playbookName={preview.playbook_name}
        teamName={preview.team_name}
        season={preview.season}
        logoUrl={preview.logo_url}
        color={accent}
        playCount={preview.play_count}
        roleLabel={roleLabel}
        headCoachName={preview.head_coach_name}
        isCoachInvite={isCoachInvite}
      />

      {user ? (
        <div className="rounded-2xl border border-border bg-surface-raised p-6 shadow-elevated">
          <p className="text-sm text-foreground">
            Signed in as <span className="font-semibold">{user.email}</span>
          </p>
          <p className="mt-1 text-xs text-muted">{accessLine}</p>
          <div className="mt-4">
            <AcceptInviteButton
              token={token}
              askPositions={preview.role === "viewer"}
              isCoachInvite={isCoachInvite}
            />
          </div>
        </div>
      ) : (
        <AuthFlow
          next={next}
          heading="Sign in or create an account"
          subheading="Enter your email to join. We'll send a code if you're new here."
          inviteCode={token}
          appleEnabled={authProviders.apple}
          googleEnabled={authProviders.google}
        />
      )}
    </div>
  );
}

function PreviewCard({
  playbookName,
  teamName,
  season,
  logoUrl,
  color,
  playCount,
  roleLabel,
  headCoachName,
  isCoachInvite,
}: {
  playbookName: string;
  teamName: string | null;
  season: string | null;
  logoUrl: string | null;
  color: string;
  playCount: number;
  roleLabel: string;
  headCoachName: string | null;
  isCoachInvite: boolean;
}) {
  // teamName comes from teams.name, which the user can't edit from the
  // playbook UI and is often stale ("Varsity" default). Only show season.
  void teamName;
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
            You&rsquo;re invited to
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
          label="Head coach"
          value={headCoachName ?? "—"}
          mutedWhenDash={!headCoachName}
        />
        <Stat label="Your role" value={roleLabel} />
      </dl>
      <PermissionsList isCoachInvite={isCoachInvite} />
    </div>
  );
}

function PermissionsList({ isCoachInvite }: { isCoachInvite: boolean }) {
  const items = isCoachInvite
    ? [
        "Add, edit, and delete plays",
        "Duplicate the playbook into your own copy",
        "Copy plays out to your other playbooks",
        "Share the playbook with players and other coaches",
        "Customize team settings (name, colors, logo)",
        "Print and export playbook PDFs",
      ]
    : ["View plays the coach shares with you"];
  return (
    <div className="border-t border-border bg-surface px-5 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
        {isCoachInvite ? "As a coach you'll be able to" : "What you'll see"}
      </p>
      <ul className="mt-2 space-y-1 text-xs text-foreground">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2">
            <span aria-hidden="true" className="mt-1 size-1.5 shrink-0 rounded-full bg-foreground/40" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
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
