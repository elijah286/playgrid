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

  const roleLabel = preview.role === "viewer" ? "Player (view-only)" : "Coach (edit)";
  const next = `/invite/${token}`;
  const accent = preview.color || "#2563eb";

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-12">
      <PreviewCard
        playbookName={preview.playbook_name}
        teamName={preview.team_name}
        season={preview.season}
        logoUrl={preview.logo_url}
        color={accent}
        playCount={preview.play_count}
        roleLabel={roleLabel}
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
}: {
  playbookName: string;
  teamName: string | null;
  season: string | null;
  logoUrl: string | null;
  color: string;
  playCount: number;
  roleLabel: string;
}) {
  return (
    <div
      className="overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-elevated"
      style={{ borderTopWidth: 4, borderTopColor: color }}
    >
      <div className="flex items-center gap-4 p-6">
        {logoUrl ? (
          <Image
            src={logoUrl}
            alt=""
            width={64}
            height={64}
            className="size-16 rounded-xl object-cover"
            unoptimized
          />
        ) : (
          <div
            className="flex size-16 items-center justify-center rounded-xl text-2xl font-extrabold text-white"
            style={{ backgroundColor: color }}
          >
            {(teamName ?? playbookName).slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            You&rsquo;re invited to
          </p>
          <h1 className="truncate text-xl font-extrabold tracking-tight text-foreground">
            {playbookName}
          </h1>
          {teamName && (
            <p className="truncate text-sm text-muted">
              {teamName}
              {season ? ` · ${season}` : ""}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-border bg-surface px-6 py-3 text-xs text-muted">
        <span>
          <span className="font-semibold text-foreground">{playCount}</span>{" "}
          {playCount === 1 ? "play" : "plays"}
        </span>
        <span>
          Role: <span className="font-semibold text-foreground">{roleLabel}</span>
        </span>
      </div>
    </div>
  );
}

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <div className="rounded-2xl border border-border bg-surface-raised p-6 shadow-elevated">
        <h1 className="text-xl font-extrabold tracking-tight text-foreground">{title}</h1>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}
