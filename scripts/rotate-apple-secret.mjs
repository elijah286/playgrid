#!/usr/bin/env node
/**
 * Rotate the Sign in with Apple OAuth client secret.
 *
 * Apple caps these client secrets at ~6 months, after which web Apple
 * sign-in breaks until a new one is minted. This script regenerates the
 * ES256 JWT from the SIWA .p8 auth key and pushes it into Supabase's auth
 * config via the Management API. Run on a monthly cron (see
 * .github/workflows/rotate-apple-secret.yml) so there's always ~5 months of
 * validity in hand — the secret never lapses and nobody has to remember.
 *
 * Env:
 *   APPLE_TEAM_ID              Apple Team ID (iss)
 *   APPLE_KEY_ID               Key ID of the SIWA .p8 (jwt header kid)
 *   APPLE_SERVICES_ID          Services ID (sub) — the web client id
 *   APPLE_SIWA_KEY_P8          .p8 PEM contents  (or _BASE64 below)
 *   APPLE_SIWA_KEY_P8_BASE64   base64 of the .p8 (preferred for CI secrets)
 *   SUPABASE_PROJECT_REF       project ref (e.g. hxbjkezyecahhieymbxn)
 *   SUPABASE_ACCESS_TOKEN      Supabase Management API token (sbp_...)
 *
 * Flags:
 *   --dry-run   mint + print the secret, skip the Supabase write
 */
import { createSign } from "node:crypto";

const DRY_RUN = process.argv.includes("--dry-run");

function req(name) {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`Missing required env: ${name}`);
  return v.trim();
}

function base64url(input) {
  return Buffer.from(
    typeof input === "string" ? input : JSON.stringify(input),
  ).toString("base64url");
}

function loadKey() {
  if (process.env.APPLE_SIWA_KEY_P8?.trim()) {
    return process.env.APPLE_SIWA_KEY_P8.replace(/\\n/g, "\n");
  }
  if (process.env.APPLE_SIWA_KEY_P8_BASE64?.trim()) {
    return Buffer.from(
      process.env.APPLE_SIWA_KEY_P8_BASE64.trim(),
      "base64",
    ).toString("utf8");
  }
  throw new Error("Missing APPLE_SIWA_KEY_P8 or APPLE_SIWA_KEY_P8_BASE64");
}

const teamId = req("APPLE_TEAM_ID");
const keyId = req("APPLE_KEY_ID");
const servicesId = req("APPLE_SERVICES_ID");
const privateKey = loadKey();

const iat = Math.floor(Date.now() / 1000);
const exp = iat + 15552000; // 180 days, under Apple's ~6-month ceiling
const header = base64url({ alg: "ES256", kid: keyId });
const payload = base64url({
  iss: teamId,
  iat,
  exp,
  aud: "https://appleid.apple.com",
  sub: servicesId,
});
const signingInput = `${header}.${payload}`;
const signature = createSign("SHA256")
  .update(signingInput)
  .sign({ key: privateKey, dsaEncoding: "ieee-p1363" })
  .toString("base64url");
const jwt = `${signingInput}.${signature}`;
const expIso = new Date(exp * 1000).toISOString().slice(0, 10);

if (DRY_RUN) {
  console.log(`[dry-run] minted Apple client secret, would expire ${expIso}`);
  console.log(jwt);
  process.exit(0);
}

const ref = req("SUPABASE_PROJECT_REF");
const token = req("SUPABASE_ACCESS_TOKEN");

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
  method: "PATCH",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ external_apple_secret: jwt }),
});

if (!res.ok) {
  const body = await res.text().catch(() => "");
  throw new Error(`Supabase auth config PATCH failed: ${res.status} ${body}`);
}

console.log(`✓ Apple OAuth client secret rotated. New expiry: ${expIso}`);
