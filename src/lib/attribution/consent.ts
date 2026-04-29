import { cookies } from "next/headers";

// Tracking-consent cookie. Absence means "unknown" — we suppress identifying
// fields for EU/UK visitors until they choose. Non-EU visitors are treated as
// implicitly consented under the current US-only product posture.
export const CONSENT_COOKIE = "pg_consent";
export const CONSENT_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

export type ConsentValue = "accepted" | "declined";

export async function readConsentCookie(): Promise<ConsentValue | null> {
  const store = await cookies();
  const v = store.get(CONSENT_COOKIE)?.value;
  return v === "accepted" || v === "declined" ? v : null;
}

export async function writeConsentCookie(value: ConsentValue): Promise<void> {
  const store = await cookies();
  store.set(CONSENT_COOKIE, value, {
    path: "/",
    maxAge: CONSENT_MAX_AGE_SECONDS,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

// True only when the visitor is in a GDPR/UK-GDPR region AND has not yet
// chosen accept/decline. In that state, we strip identifying fields from
// pageviews and don't write the first-touch cookie.
export function shouldSuppressTracking(args: {
  isEu: boolean;
  consent: ConsentValue | null;
}): boolean {
  return args.isEu && args.consent !== "accepted";
}
