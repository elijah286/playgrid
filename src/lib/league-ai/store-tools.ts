// Store/merch catalog tools for Leo — registered in lockstep with the store.
// list is a read; add_store_item is consequential (approval-gated). This is the
// text-based slice of Agent 2's "AI-assisted catalog"; a photo→draft vision flow
// is a later follow-on.

import { createServiceRoleClient } from "@/lib/supabase/admin";
import type { LeagueTool, LeagueToolResult } from "./types";

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function sizesOf(options: unknown): string[] {
  const o = (options ?? {}) as { sizes?: unknown };
  return Array.isArray(o.sizes) ? o.sizes.map((s) => String(s)).filter(Boolean) : [];
}

const listStore: LeagueTool = {
  kind: "read",
  def: {
    name: "list_store_items",
    description:
      "List the league's registration store items (merchandise/equipment) with price, sizes, and whether each is required.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  handler: async (_input, ctx): Promise<LeagueToolResult> => {
    const admin = createServiceRoleClient();
    const { data } = await admin
      .from("league_store_items")
      .select("name, price_cents, required, active, options")
      .eq("league_id", ctx.leagueId)
      .order("sort_order", { ascending: true });
    const rows = (data ?? []).filter((r) => r.active);
    if (rows.length === 0) return { ok: true, result: "No store items yet." };
    const lines = rows.map((r) => {
      const sizes = sizesOf(r.options);
      return `${r.name} — ${money(r.price_cents as number)}${
        r.required ? " (required)" : ""
      }${sizes.length ? ` · sizes: ${sizes.join("/")}` : ""}`;
    });
    return { ok: true, result: `Store items: ${lines.join("; ")}.` };
  },
};

const addStore: LeagueTool = {
  kind: "consequential",
  def: {
    name: "add_store_item",
    description:
      "Add a merchandise/equipment item to the league's registration store. CONSEQUENTIAL — requires approval. Provide a name and price in dollars; optionally a description, sizes, and whether it's required at registration.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        priceDollars: { type: "number" },
        description: { type: "string" },
        sizes: { type: "array", items: { type: "string" } },
        required: { type: "boolean" },
      },
      required: ["name", "priceDollars"],
    },
  },
  handler: async (input, ctx): Promise<LeagueToolResult> => {
    if (!ctx.isLeagueAdmin) return { ok: false, error: "Only a league admin can add store items." };
    const name = String(input.name ?? "").trim().slice(0, 120);
    if (!name) return { ok: false, error: "Provide an item name." };
    const priceCents = Math.max(0, Math.round((Number(input.priceDollars) || 0) * 100));
    const sizes = Array.isArray(input.sizes)
      ? input.sizes.map((s) => String(s).trim()).filter(Boolean).slice(0, 20)
      : [];
    const admin = createServiceRoleClient();
    const { error } = await admin.from("league_store_items").insert({
      league_id: ctx.leagueId,
      name,
      description: input.description ? String(input.description).trim().slice(0, 500) : null,
      price_cents: priceCents,
      required: !!input.required,
      options: { sizes },
    });
    if (error) return { ok: false, error: error.message };
    return {
      ok: true,
      result: `Added "${name}" (${money(priceCents)})${
        sizes.length ? ` with sizes ${sizes.join("/")}` : ""
      } to the store.`,
    };
  },
};

export const STORE_TOOLS: LeagueTool[] = [listStore, addStore];
