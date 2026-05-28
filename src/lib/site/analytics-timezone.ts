// Analytics days are bucketed in US Central time so the admin dashboard's
// "per day" charts and active-cohort windows line up with the operator's
// calendar instead of UTC. Without this, evening Central traffic rolls into
// the next UTC day and the chart sprouts a phantom "tomorrow" bucket.
//
// We use the America/Chicago IANA zone (not a fixed CST offset) so DST is
// handled automatically — it resolves to CDT/CST as appropriate.
export const ANALYTICS_TIMEZONE = "America/Chicago";

// en-CA formats as YYYY-MM-DD, which sorts lexicographically and matches the
// `day` shape used elsewhere in analytics.
const dayKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: ANALYTICS_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function centralDayKey(d: Date): string {
  return dayKeyFormatter.format(d);
}
