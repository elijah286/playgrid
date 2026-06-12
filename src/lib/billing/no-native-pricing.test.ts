import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * App Store Guideline 3.1.1 / 3.1.3(b) guard.
 *
 * The native iOS app must not display any price or upgrade/pricing CTA — that
 * markets a paid subscription in-app, which got builds 2 and 3 rejected. This
 * scans every .tsx for price + upgrade/purchase strings and fails if one can
 * render without a native gate nearby. It's the backstop that stops a new
 * ungated upsell from sneaking in (a "strike 4").
 *
 * A match is OK if a native signal (`data-web-only`, `data-native-only`,
 * `isNativeApp`, a `native ?` ternary, `platform === "web"`, or an `aNative`
 * variant) appears within WINDOW lines — i.e. the element/string is gated for
 * native — or if it's in an allowlisted, non-native-rendered location.
 */

const SRC = join(__dirname, "..", "..");

// Currency amounts + explicit upgrade/purchase CTAs that must never reach
// native users. (Tier NAMES alone — e.g. "Team Coach" as a feature label —
// are fine; only price + purchase/upgrade STEERING is a 3.1.1 violation.)
const DANGER = [
  /\$\d+(?:\.\d+)?(?:\s*\/\s*(?:mo|month|yr|year))?\b/i,
  /purchase more for/i,
  /Upgrade to (?:Team Coach|Coach Pro)/i,
  /See pricing/i,
  /See Team Coach plan/i,
];

const GATE =
  /data-web-only|data-native-only|isNativeApp|useIsNativeApp|nativePlatform|platform === "web"|aNative|\bnative\s*\?/;
// Wide enough to see a card/section-level `data-web-only` wrapper a couple
// dozen lines above the price string it encloses.
const WINDOW = 20;

// Locations where price/upgrade strings are acceptable:
//  - the pricing page (wrapped in data-web-only at the page level — see
//    src/app/pricing/page.tsx — so PricingClient never renders on native)
//  - the /coach-cal marketing page (its pricing blocks are wrapped in
//    `<section data-web-only>` / `<section data-native-only>` 90+ lines from
//    the price strings — verified section-level gating, beyond any window)
//  - admin tooling (not reachable by a reviewer / non-admin)
//  - tests
const ALLOW_PATH = [
  join("app", "pricing"),
  join("app", "coach-cal"),
  join("features", "admin"),
  ".test.",
  ".spec.",
];

// Per-line exemptions: comments, SEO/structured-data/metadata, and constant
// definitions (the literal lives at the const; its render is gated separately
// and carries no literal price string to match).
function isExempt(line: string): boolean {
  const t = line.trim();
  if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return true;
  if (/^(const|let|var) \w+ ?[:=]/.test(t)) return true;
  if (/^return [`'"]/.test(t)) return true;
  return /description:|acceptedAnswer|"@type"|jsonLd|JSON-LD|JSON\.stringify|metadataBase|openGraph|alt=|aria-label=/.test(
    line,
  );
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

describe("native app exposes no price or upgrade CTA (App Store 3.1.1)", () => {
  it("every price/upgrade string in the UI is gated for native (or allowlisted)", () => {
    const leaks: string[] = [];
    for (const file of walk(SRC)) {
      const rel = file.slice(SRC.length + 1);
      if (ALLOW_PATH.some((a) => file.includes(a))) continue;
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (isExempt(line)) return;
        if (!DANGER.some((re) => re.test(line))) return;
        const ctx = lines
          .slice(Math.max(0, i - WINDOW), i + WINDOW + 1)
          .join("\n");
        if (!GATE.test(ctx)) leaks.push(`${rel}:${i + 1}  ${line.trim().slice(0, 90)}`);
      });
    }
    expect(
      leaks,
      `Ungated price/upgrade strings reachable on native (add data-web-only / a native check, or neutralize the copy):\n${leaks.join("\n")}`,
    ).toEqual([]);
  });
});
