import type { SupabaseClient } from "@supabase/supabase-js";

export type InboxEventKind = "membership" | "coach_upgrade" | "roster_claim";
export type InboxEventAction = "approved" | "rejected";

export type InboxEventDetail = {
  rosterLabel?: string | null;
  jerseyNumber?: string | null;
  role?: "owner" | "editor" | "viewer" | null;
  note?: string | null;
};

/**
 * Append a row to inbox_events. Best-effort — the caller's primary mutation
 * (approve/deny) must already have succeeded; an audit-log failure should
 * never roll back the user-visible action. Errors are logged and swallowed.
 */
export async function recordInboxEvent(
  supabase: SupabaseClient,
  args: {
    playbookId: string;
    kind: InboxEventKind;
    action: InboxEventAction;
    subjectUserId: string | null;
    subjectDisplayName: string | null;
    detail?: InboxEventDetail;
    resolvedBy: string;
  },
): Promise<void> {
  const { error } = await supabase.from("inbox_events").insert({
    playbook_id: args.playbookId,
    kind: args.kind,
    action: args.action,
    subject_user_id: args.subjectUserId,
    subject_display_name: args.subjectDisplayName,
    detail: args.detail ?? {},
    resolved_by: args.resolvedBy,
  });
  if (error) {
    console.warn("[inbox_events] insert failed:", error.message);
  }
}

/** Look up a profile's display_name; null on miss. */
export async function lookupDisplayName(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();
  return (data?.display_name as string | null) ?? null;
}
