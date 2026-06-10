import { headers } from "next/headers";
import Script from "next/script";
import { lookupGeo } from "@/lib/geo/maxmind";
import { clientIpFromHeaders } from "@/lib/geo/request-ip";
import {
  readConsentCookie,
  shouldSuppressTracking,
} from "@/lib/attribution/consent";
import { getStoredMetaPixelId } from "@/lib/site/meta-pixel-config";

// Meta (Facebook) Ads conversion pixel. Loads fbevents.js, fires PageView on
// every page, and fires CompleteRegistration after a fresh signup so Meta's
// Events Manager can attribute conversions to ad clicks — the prerequisite for
// running a Conversions/Sales-objective campaign and building website
// lookalikes. Mirrors RedditPixel.
//
// Consent: same gate as RedditPixel / ConsentGate — never loads for EU/UK
// visitors who haven't accepted. Non-EU treated as implicitly consented under
// the US-only product posture (documented in /privacy).
//
// Configuration: pixel ID is set by the site admin in Site Admin →
// Integrations (stored in site_settings.meta_pixel_id, cached in-memory for
// 60s by getStoredMetaPixelId). No deploy needed to rotate. Without an ID the
// component renders nothing.
//
// Signup marker: the auth callback and AuthFlow append `?fbq_signup=1` after a
// fresh signup (alongside Reddit's `rdt_signup=1`). We read our own distinct
// marker and strip only it, so the two pixels stay fully independent.

export default async function MetaPixel() {
  const PIXEL_ID = await getStoredMetaPixelId();
  if (!PIXEL_ID) return null;

  const consent = await readConsentCookie();
  const ip = clientIpFromHeaders(await headers());
  const geo = await lookupGeo(ip);
  if (shouldSuppressTracking({ isEu: geo.isEu, consent })) return null;

  const snippet = `
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', '${PIXEL_ID}');
    fbq('track', 'PageView');
    try {
      var params = new URLSearchParams(window.location.search);
      if (params.get('fbq_signup') === '1') {
        fbq('track', 'CompleteRegistration');
        // Strip the marker so a back-button / refresh doesn't re-fire.
        params.delete('fbq_signup');
        var qs = params.toString();
        var url = window.location.pathname + (qs ? '?' + qs : '') + window.location.hash;
        window.history.replaceState({}, '', url);
      }
    } catch (e) {}
  `;

  return (
    <Script
      id="meta-pixel"
      strategy="afterInteractive"
      dangerouslySetInnerHTML={{ __html: snippet }}
    />
  );
}
