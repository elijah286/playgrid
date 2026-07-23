import { redirect } from "next/navigation";
import { getRequestUser } from "@/lib/supabase/request-user";
import { createClient } from "@/lib/supabase/server";
import { resolveUxPreview } from "@/lib/site/ux-preview";
import { isFootballLibraryAvailable } from "@/lib/learn/access";
import {
  readSelectedTeam,
  ALL_TEAMS,
} from "@/features/preview-shell/selected-team-server";
import { listShellTeams } from "@/features/preview-shell/team-context";
import { PreviewChrome } from "@/features/preview-shell/PreviewChrome";
import { getShellCoachCalProps } from "@/features/preview-shell/coach-cal-props";
import { CoachAiLauncher } from "@/features/coach-ai/CoachAiLauncher";

/**
 * Layout for the new-UX preview shell. THE GATE: only a user who is both
 * allowed (admin, or on the `new_shell` allowlist) AND has opted in (cookie)
 * can render here — everyone else is redirected to the production /home. So a
 * production user who somehow lands on an /app URL is bounced out; they never
 * see the preview. All data below comes from the SAME server actions the
 * production app uses — this shell is a lens, not a fork.
 */
export default async function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const authResult = await getRequestUser();
  const user = authResult.kind === "ok" ? authResult.user : null;
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar_url, role, ux_preview_active")
    .eq("id", user.id)
    .maybeSingle();
  const role = (profile?.role as string | null) ?? null;

  const ux = await resolveUxPreview({
    isAuthed: true,
    userRole: role,
    userEmail: user.email ?? null,
    activePreference: (profile?.ux_preview_active as boolean | null) ?? false,
  });
  if (!ux.allowed || !ux.active) redirect("/home");

  const [teams, footballLibraryAvailable] = await Promise.all([
    listShellTeams(),
    isFootballLibraryAvailable(),
  ]);

  const selected = await readSelectedTeam();
  // If the cookie points at a team the user no longer has, fall back to All.
  const selectedResolved =
    selected === ALL_TEAMS || teams.some((t) => t.id === selected)
      ? selected
      : ALL_TEAMS;

  const cal = await getShellCoachCalProps(user.id, role === "admin");

  return (
    <>
      <PreviewChrome
        teams={teams}
        selected={selectedResolved}
        footballLibraryAvailable={footballLibraryAvailable}
        user={{
          email: user.email ?? "",
          displayName: (profile?.display_name as string | null) ?? null,
          avatarUrl: (profile?.avatar_url as string | null) ?? null,
          isAdmin: role === "admin",
        }}
      >
        {children}
      </PreviewChrome>
      {/* The shell's own Coach Cal launcher — SiteHeader's global one is
          unmounted on /app. acceptGlobalCommands so the shell's Cal buttons
          (openCoachCal) open it as a floating/dockable dialog over the main
          view, never full-screen. Wrapped in `hidden` (mirrors SiteHeaderShell)
          to suppress the launcher's built-in in-flow trigger button — the shell
          surfaces its own Cal buttons — while the portaled dialog + the
          coach-cal:open listener stay alive. */}
      <div className="hidden">
        <CoachAiLauncher
          acceptGlobalCommands
          playbookId={selectedResolved !== ALL_TEAMS ? selectedResolved : null}
          isAdmin={cal.isAdmin}
          canDebugCal={cal.canDebugCal}
          entitled={cal.entitled}
          evalDays={cal.evalDays}
          imageUploadAvailable={cal.imageUploadAvailable}
          userTier={cal.userTier}
          coachProTrialUsed={cal.coachProTrialUsed}
        />
      </div>
    </>
  );
}
