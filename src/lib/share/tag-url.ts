/**
 * Decorates outbound share URLs with UTM params so inbound visits attribute
 * back to the share — even when document.referrer gets stripped (Facebook
 * in-app browsers, iOS Mail, https→http hops, etc).
 *
 * The Site admin → Traffic → Virality tab joins inbound page_views to
 * share_events via the path token; UTMs let us *also* see how shares are
 * performing in the Acquisition tab alongside organic referrers.
 */

export type ShareChannel = "copy_link" | "native" | "email" | "qr" | "system";
export type ShareKind =
  | "site_share"
  | "playbook_copy"
  | "playbook_invite"
  | "play_link";

export type TagShareOptions = {
  kind: ShareKind;
  channel: ShareChannel;
  /** Optional sender id for cross-attribution. Mirrors the existing
   *  `?ref=<userId>` referral hook so we don't break it. */
  senderId?: string | null;
};

export function tagShareUrl(url: string, opts: TagShareOptions): string {
  try {
    const u = new URL(url);
    if (!u.searchParams.has("utm_source")) u.searchParams.set("utm_source", "share");
    if (!u.searchParams.has("utm_medium")) u.searchParams.set("utm_medium", opts.channel);
    if (!u.searchParams.has("utm_campaign")) u.searchParams.set("utm_campaign", opts.kind);
    if (opts.senderId && !u.searchParams.has("ref")) {
      u.searchParams.set("ref", opts.senderId);
    }
    return u.toString();
  } catch {
    return url;
  }
}
