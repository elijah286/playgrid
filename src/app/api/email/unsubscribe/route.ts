import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { verifyUnsubscribeToken } from "@/lib/email/unsubscribe-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One-click unsubscribe endpoint (RFC 8058).
 *
 * Two callers, both expected:
 *
 *  - **Mail provider (Apple Mail / Gmail / Outlook)**: issues a POST
 *    when the user hits the "Unsubscribe" button their client renders
 *    from our `List-Unsubscribe` header. We respond 200 with no body.
 *    This is the path that gets us out of Junk on iCloud.
 *
 *  - **Human in a browser**: clicks the footer link. Lands here via
 *    GET and gets an HTML confirmation page.
 *
 * Both methods write the same `email_opt_outs` row. Idempotent.
 *
 * Query params: `u` (userId), `c` (category), `t` (HMAC token).
 * Token is verified before writing — we don't trust the URL alone.
 */
async function process(req: Request): Promise<
  { ok: true; userId: string; category: string } | { ok: false; status: number; error: string }
> {
  if (!hasSupabaseEnv()) {
    return { ok: false, status: 503, error: "Server not configured" };
  }
  const url = new URL(req.url);
  const userId = url.searchParams.get("u") ?? "";
  const category = url.searchParams.get("c") ?? "";
  const token = url.searchParams.get("t") ?? "";
  const verified = verifyUnsubscribeToken({ userId, category, token });
  if (!verified) {
    return { ok: false, status: 400, error: "Invalid or expired link" };
  }
  const admin = createServiceRoleClient();
  // Upsert so repeat clicks don't error. source='one_click' or 'browser'
  // helps us see which path drove the opt-out in analytics.
  const source = req.method === "POST" ? "one_click" : "browser";
  const { error } = await admin
    .from("email_opt_outs")
    .upsert(
      {
        user_id: verified.userId,
        category: verified.category,
        source,
      },
      { onConflict: "user_id,category" },
    );
  if (error) {
    return { ok: false, status: 500, error: error.message };
  }
  return { ok: true, userId: verified.userId, category: verified.category };
}

export async function POST(req: Request) {
  // RFC 8058 one-click: 200 with empty body. Mail clients don't render
  // HTML here — speed and a 2xx are all that matter.
  const result = await process(req);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }
  return new NextResponse(null, { status: 200 });
}

export async function GET(req: Request) {
  const result = await process(req);
  if (!result.ok) {
    return new NextResponse(
      `<!doctype html><html><body style="font-family:-apple-system,sans-serif;max-width:480px;margin:60px auto;padding:24px;color:#111827;">
        <h1 style="font-size:20px;">Unsubscribe link expired</h1>
        <p>This link is invalid or has expired. To manage your email preferences, sign in and visit your <a href="/account" style="color:#1769FF;">account settings</a>.</p>
      </body></html>`,
      { status: result.status, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }
  const friendly =
    result.category === "reengagement"
      ? "re-engagement nudges"
      : result.category;
  return new NextResponse(
    `<!doctype html><html><body style="font-family:-apple-system,sans-serif;max-width:480px;margin:60px auto;padding:24px;color:#111827;line-height:1.55;">
      <h1 style="font-size:22px;">You're unsubscribed</h1>
      <p>We won't send you ${friendly} anymore. Transactional mail (sign-in codes, billing) is unaffected.</p>
      <p style="margin-top:24px;"><a href="/" style="color:#1769FF;">Back to XO Gridmaker →</a></p>
    </body></html>`,
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}
