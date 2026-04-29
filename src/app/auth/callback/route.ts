import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { snapshotFirstTouchToProfile } from "@/lib/attribution/snapshot";

// OAuth + PKCE callback. Supabase redirects here with `?code=...` after the
// provider (Apple, Google, etc.) authenticates the user. We exchange the code
// for a session, set the auth cookies, then forward to `next` (or /home).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
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
