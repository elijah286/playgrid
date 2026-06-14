import {
  SignedDataVerifier,
  Environment,
  type JWSTransactionDecodedPayload,
  type ResponseBodyV2DecodedPayload,
} from "@apple/app-store-server-library";
import { APPLE_ROOT_CA_BASE64 } from "./apple-root-cas";

// Apple-signature verification I/O (server only). Uses Apple's OFFICIAL library +
// Apple's public root certs to verify signed transactions and App Store Server
// Notifications — no third-party service, and no .p8 key needed (that's only for
// the App Store Server API, which we don't call in v1). Pure mapping is in
// apple-iap-map.ts so it can be unit-tested without loading this module.

export const APPLE_BUNDLE_ID = "com.xogridmaker.app";

const rootCAs = APPLE_ROOT_CA_BASE64.map((b64) => Buffer.from(b64, "base64"));
const verifierCache = new Map<Environment, SignedDataVerifier>();

function environmentFromString(s: string | null): Environment {
  switch (s) {
    case "Sandbox":
      return Environment.SANDBOX;
    case "Xcode":
      return Environment.XCODE;
    case "LocalTesting":
      return Environment.LOCAL_TESTING;
    default:
      return Environment.PRODUCTION;
  }
}

/** Read the (unverified) `environment` from a JWS payload so we pick the matching
 *  verifier — Apple signs sandbox and production with different certificate chains. */
function readJwsEnvironment(jws: string): string | null {
  try {
    const seg = jws.split(".")[1];
    if (!seg) return null;
    const json = JSON.parse(Buffer.from(seg, "base64url").toString("utf8")) as {
      environment?: unknown;
    };
    return typeof json.environment === "string" ? json.environment : null;
  } catch {
    return null;
  }
}

function getVerifier(env: Environment, appAppleId: number | null): SignedDataVerifier {
  let v = verifierCache.get(env);
  if (!v) {
    // enableOnlineChecks=true does an OCSP revocation check of Apple's cert chain.
    v = new SignedDataVerifier(rootCAs, true, env, APPLE_BUNDLE_ID, appAppleId ?? undefined);
    verifierCache.set(env, v);
  }
  return v;
}

/** Verify + decode a signed StoreKit 2 transaction (the jwsRepresentation the
 *  client reports, or the signedTransactionInfo inside a notification). */
export function verifyAppleTransaction(
  signedTransaction: string,
  appAppleId: number | null,
): Promise<JWSTransactionDecodedPayload> {
  const env = environmentFromString(readJwsEnvironment(signedTransaction));
  return getVerifier(env, appAppleId).verifyAndDecodeTransaction(signedTransaction);
}

/** Verify + decode an App Store Server Notification V2 signed payload. */
export function verifyAppleNotification(
  signedPayload: string,
  appAppleId: number | null,
): Promise<ResponseBodyV2DecodedPayload> {
  const env = environmentFromString(readJwsEnvironment(signedPayload));
  return getVerifier(env, appAppleId).verifyAndDecodeNotification(signedPayload);
}
