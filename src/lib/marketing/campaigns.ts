/**
 * Campaign registry — metadata the Marketing dashboard uses to label and
 * measure each touch. The conversion *action* for each campaign is computed in
 * the admin action (it needs DB queries); this holds the human-facing labels
 * and the attribution window.
 */
export type CampaignSource = "marketing_email_sends" | "reengagement_sends" | "digest_sends";

export type CampaignDef = {
  key: string;
  label: string;
  description: string;
  /** What "converted" means for this campaign, shown in the dashboard. */
  conversionLabel: string;
  /** Days after the send within which a conversion counts. */
  conversionWindowDays: number;
  /** Where this campaign's sends live (new unified table vs a legacy table). */
  source: CampaignSource;
  /** Recurring campaigns (digest) send repeatedly; one-shots send once/user. */
  recurring?: boolean;
};

export const CAMPAIGNS: CampaignDef[] = [
  {
    key: "team_invite_nudge",
    label: "Invite your team",
    description:
      "Auto-emailed to solo coaches ~a day after their 3rd play — nudges them to bring their team in for the season.",
    conversionLabel: "Invited a teammate",
    conversionWindowDays: 14,
    source: "marketing_email_sends",
  },
  {
    key: "referral_launch",
    label: "Referral launch",
    description: "One-time announcement of the referral program to active coaches.",
    conversionLabel: "Referred a coach",
    conversionWindowDays: 30,
    source: "marketing_email_sends",
  },
  {
    key: "reengagement",
    label: "Re-engagement nudge",
    description: "Stalled 1-play coaches nudged back with library recommendations (3d / 10d).",
    conversionLabel: "Came back active",
    conversionWindowDays: 14,
    source: "reengagement_sends",
  },
  {
    key: "digest",
    label: "Team digest",
    description: "Recurring per-playbook activity digest.",
    conversionLabel: "Returned within 3d",
    conversionWindowDays: 3,
    source: "digest_sends",
    recurring: true,
  },
];

export function campaignDef(key: string): CampaignDef | undefined {
  return CAMPAIGNS.find((c) => c.key === key);
}
