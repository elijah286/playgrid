import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { getCurrentEntitlement, type SubscriptionTier } from "@/lib/billing/entitlement";
import { getFreeMaxPlaysPerPlaybook } from "@/lib/site/free-plays-config";
import { tierAtLeast } from "@/lib/billing/features";
import { getSeatUsage, getSeatCollaborators, getPendingCoachInvites, type SeatUsage, type SeatCollaborator, type PendingCoachInvite } from "@/lib/billing/seats";
import { DEVICE_ID_COOKIE } from "@/lib/auth/sessions";
import { getAiFeedbackOptInAction } from "@/app/actions/coach-ai-feedback";
import { AccountClient, type AccountSession } from "./ui";

export default async function AccountPage() {
  if (!hasSupabaseEnv()) redirect("/login");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const entitlement = await getCurrentEntitlement();
  // The admin-configured free-play cap (site_settings.free_max_plays_per_playbook)
  // — the current Free-tier limit, never the hardcoded default. Drives the
  // "N plays per playbook" line in the plan panel.
  const freeMaxPlays = await getFreeMaxPlaysPerPlaybook();
  const isCoachPlus = tierAtLeast(entitlement, "coach");
  let displayName: string | null = null;
  let avatarUrl: string | null = null;
  let sessions: AccountSession[] = [];
  let seatUsage: SeatUsage | null = null;
  let seatCollaborators: SeatCollaborator[] = [];
  let pendingCoachInvites: PendingCoachInvite[] = [];
  let pendingChange: { targetTier: SubscriptionTier; effectiveAt: string } | null = null;
  let pendingCancellation: { effectiveAt: string } | null = null;
  try {
    const admin = createServiceRoleClient();
    const [profileResult, sessionsResult] = await Promise.all([
      admin
        .from("profiles")
        .select("display_name, avatar_url")
        .eq("id", user.id)
        .maybeSingle(),
      admin
        .from("user_sessions")
        .select("id, device_id, device_label, created_at, last_seen_at, ip")
        .eq("user_id", user.id)
        .is("revoked_at", null)
        .order("last_seen_at", { ascending: false })
        .limit(20),
    ]);
    displayName = (profileResult.data?.display_name as string | null) ?? null;
    avatarUrl = (profileResult.data?.avatar_url as string | null) ?? null;
    const currentDeviceId = (await cookies()).get(DEVICE_ID_COOKIE)?.value ?? null;
    sessions = (sessionsResult.data ?? []).map((row) => ({
      id: row.id as string,
      label: (row.device_label as string | null) ?? "Unknown device",
      lastSeenAt: row.last_seen_at as string,
      createdAt: row.created_at as string,
      ip: (row.ip as string | null) ?? null,
      isCurrent: (row.device_id as string) === currentDeviceId,
    }));
  } catch {
    /* best effort */
  }

  const aiFeedbackRes = await getAiFeedbackOptInAction();
  const aiFeedbackStatus = aiFeedbackRes.ok ? aiFeedbackRes.status : "unanswered";

  try {
    const admin = createServiceRoleClient();
    const { data: subRow } = await admin
      .from("subscriptions")
      .select(
        "pending_change_tier, pending_change_effective_at, cancel_at_period_end, cancel_at, current_period_end",
      )
      .eq("user_id", user.id)
      .not("stripe_subscription_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (subRow?.pending_change_tier && subRow.pending_change_effective_at) {
      pendingChange = {
        targetTier: subRow.pending_change_tier as SubscriptionTier,
        effectiveAt: subRow.pending_change_effective_at as string,
      };
    }
    if (subRow?.cancel_at_period_end) {
      const effectiveAt =
        (subRow.cancel_at as string | null) ??
        (subRow.current_period_end as string | null) ??
        null;
      if (effectiveAt) pendingCancellation = { effectiveAt };
    }
  } catch {
    /* best effort — banner just won't render */
  }

  if (isCoachPlus) {
    try {
      const [usage, collabs, pending] = await Promise.all([
        getSeatUsage(user.id),
        getSeatCollaborators(user.id),
        getPendingCoachInvites(user.id),
      ]);
      seatUsage = usage;
      seatCollaborators = collabs;
      pendingCoachInvites = pending;
    } catch {
      /* best effort */
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/home"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
          Home
        </Link>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-foreground">Account</h1>
        <p className="mt-1 text-sm text-muted">
          Signed in as <span className="font-medium text-foreground">{user.email}</span>
        </p>
      </div>

      <AccountClient
        email={user.email ?? ""}
        displayName={displayName}
        avatarUrl={avatarUrl}
        entitlement={entitlement}
        sessions={sessions}
        seatUsage={seatUsage}
        seatCollaborators={seatCollaborators}
        pendingCoachInvites={pendingCoachInvites}
        aiFeedbackStatus={aiFeedbackStatus}
        freeMaxPlays={freeMaxPlays}
        pendingChange={pendingChange}
        pendingCancellation={pendingCancellation}
      />
    </div>
  );
}
