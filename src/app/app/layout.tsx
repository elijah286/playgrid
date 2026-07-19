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
    .select("display_name, avatar_url, role")
    .eq("id", user.id)
    .maybeSingle();
  const role = (profile?.role as string | null) ?? null;

  const ux = await resolveUxPreview({
    isAuthed: true,
    userRole: role,
    userEmail: user.email ?? null,
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

  return (
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
  );
}
