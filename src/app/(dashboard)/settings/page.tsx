import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentUserProfile } from "@/app/actions/admin-guard";
import { listUsersForAdminAction } from "@/app/actions/admin-users";
import { getOpenAIIntegrationStatusAction } from "@/app/actions/admin-integrations";
import { getResendStatusAction } from "@/app/actions/admin-resend";
import {
  getFeedbackWidgetEnabledAction,
  listFeedbackForAdminAction,
} from "@/app/actions/feedback";
import { listCoachInvitationsAction } from "@/app/actions/coach-invitations";
import { SettingsClient } from "./ui";

export default async function SettingsPage() {
  const { user, profile } = await getCurrentUserProfile();
  if (!user) redirect("/login");
  if (profile?.role !== "admin") redirect("/home");

  const [usersRes, integrationRes, resendRes, feedbackRes, invitesRes, feedbackWidgetRes] =
    await Promise.all([
      listUsersForAdminAction(),
      getOpenAIIntegrationStatusAction(),
      getResendStatusAction(),
      listFeedbackForAdminAction(),
      listCoachInvitationsAction(),
      getFeedbackWidgetEnabledAction(),
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
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-foreground">Site admin</h1>
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
        resend={
          resendRes.ok
            ? {
                ok: true,
                configured: resendRes.configured,
                statusLabel: resendRes.statusLabel,
                fromEmail: resendRes.fromEmail,
                contactToEmail: resendRes.contactToEmail,
                updatedAt: resendRes.updatedAt,
              }
            : { ok: false, error: resendRes.error }
        }
        initialFeedback={feedbackRes.ok ? feedbackRes.items : []}
        feedbackError={feedbackRes.ok ? null : feedbackRes.error}
        initialFeedbackWidgetEnabled={feedbackWidgetRes.enabled}
        initialInvites={invitesRes.ok ? invitesRes.items : []}
        invitesError={invitesRes.ok ? null : invitesRes.error}
      />
    </div>
  );
}
