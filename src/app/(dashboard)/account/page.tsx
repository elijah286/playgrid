import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { getCurrentEntitlement } from "@/lib/billing/entitlement";
import { tierAtLeast } from "@/lib/billing/features";
import { getSeatUsage, getSeatCollaborators, getPendingCoachInvites, type SeatUsage, type SeatCollaborator, type PendingCoachInvite } from "@/lib/billing/seats";
import { DEVICE_ID_COOKIE } from "@/lib/auth/sessions";
import { AccountClient, type AccountSession } from "./ui";

export default async function AccountPage() {
  if (!hasSupabaseEnv()) redirect("/login");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const entitlement = await getCurrentEntitlement();
  const isCoachPlus = tierAtLeast(entitlement, "coach");
  let displayName: string | null = null;
  let avatarUrl: string | null = null;
  let sessions: AccountSession[] = [];
  let seatUsage: SeatUsage | null = null;
  let seatCollaborators: SeatCollaborator[] = [];
  let pendingCoachInvites: PendingCoachInvite[] = [];
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
      />
    </div>
  );
}
