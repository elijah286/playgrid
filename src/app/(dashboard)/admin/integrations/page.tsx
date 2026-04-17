import Link from "next/link";
import { redirect } from "next/navigation";
import { getOpenAIIntegrationStatusAction } from "@/app/actions/admin-integrations";
import { getCurrentUserProfile } from "@/app/actions/admin-guard";
import { OpenAISettingsClient } from "@/features/admin/OpenAISettingsClient";

export default async function AdminIntegrationsPage() {
  const { user, profile } = await getCurrentUserProfile();
  if (!user) redirect("/login");
  if (profile?.role !== "admin") redirect("/playbooks");

  const status = await getOpenAIIntegrationStatusAction();
  if (!status.ok) {
    return (
      <div className="space-y-4">
        <Link href="/playbooks" className="text-sm text-pg-subtle hover:text-pg-ink">
          ← Playbooks
        </Link>
        <p className="text-sm text-red-700 dark:text-red-300">{status.error}</p>
        <p className="text-sm text-pg-muted">
          Saving keys requires <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code> on the app server
          so secrets are not exposed to browsers.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/playbooks" className="text-sm text-pg-subtle hover:text-pg-ink">
          ← Playbooks
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-pg-ink dark:text-pg-chalk">Integrations</h1>
        <p className="mt-1 text-sm text-pg-muted">Connect external services for the whole site.</p>
      </div>

      <nav className="flex flex-wrap gap-3 text-sm">
        <Link
          href="/admin/users"
          className="text-pg-muted underline-offset-4 hover:text-pg-ink hover:underline dark:hover:text-pg-chalk"
        >
          Users
        </Link>
        <span className="text-pg-muted">·</span>
        <span className="font-medium text-pg-ink dark:text-pg-chalk">Integrations</span>
      </nav>

      <OpenAISettingsClient
        initial={{
          configured: status.configured,
          statusLabel: status.statusLabel,
          updatedAt: status.updatedAt,
        }}
      />
    </div>
  );
}
