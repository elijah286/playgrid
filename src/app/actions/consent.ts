"use server";

import { writeConsentCookie, type ConsentValue } from "@/lib/attribution/consent";

export async function setConsentAction(value: ConsentValue) {
  if (value !== "accepted" && value !== "declined") {
    return { ok: false as const, error: "Invalid consent value." };
  }
  await writeConsentCookie(value);
  return { ok: true as const };
}
