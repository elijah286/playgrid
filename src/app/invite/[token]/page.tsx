import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { previewInviteAction } from "@/app/actions/invites";
import { AuthFlow } from "@/features/auth/AuthFlow";
import { AcceptInviteButton } from "./ui";

type Props = { params: Promise<{ token: string }> };

export default async function InvitePage({ params }: Props) {
  const { token } = await params;

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
  if (preview.exhausted) {
    return (
      <Frame title="Invite fully used">
        <p className="text-sm text-muted">This invite has reached its maximum uses.</p>
      </Frame>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const roleLabel = preview.role === "viewer" ? "Player" : "Coach";
  const next = `/invite/${token}`;
  const accent = preview.color || "#2563eb";

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
      />

      {user ? (
        <div className="rounded-2xl border border-border bg-surface-raised p-6 shadow-elevated">
          <p className="text-sm text-foreground">
            Signed in as <span className="font-semibold">{user.email}</span>
          </p>
          <p className="mt-1 text-xs text-muted">
            After you accept, the coach will approve your access before you can see plays.
          </p>
          <div className="mt-4">
            <AcceptInviteButton token={token} />
          </div>
        </div>
      ) : (
        <AuthFlow
          next={next}
          heading="Sign in or create an account"
          subheading="Enter your email to join. We'll send a code if you're new here."
          inviteCode={token}
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
}: {
  playbookName: string;
  teamName: string | null;
  season: string | null;
  logoUrl: string | null;
  color: string;
  playCount: number;
  roleLabel: string;
  headCoachName: string | null;
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
