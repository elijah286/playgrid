"use client";

import { useState } from "react";
import { KeyRound, MessageCircle, Ticket, Users } from "lucide-react";
import { UsersAdminClient, type AdminUserRow } from "@/features/admin/UsersAdminClient";
import { OpenAISettingsClient } from "@/features/admin/OpenAISettingsClient";
import { ResendSettingsClient } from "@/features/admin/ResendSettingsClient";
import { FeedbackAdminClient } from "@/features/admin/FeedbackAdminClient";
import { CoachInvitationsAdminClient } from "@/features/admin/CoachInvitationsAdminClient";
import type { FeedbackRow } from "@/app/actions/feedback";
import type { CoachInvitationRow } from "@/app/actions/coach-invitations";
import { SegmentedControl } from "@/components/ui";

type IntegrationProps =
  | { ok: true; configured: boolean; statusLabel: string; updatedAt: string | null }
  | { ok: false; error: string };

type ResendProps =
  | {
      ok: true;
      configured: boolean;
      statusLabel: string;
      fromEmail: string | null;
      contactToEmail: string | null;
      updatedAt: string | null;
    }
  | { ok: false; error: string };

type Tab = "users" | "invites" | "integrations" | "feedback";

export function SettingsClient({
  currentUserId,
  initialUsers,
  usersError,
  integration,
  resend,
  initialFeedback,
  feedbackError,
  initialInvites,
  invitesError,
}: {
  currentUserId: string;
  initialUsers: AdminUserRow[];
  usersError: string | null;
  integration: IntegrationProps;
  resend: ResendProps;
  initialFeedback: FeedbackRow[];
  feedbackError: string | null;
  initialInvites: CoachInvitationRow[];
  invitesError: string | null;
}) {
  const [tab, setTab] = useState<Tab>("users");

  return (
    <div className="space-y-6">
      <SegmentedControl
        value={tab}
        onChange={setTab}
        options={[
          { value: "users", label: "Users", icon: Users },
          { value: "invites", label: "Coach invites", icon: Ticket },
          { value: "integrations", label: "Integrations", icon: KeyRound },
          { value: "feedback", label: "Feedback", icon: MessageCircle },
        ]}
      />

      {tab === "users" && (
        <div>
          {usersError ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950 ring-1 ring-amber-200">
              {usersError}
            </p>
          ) : (
            <UsersAdminClient initialUsers={initialUsers} currentUserId={currentUserId} />
          )}
        </div>
      )}

      {tab === "invites" && (
        <CoachInvitationsAdminClient
          initialItems={initialInvites}
          initialError={invitesError}
        />
      )}

      {tab === "feedback" && (
        <FeedbackAdminClient
          initialItems={initialFeedback}
          initialError={feedbackError}
        />
      )}

      {tab === "integrations" && (
        <div className="space-y-8">
          {integration.ok ? (
            <OpenAISettingsClient
              initial={{
                configured: integration.configured,
                statusLabel: integration.statusLabel,
                updatedAt: integration.updatedAt,
              }}
            />
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-red-700 dark:text-red-300">{integration.error}</p>
              <p className="text-sm text-muted">
                Saving keys requires <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code> on the
                app server so secrets are not exposed to browsers.
              </p>
            </div>
          )}

          {resend.ok ? (
            <ResendSettingsClient
              initial={{
                configured: resend.configured,
                statusLabel: resend.statusLabel,
                fromEmail: resend.fromEmail,
                contactToEmail: resend.contactToEmail,
                updatedAt: resend.updatedAt,
              }}
            />
          ) : (
            <p className="text-sm text-red-700 dark:text-red-300">{resend.error}</p>
          )}
        </div>
      )}
    </div>
  );
}
