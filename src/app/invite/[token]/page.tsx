import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { previewInviteAction } from "@/app/actions/invites";
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

  return (
    <Frame title={`You've been invited to ${preview.playbook_name}`}>
      <p className="text-sm text-muted">
        Role on accept: <span className="font-semibold text-foreground">{roleLabel}</span>
      </p>
      <p className="mt-2 text-xs text-muted">
        After you accept, the coach will need to approve your access before you can see plays.
      </p>

      {user ? (
        <div className="mt-6">
          <AcceptInviteButton token={token} />
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-2">
          <Link
            href={`/login?next=${encodeURIComponent(next)}`}
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-white hover:bg-primary/90"
          >
            Sign in to accept
          </Link>
          <p className="text-xs text-muted">
            New here? Create an account on the same screen — you&apos;ll come right back to this invite.
          </p>
        </div>
      )}
    </Frame>
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
