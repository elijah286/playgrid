"use client";

import { useState, useTransition } from "react";
import { CreditCard, KeyRound, MessageCircle, Ticket, Users } from "lucide-react";
import { UsersAdminClient, type AdminUserRow } from "@/features/admin/UsersAdminClient";
import { OpenAISettingsClient } from "@/features/admin/OpenAISettingsClient";
import { ResendSettingsClient } from "@/features/admin/ResendSettingsClient";
import { FeedbackAdminClient } from "@/features/admin/FeedbackAdminClient";
import { CoachInvitationsAdminClient } from "@/features/admin/CoachInvitationsAdminClient";
import { BillingAdminClient } from "@/features/admin/BillingAdminClient";
import type { FeedbackRow } from "@/app/actions/feedback";
import type { CoachInvitationRow } from "@/app/actions/coach-invitations";
import type { GiftCodeRow } from "@/app/actions/admin-billing";
import type { StripeConfigStatus } from "@/lib/site/stripe-config";
import { SegmentedControl, useToast } from "@/components/ui";
import { setHideLobbyAnimationAction } from "@/app/actions/admin-lobby";

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

type Tab = "users" | "invites" | "payments" | "integrations" | "feedback";

export function SettingsClient({
  currentUserId,
  initialUsers,
  usersError,
  integration,
  resend,
  initialFeedback,
  feedbackError,
  initialFeedbackWidgetEnabled,
  initialInvites,
  invitesError,
  initialGiftCodes,
  giftCodesError,
  stripeStatus,
  initialCoachAiEnabled,
  initialHideLobbyAnimation,
}: {
  currentUserId: string;
  initialUsers: AdminUserRow[];
  usersError: string | null;
  integration: IntegrationProps;
  resend: ResendProps;
  initialFeedback: FeedbackRow[];
  feedbackError: string | null;
  initialFeedbackWidgetEnabled: boolean;
  initialInvites: CoachInvitationRow[];
  invitesError: string | null;
  initialGiftCodes: GiftCodeRow[];
  giftCodesError: string | null;
  stripeStatus: StripeConfigStatus;
  initialCoachAiEnabled: boolean;
  initialHideLobbyAnimation: boolean;
}) {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("users");
  const [hideLobbyAnimation, setHideLobbyAnimation] = useState(initialHideLobbyAnimation);
  const [lobbyPending, startLobbyTransition] = useTransition();

  function toggleLobbyAnimation(next: boolean) {
    const prev = hideLobbyAnimation;
    setHideLobbyAnimation(next);
    startLobbyTransition(async () => {
      const res = await setHideLobbyAnimationAction(next);
      if (!res.ok) {
        setHideLobbyAnimation(prev);
        toast(res.error, "error");
        return;
      }
      toast(
        next ? "Lobby animation hidden." : "Lobby animation restored.",
        "success",
      );
    });
  }

  return (
    <div className="space-y-6">
      <SegmentedControl
        value={tab}
        onChange={setTab}
        options={[
          { value: "users", label: "Users", icon: Users },
          { value: "invites", label: "Coach invites", icon: Ticket },
          { value: "payments", label: "Payments", icon: CreditCard },
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

      {tab === "payments" && (
        <BillingAdminClient
          initialCodes={initialGiftCodes}
          initialError={giftCodesError}
          stripeStatus={stripeStatus}
          initialCoachAiEnabled={initialCoachAiEnabled}
        />
      )}

      {tab === "feedback" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface-raised p-4">
            <div>
              <p className="text-sm font-semibold text-foreground">
                Hide playbook animation on lobby
              </p>
              <p className="mt-0.5 text-xs text-muted">
                When on, the Preview/Simple toggle is hidden and the lobby
                always renders the simple card view.
              </p>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={hideLobbyAnimation}
                disabled={lobbyPending}
                onChange={(e) => toggleLobbyAnimation(e.target.checked)}
              />
              <span>{hideLobbyAnimation ? "On" : "Off"}</span>
            </label>
          </div>
          <FeedbackAdminClient
            initialItems={initialFeedback}
            initialError={feedbackError}
            initialWidgetEnabled={initialFeedbackWidgetEnabled}
          />
        </div>
      )}

      {tab === "integrations" && (
        <div className="space-y-4">
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
