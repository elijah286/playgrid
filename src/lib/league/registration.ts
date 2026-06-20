import "server-only";

/**
 * Registration status model (Track A) — the lifecycle state machine and its
 * legal transitions. Kept as pure data + functions so the rules are unit-tested
 * and reused by both the admin console and any AI-assisted ops (Leo).
 */

export const REGISTRATION_STATUSES = [
  "submitted",
  "approved",
  "rostered",
  "waitlisted",
  "rejected",
  "withdrawn",
] as const;

export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

/**
 * Allowed forward transitions. `rostered` only leaves via `withdrawn`; `rejected`
 * can be reconsidered back to `submitted`; `withdrawn` is terminal.
 */
const ALLOWED_TRANSITIONS: Record<RegistrationStatus, readonly RegistrationStatus[]> = {
  submitted: ["approved", "waitlisted", "rejected", "withdrawn"],
  approved: ["rostered", "waitlisted", "rejected", "withdrawn"],
  rostered: ["withdrawn"],
  waitlisted: ["approved", "rejected", "withdrawn"],
  rejected: ["submitted"],
  withdrawn: [],
};

export function canTransition(
  from: RegistrationStatus,
  to: RegistrationStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function allowedTransitions(
  from: RegistrationStatus,
): readonly RegistrationStatus[] {
  return ALLOWED_TRANSITIONS[from] ?? [];
}

/** Statuses an operator treats as "needs a roster home" (the unrostered queue). */
export function isUnrostered(status: RegistrationStatus): boolean {
  return status === "approved" || status === "waitlisted";
}

/** Statuses that count as active participation in the league. */
export function isActiveRegistration(status: RegistrationStatus): boolean {
  return status === "approved" || status === "rostered" || status === "waitlisted";
}
