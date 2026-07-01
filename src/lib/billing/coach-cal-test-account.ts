/**
 * The single account allowed to self-reset its free Coach Cal prompt counter,
 * so the owner can repeatedly walk through the brand-new-free-user experience.
 * Shared by the reset route (the actual guard) and the trial-status action
 * (which reports `canReset` so the chat banner can show a small "(reset)"
 * link — and ONLY to this account). Compare case-insensitively.
 */
export const COACH_CAL_FREE_TRIAL_RESET_EMAIL = "elijah.kerry@emerson.com";
