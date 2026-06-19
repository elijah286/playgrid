/**
 * Shared types + constants for content reporting (App Store Guideline 1.2).
 * Used by the report dialog, the user-facing action, and the admin queue so the
 * categories stay in lockstep. The string unions mirror the CHECK constraints
 * in the content_reports migration.
 */

export const REPORT_CONTENT_TYPES = [
  "playbook_message",
  "shared_play",
  "profile",
  "cal_response",
  "other",
] as const;
export type ReportContentType = (typeof REPORT_CONTENT_TYPES)[number];

/** Reason categories shown in the report dialog. `value` is stored; `label` is
 *  the human-facing option. */
export const REPORT_REASONS = [
  { value: "hate_or_harassment", label: "Hateful or harassing" },
  { value: "sexual", label: "Sexual or explicit" },
  { value: "violence_or_threats", label: "Violence or threats" },
  { value: "spam_or_scam", label: "Spam or scam" },
  { value: "other", label: "Something else" },
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number]["value"];

export const REPORT_STATUSES = ["open", "reviewed", "actioned", "dismissed"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export type ReportInput = {
  contentType: ReportContentType;
  contentRef?: string | null;
  playbookId?: string | null;
  reason: string;
  details?: string | null;
  reportedText?: string | null;
};

const CONTENT_TYPE_SET = new Set<string>(REPORT_CONTENT_TYPES);
const REASON_SET = new Set<string>(REPORT_REASONS.map((r) => r.value));

/**
 * Validate a report payload before it hits the RPC. Returns an error string or
 * null. Keeps the surface tools and the action honest about the allowed enums.
 */
export function validateReportInput(input: ReportInput): string | null {
  if (!CONTENT_TYPE_SET.has(input.contentType)) return "Unknown content type.";
  if (!input.reason || !REASON_SET.has(input.reason)) return "Choose a reason.";
  return null;
}
