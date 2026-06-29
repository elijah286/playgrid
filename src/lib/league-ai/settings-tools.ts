// League settings tools for Leo — registered in lockstep with the operator
// Settings page (rename + registration-link slug). League-scoped via
// ctx.leagueId; writes self-gate on ctx.isLeagueAdmin. There is deliberately NO
// delete tool: deleting a league is irreversible and stays a typed-confirm UI
// action, never an AI write.

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { normalizeLeagueSlug } from "@/lib/league/slug";
import type { LeagueTool, LeagueToolResult } from "./types";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.xogridmaker.com";

const getSettings: LeagueTool = {
  kind: "read",
  def: {
    name: "get_league_settings",
    description:
      "Get this league's name, sport, and public registration link (custom slug if set, otherwise the id URL). Use to answer 'what's my sign-up link?' or 'what sport is this league?'.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  handler: async (_input, ctx): Promise<LeagueToolResult> => {
    const admin = createServiceRoleClient();
    const { data } = await admin
      .from("leagues")
      .select("name, slug, sport")
      .eq("id", ctx.leagueId)
      .maybeSingle();
    if (!data) return { ok: false, error: "League not found." };
    const slug = (data.slug as string | null) ?? null;
    const url = `${SITE_URL}/register/${slug ?? ctx.leagueId}`;
    return {
      ok: true,
      result: `League "${data.name}" · sport: ${data.sport ?? "other"} · registration link: ${url}${
        slug ? "" : " (no custom slug set)"
      }.`,
    };
  },
};

const renameLeague: LeagueTool = {
  kind: "consequential",
  def: {
    name: "rename_league",
    description:
      "Rename this league. CONSEQUENTIAL — requires approval. Provide the new display name.",
    input_schema: {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
    },
  },
  handler: async (input, ctx): Promise<LeagueToolResult> => {
    if (!ctx.isLeagueAdmin) return { ok: false, error: "Only a league admin can rename the league." };
    const name = String(input.name ?? "").trim().slice(0, 120);
    if (!name) return { ok: false, error: "Provide a league name." };
    const admin = createServiceRoleClient();
    const { error } = await admin.from("leagues").update({ name }).eq("id", ctx.leagueId);
    if (error) return { ok: false, error: error.message };
    return { ok: true, result: `Renamed league to "${name}".` };
  },
};

const setRegistrationLink: LeagueTool = {
  kind: "consequential",
  def: {
    name: "set_registration_link",
    description:
      "Set this league's custom registration-link slug (the short URL families use to sign up, e.g. 'waco-spring-2027'). Pass an empty string to clear it. CONSEQUENTIAL — requires approval.",
    input_schema: {
      type: "object",
      properties: { slug: { type: "string" } },
      required: ["slug"],
    },
  },
  handler: async (input, ctx): Promise<LeagueToolResult> => {
    if (!ctx.isLeagueAdmin) {
      return { ok: false, error: "Only a league admin can change the registration link." };
    }
    const norm = normalizeLeagueSlug(String(input.slug ?? ""));
    if (!norm.ok) {
      return {
        ok: false,
        error: "Use lowercase letters, numbers, and hyphens (e.g. waco-spring-2027).",
      };
    }
    const admin = createServiceRoleClient();
    const { error } = await admin
      .from("leagues")
      .update({ slug: norm.slug })
      .eq("id", ctx.leagueId);
    if (error) {
      if (/duplicate|unique/i.test(error.message)) {
        return { ok: false, error: "That link is already taken — try another." };
      }
      return { ok: false, error: error.message };
    }
    const url = norm.slug ? `${SITE_URL}/register/${norm.slug}` : `${SITE_URL}/register/${ctx.leagueId}`;
    return {
      ok: true,
      result: norm.slug
        ? `Registration link set to ${url}.`
        : "Cleared the custom registration link (falls back to the id URL).",
    };
  },
};

export const SETTINGS_TOOLS: LeagueTool[] = [getSettings, renameLeague, setRegistrationLink];
