export type ReferrerSourceKind =
  | "search"
  | "ads"
  | "social"
  | "ai"
  | "email"
  | "internal"
  | "other"
  | "none";

export type ReferrerSource = {
  kind: ReferrerSourceKind;
  /** Friendly label, e.g. "Google", "Google Ads", "X / Twitter", "ChatGPT". */
  source: string | null;
  /** Hostname extracted from the referrer URL, if any. */
  host: string | null;
};

const SEARCH: Array<[RegExp, string]> = [
  [/(^|\.)google\./i, "Google"],
  [/(^|\.)bing\.com$/i, "Bing"],
  [/(^|\.)duckduckgo\.com$/i, "DuckDuckGo"],
  [/(^|\.)yahoo\./i, "Yahoo"],
  [/(^|\.)search\.brave\.com$/i, "Brave Search"],
  [/(^|\.)ecosia\.org$/i, "Ecosia"],
  [/(^|\.)yandex\./i, "Yandex"],
  [/(^|\.)baidu\.com$/i, "Baidu"],
  [/(^|\.)kagi\.com$/i, "Kagi"],
  [/(^|\.)startpage\.com$/i, "Startpage"],
];

const SOCIAL: Array<[RegExp, string]> = [
  [/(^|\.)t\.co$/i, "X / Twitter"],
  [/(^|\.)x\.com$/i, "X / Twitter"],
  [/(^|\.)twitter\.com$/i, "X / Twitter"],
  [/(^|\.)facebook\.com$/i, "Facebook"],
  [/(^|\.)l\.facebook\.com$/i, "Facebook"],
  [/(^|\.)m\.facebook\.com$/i, "Facebook"],
  [/(^|\.)instagram\.com$/i, "Instagram"],
  [/(^|\.)l\.instagram\.com$/i, "Instagram"],
  [/(^|\.)reddit\.com$/i, "Reddit"],
  [/(^|\.)out\.reddit\.com$/i, "Reddit"],
  [/(^|\.)linkedin\.com$/i, "LinkedIn"],
  [/(^|\.)lnkd\.in$/i, "LinkedIn"],
  [/(^|\.)youtube\.com$/i, "YouTube"],
  [/(^|\.)youtu\.be$/i, "YouTube"],
  [/(^|\.)tiktok\.com$/i, "TikTok"],
  [/(^|\.)threads\.net$/i, "Threads"],
  [/(^|\.)bsky\.app$/i, "Bluesky"],
  [/(^|\.)pinterest\./i, "Pinterest"],
  [/(^|\.)discord\.com$/i, "Discord"],
  [/(^|\.)t\.me$/i, "Telegram"],
  [/(^|\.)whatsapp\.com$/i, "WhatsApp"],
];

const AI: Array<[RegExp, string]> = [
  [/(^|\.)chatgpt\.com$/i, "ChatGPT"],
  [/(^|\.)chat\.openai\.com$/i, "ChatGPT"],
  [/(^|\.)claude\.ai$/i, "Claude"],
  [/(^|\.)perplexity\.ai$/i, "Perplexity"],
  [/(^|\.)gemini\.google\.com$/i, "Gemini"],
  [/(^|\.)copilot\.microsoft\.com$/i, "Copilot"],
  [/(^|\.)you\.com$/i, "You.com"],
];

const EMAIL: Array<[RegExp, string]> = [
  [/(^|\.)mail\.google\.com$/i, "Gmail"],
  [/(^|\.)outlook\.live\.com$/i, "Outlook"],
  [/(^|\.)outlook\.office\.com$/i, "Outlook"],
  [/(^|\.)mail\.yahoo\.com$/i, "Yahoo Mail"],
  [/(^|\.)mail\.proton\.me$/i, "Proton Mail"],
];

function matchList(host: string, list: Array<[RegExp, string]>): string | null {
  for (const [re, name] of list) if (re.test(host)) return name;
  return null;
}

function parseHost(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    // Some referrers are stored as bare hostnames.
    const bare = trimmed.replace(/^https?:\/\//i, "").split(/[\/?#\s]/)[0];
    if (!bare || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(bare)) return null;
    return bare.toLowerCase().replace(/^www\./, "");
  }
}

function classifyByHost(host: string): ReferrerSource {
  // Email first — mail.google.com would otherwise match the SEARCH "google.*" rule.
  const email = matchList(host, EMAIL);
  if (email) return { kind: "email", source: email, host };
  const search = matchList(host, SEARCH);
  if (search) return { kind: "search", source: search, host };
  const ai = matchList(host, AI);
  if (ai) return { kind: "ai", source: ai, host };
  const social = matchList(host, SOCIAL);
  if (social) return { kind: "social", source: social, host };
  return { kind: "other", source: host, host };
}

export type ClassifyInput = {
  referrer?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  /** Optional: host of your own site, to flag internal referrers. */
  selfHost?: string | null;
};

export function classifyReferrer(input: ClassifyInput): ReferrerSource {
  const utmSource = (input.utmSource ?? "").trim().toLowerCase();
  const utmMedium = (input.utmMedium ?? "").trim().toLowerCase();

  // UTM takes precedence — paid traffic is intent we should not lose.
  if (utmSource || utmMedium) {
    const isPaid = /^(cpc|ppc|paid|cpm|display|paidsocial|paid_social)$/.test(
      utmMedium,
    );
    if (utmSource === "google") {
      return {
        kind: isPaid ? "ads" : "search",
        source: isPaid ? "Google Ads" : "Google",
        host: parseHost(input.referrer),
      };
    }
    if (utmSource === "bing") {
      return {
        kind: isPaid ? "ads" : "search",
        source: isPaid ? "Microsoft Ads" : "Bing",
        host: parseHost(input.referrer),
      };
    }
    if (utmSource === "facebook" || utmSource === "fb") {
      return {
        kind: isPaid ? "ads" : "social",
        source: isPaid ? "Facebook Ads" : "Facebook",
        host: parseHost(input.referrer),
      };
    }
    if (utmSource === "twitter" || utmSource === "x") {
      return {
        kind: isPaid ? "ads" : "social",
        source: isPaid ? "X Ads" : "X / Twitter",
        host: parseHost(input.referrer),
      };
    }
    if (utmSource === "linkedin") {
      return {
        kind: isPaid ? "ads" : "social",
        source: isPaid ? "LinkedIn Ads" : "LinkedIn",
        host: parseHost(input.referrer),
      };
    }
    if (utmMedium === "email" || utmSource === "newsletter") {
      return { kind: "email", source: input.utmSource ?? "Email", host: parseHost(input.referrer) };
    }
    if (isPaid) {
      return { kind: "ads", source: input.utmSource ?? "Paid", host: parseHost(input.referrer) };
    }
    // Generic UTM — fall through to referrer-based detection but keep the source label.
  }

  const host = parseHost(input.referrer);
  if (!host) {
    return { kind: "none", source: null, host: null };
  }

  const selfHost = (input.selfHost ?? "").toLowerCase().replace(/^www\./, "");
  if (selfHost && (host === selfHost || host.endsWith(`.${selfHost}`))) {
    return { kind: "internal", source: host, host };
  }

  return classifyByHost(host);
}

/** Human-readable phrase, e.g. "Google search", "X / Twitter", "Direct (no referrer sent)". */
export function describeSource(src: ReferrerSource): string {
  switch (src.kind) {
    case "search":
      return src.source ? `${src.source} search` : "Search engine";
    case "ads":
      return src.source ?? "Paid ads";
    case "social":
      return src.source ?? "Social";
    case "ai":
      return src.source ? `${src.source} (AI)` : "AI assistant";
    case "email":
      return src.source ?? "Email";
    case "internal":
      return "Internal navigation";
    case "other":
      return src.source ?? src.host ?? "Other";
    case "none":
      return "Direct (no referrer sent)";
  }
}
