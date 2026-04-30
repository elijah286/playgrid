/**
 * Soft typo correction for the most common email-domain mistakes. Used by
 * the signup form to surface "Did you mean foo@gmail.com?" inline before
 * the user submits — so we don't end up with another `gmail.con` ghost
 * account that can never receive the OTP and lingers as dead weight.
 *
 * Deliberately conservative: only the dozen-or-so domain typos that
 * appear repeatedly in the user table. False positives are worse than
 * misses here — we suggest a correction but never auto-apply.
 */

const COMMON_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "yahoo.ca",
  "hotmail.com",
  "hotmail.co.uk",
  "outlook.com",
  "live.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "msn.com",
  "comcast.net",
  "att.net",
  "sbcglobal.net",
  "verizon.net",
  "cox.net",
  "charter.net",
  "bellsouth.net",
  "earthlink.net",
]);

const TLD_TYPOS: Record<string, string> = {
  con: "com",
  cmo: "com",
  ocm: "com",
  vom: "com",
  xom: "com",
  copm: "com",
  comm: "com",
  co: "com",
  cm: "com",
  net: "net",
  nett: "net",
  ner: "net",
  nrt: "net",
  org: "org",
  ogr: "org",
  rog: "org",
};

const SLD_TYPOS: Record<string, string> = {
  // gmail
  gmial: "gmail",
  gmai: "gmail",
  gnail: "gmail",
  gmaill: "gmail",
  gmal: "gmail",
  gamil: "gmail",
  gmail1: "gmail",
  // yahoo
  yaho: "yahoo",
  yhoo: "yahoo",
  yahooo: "yahoo",
  yahho: "yahoo",
  yaoo: "yahoo",
  // hotmail
  hotmal: "hotmail",
  hotmial: "hotmail",
  hotmaill: "hotmail",
  hottmail: "hotmail",
  // outlook
  outlok: "outlook",
  outloook: "outlook",
  oultook: "outlook",
  // icloud
  iclud: "icloud",
  icoud: "icloud",
  iclould: "icloud",
};

/**
 * If `email` looks like a likely typo of a common provider, return the
 * corrected version. Otherwise return null. Lower-cased on output.
 */
export function suggestEmailDomainCorrection(email: string): string | null {
  if (!email) return null;
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || at === trimmed.length - 1) return null;
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);

  // Already a known-good domain — nothing to suggest.
  if (COMMON_DOMAINS.has(domain)) return null;

  const parts = domain.split(".");
  if (parts.length < 2) return null;
  const tld = parts[parts.length - 1];
  const sld = parts.slice(0, -1).join(".");

  const fixedTld = TLD_TYPOS[tld];
  const fixedSld = SLD_TYPOS[sld];

  // No clear typo on either side — bail. We avoid Levenshtein-distance
  // suggestions because they fire too aggressively on legitimate domains
  // ("acme.co" should not be auto-corrected to "acme.com").
  if (!fixedTld && !fixedSld) return null;

  const candidate = `${fixedSld ?? sld}.${fixedTld ?? tld}`;
  if (!COMMON_DOMAINS.has(candidate)) return null;
  if (candidate === domain) return null;

  return `${local}@${candidate}`;
}
