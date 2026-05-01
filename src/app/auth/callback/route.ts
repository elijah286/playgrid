import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { snapshotFirstTouchToProfile } from "@/lib/attribution/snapshot";

// OAuth + PKCE callback. Supabase redirects here with `?code=...` after the
// provider (Apple, Google, etc.) authenticates the user. We exchange the code
// for a session, set the auth cookies, then forward to `next` (or /home).
//
// Behind Railway's proxy, `new URL(request.url).origin` returns the
// internal container address (http://localhost:8080) instead of the public
// xogridmaker.com origin, which made every OAuth login bounce to a dead
// localhost URL. Read the forwarded headers so the redirect lands on the
// real public origin.
function publicOrigin(request: NextRequest): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  if (host) return `${proto}://${host}`;
  return new URL(request.url).origin;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const origin = publicOrigin(request);
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "/home";
  const safeNext =
    nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/home";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`,
    );
  }

  if (data?.user?.id) {
    await snapshotFirstTouchToProfile(data.user.id, data.user.created_at);
  }

  return NextResponse.redirect(`${origin}${safeNext}`);
}
