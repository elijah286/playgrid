import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentUserProfile } from "@/app/actions/admin-guard";
import { listUsersForAdminAction } from "@/app/actions/admin-users";
import { getOpenAIIntegrationStatusAction } from "@/app/actions/admin-integrations";
import { SettingsClient } from "./ui";

export default async function SettingsPage() {
  const { user, profile } = await getCurrentUserProfile();
  if (!user) redirect("/login");
  if (profile?.role !== "admin") redirect("/home");

  const [usersRes, integrationRes] = await Promise.all([
    listUsersForAdminAction(),
    getOpenAIIntegrationStatusAction(),
  ]);

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
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-foreground">Site Admin</h1>
        <p className="mt-1 text-sm text-muted">Manage users and integrations.</p>
      </div>

      <SettingsClient
        currentUserId={user.id}
        initialUsers={usersRes.ok ? usersRes.users : []}
        usersError={usersRes.ok ? null : usersRes.error}
        integration={
          integrationRes.ok
            ? {
                ok: true,
                configured: integrationRes.configured,
                statusLabel: integrationRes.statusLabel,
                updatedAt: integrationRes.updatedAt,
              }
            : { ok: false, error: integrationRes.error }
        }
      />
    </div>
  );
}
