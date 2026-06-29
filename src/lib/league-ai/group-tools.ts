// Cross-league group tools for Leo. Operator-scoped (use ctx.userId), so they
// work from any league context. Registered in lockstep with the league-groups
// workflow; the send reuses the SAME shared helper as the portfolio action.

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { sendGroupBroadcast } from "@/lib/league/group-broadcast";
import type { LeagueTool, LeagueToolResult } from "./types";

const listGroups: LeagueTool = {
  kind: "read",
  def: {
    name: "list_league_groups",
    description:
      "List the operator's league groups (e.g. 'Waco, TX') with the leagues in each, including each group's id. Use to find a group to message across leagues.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  handler: async (_input, ctx): Promise<LeagueToolResult> => {
    const admin = createServiceRoleClient();
    const { data: groups } = await admin
      .from("league_groups")
      .select("id, name")
      .eq("owner_id", ctx.userId)
      .order("created_at", { ascending: true });
    const groupRows = groups ?? [];
    if (groupRows.length === 0) return { ok: true, result: "No league groups yet." };

    const { data: members } = await admin
      .from("league_group_members")
      .select("group_id, leagues(name)")
      .in(
        "group_id",
        groupRows.map((g) => g.id as string),
      );
    const byGroup = new Map<string, string[]>();
    for (const m of members ?? []) {
      const name = ((m.leagues ?? null) as { name?: string } | null)?.name ?? "League";
      const list = byGroup.get(m.group_id as string) ?? [];
      list.push(name);
      byGroup.set(m.group_id as string, list);
    }
    const lines = groupRows.map(
      (g) => `"${g.name}" [id:${g.id}] → ${(byGroup.get(g.id as string) ?? []).join(", ") || "no leagues"}`,
    );
    return { ok: true, result: `League groups: ${lines.join("; ")}.` };
  },
};

const sendGroup: LeagueTool = {
  kind: "consequential",
  def: {
    name: "send_group_announcement",
    description:
      "Send one email announcement to EVERY league in one of the operator's groups (deduped). CONSEQUENTIAL — requires approval. audience: everyone | families | coaches.",
    input_schema: {
      type: "object",
      properties: {
        groupId: { type: "string" },
        audience: { type: "string", enum: ["everyone", "families", "coaches"] },
        subject: { type: "string" },
        body: { type: "string" },
      },
      required: ["groupId", "audience", "subject", "body"],
    },
  },
  handler: async (input, ctx): Promise<LeagueToolResult> => {
    const groupId = String(input.groupId ?? "");
    const audienceKind = String(input.audience ?? "") as "everyone" | "families" | "coaches";
    const subject = String(input.subject ?? "").trim();
    const body = String(input.body ?? "").trim();
    if (!groupId || !subject || !body) {
      return { ok: false, error: "groupId, subject, and body are required." };
    }

    const admin = createServiceRoleClient();
    const { data: group } = await admin
      .from("league_groups")
      .select("id, name, owner_id")
      .eq("id", groupId)
      .maybeSingle();
    if (!group || group.owner_id !== ctx.userId) return { ok: false, error: "Group not found." };

    const { data: members } = await admin
      .from("league_group_members")
      .select("league_id")
      .eq("group_id", groupId);
    const leagueIds = (members ?? []).map((m) => m.league_id as string);

    const result = await sendGroupBroadcast(admin, {
      groupName: group.name as string,
      leagueIds,
      audience: { kind: audienceKind },
      title: subject,
      body,
      userId: ctx.userId,
    });
    if (!result.ok) return { ok: false, error: result.error };
    return {
      ok: true,
      result: `Sent "${subject}" to ${result.sent} recipients across ${result.leagues} leagues in "${group.name}".`,
    };
  },
};

export const GROUP_TOOLS: LeagueTool[] = [listGroups, sendGroup];
