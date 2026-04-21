/**
 * Master kill-switch for the billing/monetization UI and enforcement.
 * When false: no plan picker, no paywalls, no Stripe calls. Every user behaves
 * as if they have full access (current behavior pre-launch).
 *
 * Flip to 'true' in prod env only after migration is applied, Stripe is
 * configured in live mode, and grandfathered comps are verified.
 */
export const BILLING_ENABLED =
  process.env.NEXT_PUBLIC_BILLING_ENABLED === "true";
