import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getCoachCalFreePromptAllowance } from "@/lib/site/coach-cal-free-prompts-config";
import { COACH_CAL_FREE_TRIAL_RESET_EMAIL } from "@/lib/billing/coach-cal-test-account";

// Scoped test tool: lets ONE hardcoded account reset its own free Coach Cal
// prompt counter so the owner can repeatedly experience the brand-new-free-user
// flow. It only ever resets the *caller's own* row, and only when the caller is
// signed in as this exact email — so even if the guard were bypassed it could
// not touch anyone else's account. Reached via a "(reset)" link the trial
// banner shows ONLY to this account.
const ALLOWED_EMAIL = COACH_CAL_FREE_TRIAL_RESET_EMAIL;

function html(status: number, body: string): Response {
  return new Response(
    `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:system-ui;max-width:32rem;margin:4rem auto;padding:0 1rem;line-height:1.5">${body}</body>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

export async function GET(): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return html(
      401,
      `<h1>Not signed in</h1><p>Sign in as the test account first, then reload this link.</p>`,
    );
  }

  const email = (user.email ?? "").trim().toLowerCase();
  if (email !== ALLOWED_EMAIL) {
    return html(403, `<h1>Not available</h1><p>This reset link is scoped to a single test account.</p>`);
  }

  // Reset only this caller's own counter. Service role so the write isn't
  // subject to a column-level RLS gap; scoped by id to the authed user.
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("profiles")
    .update({ coach_cal_free_prompts_used: 0 })
    .eq("id", user.id);

  if (error) {
    return html(500, `<h1>Reset failed</h1><p>${error.message}</p>`);
  }

  const allowance = await getCoachCalFreePromptAllowance();
  return html(
    200,
    `<h1>Free Coach Cal usage reset ✅</h1>
     <p>You're back to <strong>${allowance} of ${allowance}</strong> free prompts.</p>
     <p><a href="/home">Return to the app</a> and reload to see the fresh trial banner.</p>`,
  );
}
