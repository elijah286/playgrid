/**
 * Lightweight objectionable-text filter for short, user-authored strings that
 * are shown to OTHER users — display names and roster labels today.
 *
 * Goal (App Store Guideline 1.2): provide "a method for filtering objectionable
 * material." This is intentionally a conservative, self-contained wordlist —
 * NOT a full moderation service. It aims to catch slurs, explicit sexual terms,
 * and hard profanity while minimizing false positives on real names (the
 * "Scunthorpe problem"). It pairs with the reporting flow (coaches can report
 * anything that slips through) rather than trying to be exhaustive on its own.
 *
 * How matching works:
 *  - Normalize: lowercase + fold common leet substitutions (4→a, 3→e, 1/!→i,
 *    0→o, 5/$→s, 7→t) so "f4ggot" reads as "faggot".
 *  - Each listed term is compiled to a regex where every character may repeat
 *    (`fuck` → `\bf+u+c+k+\b`). That catches "fuuuck" while the `\b` word
 *    boundaries keep "ass" from flagging "class"/"bass"/"pass" and let real
 *    surnames like "Dick"/"Cox" through.
 *  - A small EVASION_PRONE subset (the worst slurs) is ALSO matched against a
 *    separator-stripped form so "n.i.g.g.e.r" / "f a g" don't trivially bypass.
 *
 * No dependency is added on purpose (supply-chain hygiene); the list lives here
 * and is easy to extend with a regression test per addition.
 */

// Unambiguous slurs + explicit sexual terms.
const HARD_TERMS: readonly string[] = [
  // racial / ethnic / homophobic / ableist slurs
  "nigger",
  "nigga",
  "faggot",
  "fag",
  "retard",
  "tranny",
  "chink",
  "spic",
  "kike",
  "wetback",
  // (deliberately omit "coon"/"dyke": common surnames — Coon, Van Dyke — so the
  //  word-boundary match would false-positive on real names. The report flow is
  //  the backstop for slurs the wordlist intentionally keeps conservative.)
  // explicit sexual
  "cunt",
  "rape",
  "rapist",
  "molest",
  "pedophile",
  "pedo",
  "porn",
  "blowjob",
  "handjob",
  "creampie",
];

// Common profanity. Word-boundary matched so embedded substrings in clean
// words don't trip (e.g. "assassin" is fine; bare "ass" is not in this list).
const PROFANITY_TERMS: readonly string[] = [
  "fuck",
  "shit",
  "bitch",
  "asshole",
  "bastard",
  "dickhead",
  "motherfucker",
  "whore",
  "slut",
  "jackass",
];

// Slurs people most commonly sneak past with dots/dashes/spaces. Also checked
// against the separator-stripped form. Keep to terms objectionable even as a
// bare substring, to avoid false positives.
const EVASION_PRONE: readonly string[] = [
  "nigger",
  "nigga",
  "faggot",
  "kike",
  "chink",
  "spic",
  "cunt",
];

const LEET_MAP: Record<string, string> = {
  "4": "a",
  "@": "a",
  "3": "e",
  "1": "i",
  "!": "i",
  "0": "o",
  "5": "s",
  $: "s",
  "7": "t",
};

/** Lowercase + fold leet substitutions to letters. */
function normalize(input: string): string {
  let out = "";
  for (const ch of input.toLowerCase()) out += LEET_MAP[ch] ?? ch;
  return out;
}

const escapeChar = (c: string) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Compile a term to a word-boundary-anchored regex where each character may
 * repeat (handles "fuuuck"). The `\b…\b` anchors are what keep "ass" from
 * matching "class" and "cunt" from matching "Scunthorpe".
 */
function wordRegex(term: string): RegExp {
  const body = term
    .split("")
    .map((c) => `${escapeChar(c)}+`)
    .join("");
  return new RegExp(`\\b${body}\\b`, "i");
}

/**
 * Like wordRegex, but tolerates non-letter separators BETWEEN the letters so
 * "n.i.g.g.e.r" / "f a g g o t" are caught. Still boundary-anchored on the
 * whole token, so it does NOT match a slur embedded inside a clean word
 * (e.g. "spic" stays out of "spicy"/"Hispanic").
 */
function separatedRegex(term: string): RegExp {
  const body = term
    .split("")
    .map((c) => `${escapeChar(c)}+`)
    .join("[\\W_]*");
  return new RegExp(`\\b${body}\\b`, "i");
}

const HARD_RES = HARD_TERMS.map(wordRegex);
const PROFANITY_RES = PROFANITY_TERMS.map(wordRegex);
const EVASION_RES = EVASION_PRONE.map(separatedRegex);

/**
 * True when the input contains an objectionable slur, explicit sexual term, or
 * hard profanity. Empty / whitespace input is never objectionable.
 */
export function containsObjectionableText(input: string | null | undefined): boolean {
  if (!input) return false;
  const normalized = normalize(input);
  if (!normalized.trim()) return false;

  if (HARD_RES.some((re) => re.test(normalized))) return true;
  if (PROFANITY_RES.some((re) => re.test(normalized))) return true;
  if (EVASION_RES.some((re) => re.test(normalized))) return true;

  return false;
}

/**
 * Validate a user-facing name/label. Returns a friendly error message when the
 * value is objectionable, or null when it's acceptable. Callers reject the
 * write and surface the message.
 */
export function objectionableNameError(input: string): string | null {
  if (containsObjectionableText(input)) {
    return "That name contains language we don't allow. Please choose another.";
  }
  return null;
}
