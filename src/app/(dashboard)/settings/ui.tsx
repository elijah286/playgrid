"use client";

import { useState } from "react";
import {
  BarChart3,
  CreditCard,
  KeyRound,
  MessageCircle,
  Settings as SettingsIcon,
  Sparkles,
  Ticket,
  Users,
} from "lucide-react";
import { UsersAdminClient, type AdminUserRow } from "@/features/admin/UsersAdminClient";
import { OpenAISettingsClient } from "@/features/admin/OpenAISettingsClient";
import { ResendSettingsClient } from "@/features/admin/ResendSettingsClient";
import { FeedbackAdminClient } from "@/features/admin/FeedbackAdminClient";
import { CoachInvitationsAdminClient } from "@/features/admin/CoachInvitationsAdminClient";
import { BillingAdminClient } from "@/features/admin/BillingAdminClient";
import { TrafficAdminClient } from "@/features/admin/TrafficAdminClient";
import { SiteSettingsAdminClient } from "@/features/admin/SiteSettingsAdminClient";
import { PlaybookSeedsAdminClient } from "@/features/admin/PlaybookSeedsAdminClient";
import type { SavedFormation } from "@/app/actions/formations";
import type { FeedbackRow } from "@/app/actions/feedback";
import type { CoachInvitationRow } from "@/app/actions/coach-invitations";
import type { GiftCodeRow } from "@/app/actions/admin-billing";
import type { StripeConfigStatus } from "@/lib/site/stripe-config";
import type { TrafficSummary } from "@/app/actions/admin-traffic";
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

type Tab =
  | "users"
  | "traffic"
  | "invites"
  | "payments"
  | "integrations"
  | "feedback"
  | "seeds"
  | "site";

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
  initialExamplesPageEnabled,
  initialTrafficSummary,
  trafficError,
  initialSeeds,
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
  initialExamplesPageEnabled: boolean;
  initialTrafficSummary: TrafficSummary;
  trafficError: string | null;
  initialSeeds: SavedFormation[];
}) {
  const [tab, setTab] = useState<Tab>("users");

  return (
    <div className="space-y-6">
      <SegmentedControl
        value={tab}
        onChange={setTab}
        options={[
          { value: "users", label: "Users", icon: Users },
          { value: "traffic", label: "Traffic", icon: BarChart3 },
          { value: "invites", label: "Coach invites", icon: Ticket },
          { value: "payments", label: "Payments", icon: CreditCard },
          { value: "integrations", label: "Integrations", icon: KeyRound },
          { value: "feedback", label: "Feedback", icon: MessageCircle },
          { value: "seeds", label: "Playbook seeds", icon: Sparkles },
          { value: "site", label: "Site", icon: SettingsIcon },
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

      {tab === "traffic" && (
        <TrafficAdminClient
          initialSummary={initialTrafficSummary}
          initialError={trafficError}
        />
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
        <FeedbackAdminClient
          initialItems={initialFeedback}
          initialError={feedbackError}
          initialWidgetEnabled={initialFeedbackWidgetEnabled}
        />
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

      {tab === "seeds" && (
        <PlaybookSeedsAdminClient initial={initialSeeds} />
      )}

      {tab === "site" && (
        <SiteSettingsAdminClient
          initialHideLobbyAnimation={initialHideLobbyAnimation}
          initialExamplesPageEnabled={initialExamplesPageEnabled}
        />
      )}
    </div>
  );
}
