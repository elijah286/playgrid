import type { ReadonlyHeaders } from "next/dist/server/web/spec-extension/adapters/headers";

// Pull the client IP off the standard proxy headers Railway / Cloudflare /
// Vercel forward. Returns null if nothing usable.
export function clientIpFromHeaders(h: Headers | ReadonlyHeaders): string | null {
  const forwardedFor = h.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = h.get("x-real-ip");
  if (real) return real.trim() || null;
  const cf = h.get("cf-connecting-ip");
  if (cf) return cf.trim() || null;
  return null;
}
