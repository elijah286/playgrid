import { headers } from "next/headers";
import { lookupGeo } from "@/lib/geo/maxmind";
import { clientIpFromHeaders } from "@/lib/geo/request-ip";
import { readConsentCookie } from "@/lib/attribution/consent";
import ConsentBanner from "./ConsentBanner";

// Server component. Renders the banner only when the visitor is in a
// GDPR/UK-GDPR region AND has not yet chosen accept/decline. US-only product
// posture means most users never see this; EU travelers and anyone behind a
// European VPN will.
export default async function ConsentGate() {
  const consent = await readConsentCookie();
  if (consent !== null) return null;

  const ip = clientIpFromHeaders(await headers());
  const geo = await lookupGeo(ip);
  if (!geo.isEu) return null;

  return <ConsentBanner />;
}
