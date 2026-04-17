import Link from "next/link";
import { redirect } from "next/navigation";
import { listUsersForAdminAction } from "@/app/actions/admin-users";
import { getCurrentUserProfile } from "@/app/actions/admin-guard";
import { UsersAdminClient } from "@/features/admin/UsersAdminClient";

export default async function AdminUsersPage() {
  const { user, profile } = await getCurrentUserProfile();
  if (!user) redirect("/login");
  if (profile?.role !== "admin") redirect("/playbooks");

  const res = await listUsersForAdminAction();
  if (!res.ok) {
    return (
      <div>
        <p className="text-sm text-red-700">{res.error}</p>
        <Link href="/playbooks" className="mt-4 inline-block text-sm text-pg-signal">
          Back
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/playbooks" className="text-sm text-pg-subtle hover:text-pg-ink">
            ← Playbooks
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-pg-ink">Site admin</h1>
          <p className="mt-1 text-sm text-pg-muted">
            Create users and assign roles. Deletes remove the account from Supabase Auth.
          </p>
          <nav className="mt-3 flex flex-wrap gap-3 text-sm">
            <span className="font-medium text-pg-ink">Users</span>
            <span className="text-pg-muted">·</span>
            <Link
              href="/admin/integrations"
              className="text-pg-muted underline-offset-4 hover:text-pg-ink hover:underline"
            >
              Integrations
            </Link>
          </nav>
        </div>
      </div>
      <UsersAdminClient initialUsers={res.users} currentUserId={user.id} />
    </div>
  );
}
