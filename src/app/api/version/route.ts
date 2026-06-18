import { NextResponse } from "next/server";

// Reports the build id of the *currently running* deploy. The native app
// compares this against the build id baked into the loaded bundle
// (NEXT_PUBLIC_BUILD_ID) to decide whether a resume-reload is worth the network
// round-trip — see src/lib/native/deployVersion.ts. Must never be cached, or a
// stale CDN copy would mask a fresh deploy.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { buildId: process.env.NEXT_PUBLIC_BUILD_ID ?? "dev" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
