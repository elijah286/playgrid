// Shared signup-source classifier. Produces a stable "kind" + a
// human-readable label/detail from a user's first-touch attribution.
// Used by:
//   - the admin Users list (one chip per row)
//   - the per-user activity panel (richer detail, with playbook + sender lookups)
//   - the system_notices enrichment that runs after first-touch is stamped,
//     so admins see "via copy link to <Playbook> · sent by <name>" in the
//     inbox instead of just "X signed up".

const SHARE_TOKEN_PATH_RE = /^\/(copy|v|share|invite)\/([A-Za-z0-9_\-]{8,})/;

export type SignupSourceKind =
  | "copy_link"
  | "share_view"
  | "playbook_invite"
  | "coach_invite"
  | "home"
  | "campaign"
  | "direct"
  | "other"
  | "unknown";

export type SignupSourceFirstTouch = {
  landingPath: string | null | undefined;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  referrer?: string | null;
};

export type SignupSourceClassification = {
  kind: SignupSourceKind;
  /** Short label fit for a chip in the users list (e.g. "Copy link",
   *  "Coach invite", "Home page"). */
  label: string;
  /** One-line description with whatever extra context we have without
   *  doing extra DB lookups. Falls back to the raw landing path if
   *  nothing better is available. */
  detail: string | null;
  /** When the landing path was a /copy/<token> or /v/<token> share URL,
   *  the token segment so the caller can resolve it to a playbook + sender. */
  shareToken: string | null;
  /** Echo of the inputs so callers (admin panel, notice body) can render
   *  the underlying utm without re-parsing. */
  utm: {
    source: string | null;
    medium: string | null;
    campaign: string | null;
  };
};

/** Map a /copy/<token>, /v/<token>, /share/<token>, /invite/<token>
 *  landing back to its token, or null. */
export function extractSignupShareToken(
  landingPath: string | null | undefined,
): string | null {
  if (!landingPath) return null;
  const m = SHARE_TOKEN_PATH_RE.exec(landingPath);
  return m ? m[2] : null;
}

/** Synchronous classifier — no DB lookups. The "label" is good enough
 *  for the users-list chip; callers that need playbook/sender names do
 *  their own joins on top. */
export function classifySignupSource(
  ft: SignupSourceFirstTouch,
): SignupSourceClassification {
  const landingPath = ft.landingPath?.trim() || null;
  const utmSource = ft.utmSource?.trim() || null;
  const utmMedium = ft.utmMedium?.trim() || null;
  const utmCampaign = ft.utmCampaign?.trim() || null;
  const utm = { source: utmSource, medium: utmMedium, campaign: utmCampaign };

  if (landingPath) {
    const m = SHARE_TOKEN_PATH_RE.exec(landingPath);
    if (m) {
      const segment = m[1];
      const token = m[2];
      if (segment === "copy") {
        return {
          kind: "copy_link",
          label: "Copy link",
          detail: utmCampaign
            ? `via copy link · campaign "${utmCampaign}"`
            : "via copy link",
          shareToken: token,
          utm,
        };
      }
      if (segment === "v" || segment === "share") {
        return {
          kind: "share_view",
          label: "Shared link",
          detail: "via shared playbook link",
          shareToken: token,
          utm,
        };
      }
      if (segment === "invite") {
        return {
          kind: "playbook_invite",
          label: "Playbook invite",
          detail: "via playbook invite link",
          shareToken: token,
          utm,
        };
      }
    }
    if (landingPath.startsWith("/playbook/")) {
      return {
        kind: "share_view",
        label: "Shared playbook",
        detail: `Landed on ${landingPath}`,
        shareToken: null,
        utm,
      };
    }
  }

  // Coach-invite codes don't go through a URL path — that's caught
  // separately in the activity panel by querying coach_invitations.

  if (utmCampaign || utmSource) {
    const trail = [utmSource, utmMedium, utmCampaign].filter(Boolean).join(" / ");
    return {
      kind: "campaign",
      label: utmSource ? utmSource : "Campaign",
      detail: `Campaign · ${trail}`,
      shareToken: null,
      utm,
    };
  }

  if (landingPath === "/" || landingPath === "/home") {
    return {
      kind: "home",
      label: "Home page",
      detail: ft.referrer ? `Referred by ${ft.referrer}` : "Direct visit",
      shareToken: null,
      utm,
    };
  }

  if (!landingPath) {
    return {
      kind: "unknown",
      label: "Unknown",
      detail: null,
      shareToken: null,
      utm,
    };
  }

  return {
    kind: "other",
    label: "Other",
    detail: landingPath,
    shareToken: null,
    utm,
  };
}
