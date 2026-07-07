"use client";

/**
 * Plain-English referral terms, shown as a compact collapsible disclosure on
 * every promo surface (account "Refer coaches" card + the share dialog). Spells
 * out the actual qualifying condition — a NEW account + a first real play — so a
 * coach isn't left guessing why a link click didn't earn a reward. Reads the
 * same numbers the awarder enforces (cap, recipient trial days) so copy can't
 * drift from behavior.
 */
export function ReferralTerms({
  perReferralLabel,
  recipientTrialDays,
  capAwards,
  className,
}: {
  perReferralLabel: string;
  recipientTrialDays: number;
  capAwards: number | null;
  className?: string;
}) {
  return (
    <details className={`group text-xs text-muted ${className ?? ""}`}>
      <summary className="cursor-pointer list-none font-medium text-muted underline decoration-dotted underline-offset-2 hover:text-foreground">
        How the reward works
      </summary>
      <ul className="mt-2 list-disc space-y-1 pl-4 leading-relaxed">
        <li>
          You earn <span className="font-medium text-foreground">{perReferralLabel}</span> when a
          coach signs up for a new XO&nbsp;Gridmaker account from your link and creates their first
          play.
        </li>
        <li>
          A link click or a signup alone doesn&rsquo;t qualify — the coach has to actually get
          started by building a play in their own playbook.
        </li>
        {recipientTrialDays > 0 ? (
          <li>The coach you refer starts with {recipientTrialDays} days of Team Coach, too.</li>
        ) : null}
        {capAwards !== null ? (
          <li>One reward per coach you refer, up to {capAwards} rewarded referrals.</li>
        ) : null}
        <li>
          Rewards are for bringing in new coaches. Adding players or co-coaches to a team you
          already own doesn&rsquo;t count.
        </li>
      </ul>
    </details>
  );
}
