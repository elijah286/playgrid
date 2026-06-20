import type { Session } from "@supabase/supabase-js";

/**
 * Hands a freshly-minted native session to the server so the auth cookies
 * are written via `Set-Cookie` response headers.
 *
 * Why this exists: after `signInWithIdToken`, the @supabase/ssr browser
 * client persists the session by writing `document.cookie`. In iOS WKWebView
 * those JS cookie writes flush to the HTTP cookie store ASYNCHRONOUSLY, so an
 * immediate `window.location.assign('/home')` can race ahead before the
 * `sb-*` cookies exist — the server sees no session and the middleware
 * redirects to /login (the email screen). Apple rejected the app for exactly
 * this under Guideline 4.8 ("requires email after Sign in with Apple").
 *
 * Posting the tokens to /auth/native-session makes the SERVER set the cookies
 * via `Set-Cookie`, which WebKit stores synchronously while processing the
 * response — the same reliable path web OAuth uses via /auth/callback. Callers
 * MUST await this before navigating.
 *
 * Best-effort by design: it throws only on an outright failed request so the
 * caller can decide. The native sign-in helpers await it inside their own
 * try/catch, so a transient failure surfaces as a normal sign-in error rather
 * than a silent half-authenticated state.
 */
export async function syncNativeSessionToServer(
  session: Pick<Session, "access_token" | "refresh_token"> | null | undefined,
): Promise<void> {
  if (!session?.access_token || !session?.refresh_token) return;

  const res = await fetch("/auth/native-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Same-origin; ensures the Set-Cookie response is applied to this context.
    credentials: "include",
    body: JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    }),
  });

  if (!res.ok) {
    throw new Error(
      `Failed to establish server session (HTTP ${res.status}).`,
    );
  }
}
