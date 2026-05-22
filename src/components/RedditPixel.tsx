import { headers } from "next/headers";
import Script from "next/script";
import { lookupGeo } from "@/lib/geo/maxmind";
import { clientIpFromHeaders } from "@/lib/geo/request-ip";
import {
  readConsentCookie,
  shouldSuppressTracking,
} from "@/lib/attribution/consent";
import { getStoredRedditPixelId } from "@/lib/site/reddit-pixel-config";

// Reddit Ads conversion pixel. Loads the rdt.js library, fires PageVisit
// on every page, and exposes window.rdt() for downstream SignUp /
// Purchase events.
//
// Consent: same gate as ConsentGate — never loads for EU/UK visitors who
// haven't accepted. Non-EU treated as implicitly consented under the
// US-only product posture (documented in /privacy).
//
// Configuration: pixel ID is set by the site admin in Site admin →
// Integrations (stored in site_settings.reddit_pixel_id, cached
// in-memory for 60s by getStoredRedditPixelId). No deploy needed to
// rotate. Without an ID the component renders nothing.

export default async function RedditPixel() {
  const PIXEL_ID = await getStoredRedditPixelId();
  if (!PIXEL_ID) return null;

  const consent = await readConsentCookie();
  const ip = clientIpFromHeaders(await headers());
  const geo = await lookupGeo(ip);
  if (shouldSuppressTracking({ isEu: geo.isEu, consent })) return null;

  // The init + PageVisit pair is the standard Reddit Pixel boot.
  // We also peek at ?rdt_signup=1 in the URL — the auth callback and
  // AuthFlow append it after a fresh signup so Reddit's Events
  // Manager attributes the conversion to the originating click.
  const snippet = `
    !function(w,d){if(!w.rdt){var p=w.rdt=function(){p.sendEvent?p.sendEvent.apply(p,arguments):p.callQueue.push(arguments)};p.callQueue=[];var t=d.createElement("script");t.src="https://www.redditstatic.com/ads/pixel.js",t.async=!0;var s=d.getElementsByTagName("script")[0];s.parentNode.insertBefore(t,s)}}(window,document);
    rdt('init', '${PIXEL_ID}');
    rdt('track', 'PageVisit');
    try {
      var params = new URLSearchParams(window.location.search);
      if (params.get('rdt_signup') === '1') {
        rdt('track', 'SignUp');
        // Strip the marker so a back-button / refresh doesn't re-fire.
        params.delete('rdt_signup');
        var qs = params.toString();
        var url = window.location.pathname + (qs ? '?' + qs : '') + window.location.hash;
        window.history.replaceState({}, '', url);
      }
    } catch (e) {}
  `;

  return (
    <Script
      id="reddit-pixel"
      strategy="afterInteractive"
      dangerouslySetInnerHTML={{ __html: snippet }}
    />
  );
}
