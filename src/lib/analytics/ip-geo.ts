export type IpGeo = {
  country: string | null;
  region: string | null;
  city: string | null;
};

const cache = new Map<string, { value: IpGeo; expires: number }>();
const TTL_MS = 24 * 60 * 60 * 1000;

function isPrivate(ip: string): boolean {
  if (!ip) return true;
  if (ip === "::1" || ip === "127.0.0.1") return true;
  if (ip.startsWith("10.")) return true;
  if (ip.startsWith("192.168.")) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  if (ip.startsWith("fc") || ip.startsWith("fd")) return true;
  return false;
}

/**
 * Best-effort IP → approximate location. Uses ipwho.is (HTTPS, no key).
 * Admin-only, cached per process for 24h; never throws.
 */
export async function lookupIpLocation(ip: string | null): Promise<IpGeo | null> {
  if (!ip) return null;
  if (isPrivate(ip)) return null;

  const now = Date.now();
  const hit = cache.get(ip);
  if (hit && hit.expires > now) return hit.value;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
      signal: ctrl.signal,
      headers: { "User-Agent": "playbook-admin/1.0" },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      success?: boolean;
      country?: string;
      region?: string;
      city?: string;
    };
    if (!data?.success) return null;
    const value: IpGeo = {
      country: data.country ?? null,
      region: data.region ?? null,
      city: data.city ?? null,
    };
    cache.set(ip, { value, expires: now + TTL_MS });
    return value;
  } catch {
    return null;
  }
}
