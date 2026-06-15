import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { snapshotFirstTouchToProfile } from "@/lib/attribution/snapshot";
import { projectSystemNoticesToAdmins } from "@/lib/notifications/inbox-dispatch";

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

  // Detect fresh signup (within the same 5-min grace window the snapshot
  // uses) so we can fire Reddit's SignUp conversion event in the browser
  // after redirect. Without this, Reddit only sees the PageVisit and
  // can't attribute conversions to the originating click.
  let isFreshSignup = false;
  if (data?.user?.id) {
    if (data.user.created_at) {
      const createdMs = new Date(data.user.created_at).getTime();
      isFreshSignup =
        Number.isFinite(createdMs) && Date.now() - createdMs < 5 * 60 * 1000;
    }
    await snapshotFirstTouchToProfile(data.user.id, data.user.created_at);

    // Brand-new user → the handle_new_user + system_notice triggers have
    // already written the 'user_signup' notice in this same transaction. Fan
    // it out to site admins' devices. Claimed idempotently, so a repeated
    // callback within the grace window can't double-notify.
    if (isFreshSignup) {
      try {
        await projectSystemNoticesToAdmins({
          admin: createServiceRoleClient(),
          userId: data.user.id,
        });
      } catch {
        // best-effort — the admin inbox row is the source of truth.
      }
    }
  }

  const dest = new URL(`${origin}${safeNext}`);
  if (isFreshSignup) {
    // Fire both ad-pixel signup conversions on the next page load. Each pixel
    // reads + strips its own distinct marker (RedditPixel: rdt_signup,
    // MetaPixel: fbq_signup) so they stay fully independent.
    dest.searchParams.set("rdt_signup", "1");
    dest.searchParams.set("fbq_signup", "1");
  }
  return NextResponse.redirect(dest.toString());
}
