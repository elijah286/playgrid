// Communications tools for Leo. Registered into the league-ai registry in
// lockstep with the communications workflow (the AI-readiness convention).
// Reuses the SAME recipient resolver + email sender as the operator UI, so Leo
// and the manual compose screen behave identically.

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { sendLeagueBroadcast } from "@/lib/notifications/league-broadcast-email";
import {
  audienceLabel,
  familyEmailsFromRegistrations,
  resolveBroadcastRecipients,
  type BroadcastAudience,
  type BroadcastAudienceKind,
} from "@/lib/league/broadcast-recipients";
import type { LeagueTool, LeagueToolResult } from "./types";

type RegRow = { applicant: unknown; status: string; team_id?: string | null };

const announcementAudiences: LeagueTool = {
  kind: "read",
  def: {
    name: "announcement_audiences",
    description:
      "How many people each announcement audience reaches by email (everyone, all families, coaches, and each team). Call before proposing to send so you can tell the operator the reach.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  handler: async (_input, ctx): Promise<LeagueToolResult> => {
    const admin = createServiceRoleClient();
    const [regsR, teamsR] = await Promise.all([
      admin
        .from("player_registrations")
        .select("applicant, status, team_id")
        .eq("league_id", ctx.leagueId)
        .limit(10000),
      admin.from("teams").select("id, name, head_coach_email").eq("league_id", ctx.leagueId),
    ]);
    const regs = (regsR.data ?? []) as RegRow[];
    const teams = teamsR.data ?? [];
    const coachEmail = (t: { head_coach_email?: unknown }) =>
      typeof t.head_coach_email === "string" ? t.head_coach_email.trim().toLowerCase() : "";
    const families = new Set(familyEmailsFromRegistrations(regs));
    const coaches = new Set(teams.map(coachEmail).filter(Boolean));
    const everyone = new Set([...families, ...coaches]);
    const teamLines = teams.map((t) => {
      const fam = new Set(familyEmailsFromRegistrations(regs, t.id as string));
      const ce = coachEmail(t);
      if (ce) fam.add(ce);
      return `${t.name} (${fam.size})`;
    });
    return {
      ok: true,
      result:
        `Reach by audience — Everyone: ${everyone.size}, All families: ${families.size}, ` +
        `Coaches: ${coaches.size}. Per team: ${teamLines.join(", ") || "no teams yet"}.`,
    };
  },
};

const sendAnnouncement: LeagueTool = {
  kind: "consequential",
  def: {
    name: "send_announcement",
    description:
      "Send an email announcement to a league audience. CONSEQUENTIAL — the operator must approve before it sends. audience is one of everyone | families | coaches | team (teamId required when audience is team).",
    input_schema: {
      type: "object",
      properties: {
        audience: { type: "string", enum: ["everyone", "families", "coaches", "team"] },
        teamId: { type: "string", description: "required when audience is 'team'" },
        subject: { type: "string" },
        body: { type: "string" },
      },
      required: ["audience", "subject", "body"],
    },
  },
  handler: async (input, ctx): Promise<LeagueToolResult> => {
    const audienceKind = String(input.audience ?? "") as BroadcastAudienceKind;
    const subject = String(input.subject ?? "").trim();
    const body = String(input.body ?? "").trim();
    const teamId = input.teamId ? String(input.teamId) : undefined;
    if (!subject || !body) return { ok: false, error: "Subject and body are required." };
    if (audienceKind === "team" && !teamId) {
      return { ok: false, error: "teamId is required for a team audience." };
    }
    const audience: BroadcastAudience = { kind: audienceKind, teamId };

    const admin = createServiceRoleClient();
    const recipients = await resolveBroadcastRecipients(admin, ctx.leagueId, audience);
    if (recipients.length === 0) return { ok: false, error: "No recipients for that audience." };

    const { data: league } = await admin
      .from("leagues")
      .select("name")
      .eq("id", ctx.leagueId)
      .maybeSingle();
    const leagueName = (league?.name as string) ?? "Your league";
    let teamName: string | null = null;
    if (audience.kind === "team" && teamId) {
      const { data: tm } = await admin
        .from("teams")
        .select("name")
        .eq("id", teamId)
        .eq("league_id", ctx.leagueId)
        .maybeSingle();
      teamName = (tm?.name as string | null) ?? null;
    }

    const res = await sendLeagueBroadcast({ recipients, leagueName, title: subject, body });
    if (res.error) return { ok: false, error: res.error };

    await admin.from("league_broadcasts").insert({
      league_id: ctx.leagueId,
      audience: audienceLabel(audience, teamName),
      title: subject,
      body,
      recipient_count: res.sent,
      sent_at: new Date().toISOString(),
      created_by: ctx.userId,
    });
    return {
      ok: true,
      result: `Sent "${subject}" to ${res.sent} recipients (${audienceLabel(audience, teamName)}).`,
    };
  },
};

export const COMMS_TOOLS: LeagueTool[] = [announcementAudiences, sendAnnouncement];
