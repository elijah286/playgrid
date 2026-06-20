import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Native session handoff for the Capacitor shell (iOS/Android).
//
// Web OAuth establishes the session server-side via /auth/callback
// (exchangeCodeForSession), so the auth cookies arrive as `Set-Cookie`
// response headers — which WebKit writes to its HTTP cookie store
// synchronously while processing the response.
//
// The native flows (Sign in with Apple / Google) instead call
// `signInWithIdToken` in the browser client, which persists the session by
// writing `document.cookie`. In iOS WKWebView those JS cookie writes flush
// to the shared cookie store ASYNCHRONOUSLY, so an immediate top-level
// navigation (hardNavigate → window.location.assign) can race ahead before
// the `sb-*` cookies are present. The server then sees no session and the
// middleware bounces the user to /login — which renders the email field.
// Apple flagged exactly this under Guideline 4.8 ("requires email after
// Sign in with Apple"): the user is authenticated client-side (header shows
// their avatar) but lands back on the sign-in screen.
//
// Posting the freshly-minted tokens here makes the SERVER set the auth
// cookies via `Set-Cookie`, taking the reliable same path web OAuth uses.
// The client awaits this before navigating, so the next navigation always
// carries the session. See src/lib/native/serverSession.ts for the caller.
export async function POST(request: NextRequest) {
  let body: { access_token?: unknown; refresh_token?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const accessToken = body.access_token;
  const refreshToken = body.refresh_token;
  if (typeof accessToken !== "string" || typeof refreshToken !== "string") {
    return NextResponse.json({ error: "missing_tokens" }, { status: 400 });
  }

  const supabase = await createClient();
  // setSession validates the access token against the project's JWKS and
  // writes the auth cookies through the server client's cookie adapter,
  // which queues them as Set-Cookie on this response.
  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error || !data.user) {
    return NextResponse.json(
      { error: error?.message ?? "invalid_session" },
      { status: 401 },
    );
  }

  return NextResponse.json({ ok: true });
}
