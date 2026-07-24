import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getRequestUser } from "@/lib/supabase/request-user";
import { createClient } from "@/lib/supabase/server";
import { listPlaybookMessagesAction } from "@/app/actions/playbook-messages";
import { PlaybookMessagesTab } from "@/features/messages/PlaybookMessagesTab";
import { MessagesList } from "../MessagesList";

/**
 * A single team's channel — reuses the production PlaybookMessagesTab verbatim
 * (real-time Supabase stream, same posting/moderation), fed the same
 * server-side initial state the production playbook page uses. One channel per
 * team; no fork.
 */
export default async function TeamChannelPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const auth = await getRequestUser();
  const user = auth.kind === "ok" ? auth.user : null;
  if (!user) redirect("/login");

  const supabase = await createClient();
  const [profileRes, pbRes, memRes, msgRes] = await Promise.all([
    supabase.from("profiles").select("display_name, avatar_url").eq("id", user.id).maybeSingle(),
    supabase.from("playbooks").select("name").eq("id", teamId).maybeSingle(),
    supabase
      .from("playbook_members")
      .select("role")
      .eq("playbook_id", teamId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle(),
    listPlaybookMessagesAction(teamId),
  ]);

  const pb = pbRes.data as { name: string } | null;
  const mem = memRes.data as { role: "owner" | "editor" | "viewer" } | null;
  if (!pb || !mem) notFound();

  const profile = profileRes.data as
    | { display_name: string | null; avatar_url: string | null }
    | null;

  return (
    // Desktop (sm:+): master-detail — the persistent conversation list on the
    // left, this thread on the right. Mobile: just the focused thread (the
    // bottom nav is hidden here by PreviewBottomNav) with a back link to the
    // hub. The chat renders inline (layout="inline") so it stays inside the
    // shell's bounded main scroll frame.
    <div className="flex h-full gap-4">
      <aside className="hidden w-80 shrink-0 flex-col overflow-y-auto sm:flex">
        <h1 className="mb-3 text-lg font-extrabold tracking-tight text-foreground">Team Messages</h1>
        <MessagesList selectedTeamId={teamId} />
      </aside>

      {/* The thread fills the screen (iMessage-style): edge-to-edge on mobile
          with the composer pinned at the bottom; a bordered panel on desktop. */}
      <div className="mx-auto flex h-full min-w-0 max-w-2xl flex-1 flex-col">
        <Link
          href="/app/messages"
          className="inline-flex items-center gap-1 px-4 pt-3 pb-2 text-sm font-semibold text-muted transition-colors hover:text-foreground sm:hidden"
        >
          <ArrowLeft className="size-4" aria-hidden />
          All messages
        </Link>
        <div className="min-h-0 flex-1 overflow-hidden bg-surface-raised sm:rounded-xl sm:border sm:border-border">
          <PlaybookMessagesTab
            playbookId={teamId}
            playbookName={pb.name}
            viewer={{
              id: user.id,
              displayName: profile?.display_name ?? null,
              avatarUrl: profile?.avatar_url ?? null,
            }}
            viewerRole={mem.role}
            layout="inline"
            initial={{
              messages: msgRes.ok ? msgRes.messages : [],
              hasMore: msgRes.ok ? msgRes.hasMore : false,
              messagingEnabled: msgRes.ok ? msgRes.messagingEnabled : true,
            }}
          />
        </div>
      </div>
    </div>
  );
}
