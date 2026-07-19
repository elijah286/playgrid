import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getRequestUser } from "@/lib/supabase/request-user";
import { createClient } from "@/lib/supabase/server";
import { listPlaybookMessagesAction } from "@/app/actions/playbook-messages";
import { PlaybookMessagesTab } from "@/features/messages/PlaybookMessagesTab";

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
    // Fill the shell's main scroll frame (main is a bounded flex child whose
    // pb-24 already reserves the fixed bottom nav), so the composer always
    // lands above the nav regardless of ribbon/header height. The chat renders
    // inline (layout="inline") so it stays inside this frame rather than
    // position:fixed'ing to the production header/nav offsets.
    <div className="mx-auto flex h-full max-w-2xl flex-col">
      <Link
        href="/app/messages"
        className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All messages
      </Link>
      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-surface-raised">
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
  );
}
