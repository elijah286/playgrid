// Coach AI user preferences — durable per-coach settings (label aliases,
// default coverages, etc.) that follow the user across all their playbooks.
//
// Schema lives in supabase/migrations/0188_coach_ai_user_preferences.sql.
//
// Lookup precedence when reading a preference for a given (user, playbook):
//   1. row with matching playbook_id (team-specific override)
//   2. row with playbook_id = null (user-level default)
//   3. nothing — fall back to the variant default

import { createClient } from "@/lib/supabase/server";
import type { CoachAiTool } from "./tools";

/**
 * Stable preference keys Cal recognizes. The set is intentionally
 * conservative — adding a new key requires a corresponding interpretation
 * step in the agent prompt + (where applicable) the diagram converter.
 *
 * Pattern: `<surface>_<aspect>` — surface = thing being customized
 * (defender_label, route_label, formation_label), aspect = the specific
 * value (FS, slot, trips_right, etc.).
 *
 * Free-form keys ARE allowed (the column is plain text), but Cal only
 * applies the ones it knows about. Future keys: just add to this list +
 * teach Cal in the prompt.
 */
export const KNOWN_PREFERENCE_KEYS: Record<string, string> = {
  // Defender label aliases — replace the canonical place_defense label
  // with the coach's preferred letter when emitting a diagram.
  defender_label_FS: "Override label for the free safety (default: 'FS').",
  defender_label_SS: "Override label for the strong safety (default: 'SS').",
  defender_label_CB: "Override label for outside corners (default: 'CB').",
  defender_label_NB: "Override label for the nickel / slot DB (default: 'NB').",
  defender_label_M: "Override label for the middle hook / Mike LB (default: 'M' / 'ML').",
  defender_label_W: "Override label for the Will LB (default: 'W' / 'WL').",
  defender_label_S: "Override label for the Sam LB (default: 'S' / 'SL').",
  defender_label_HL: "Override label for the weak-side hook defender (default: 'HL').",
  defender_label_HR: "Override label for the strong-side hook defender (default: 'HR').",
  defender_label_FL: "Override label for the weak-side flat defender (default: 'FL').",
  defender_label_FR: "Override label for the strong-side flat defender (default: 'FR').",

  // Offensive label aliases — coach calls a position something different.
  offense_label_X: "Override label for the X receiver (default: 'X').",
  offense_label_Y: "Override label for the Y / TE (default: 'Y').",
  offense_label_Z: "Override label for the Z receiver (default: 'Z').",
  offense_label_H: "Override label for the H back (default: 'H').",
  offense_label_F: "Override label for the F back / FB (default: 'F').",
  offense_label_B: "Override label for the B / RB (default: 'B').",
  offense_label_QB: "Override label for the QB (default: 'Q' on diagrams).",

  // Behavioral defaults
  preferred_coverage: "Default coverage when the coach doesn't specify one (e.g. 'Cover 3').",
  preferred_front: "Default defensive front when the coach doesn't specify (e.g. '4-3 Over').",
  default_safety_depth_yds: "Override the variant's default deep-safety depth.",
};

export type CoachPreference = {
  key: string;
  value: string;
  scope: "user" | "playbook";
  note: string | null;
};

/**
 * Fetch the active preference set for a coach, with playbook-specific
 * overrides applied on top of user-level defaults. Returns one entry per
 * key (the most-specific scope wins). Used by the agent loop to inject
 * preferences into the system prompt every turn.
 *
 * Returns null when the table is missing (migration 0188 hasn't been
 * applied to the live DB yet) — the caller should treat that as "no
 * preferences configured" and continue.
 */
export async function fetchActivePreferences(
  userId: string,
  playbookId: string | null,
): Promise<CoachPreference[] | null> {
  try {
    const supabase = await createClient();
    const query = supabase
      .from("coach_ai_user_preferences")
      .select("pref_key, pref_value, playbook_id, note")
      .eq("user_id", userId);

    const { data, error } = await query;
    if (error) {
      // Most likely cause: migration 0188 not yet applied.
      if (error.code === "42P01" || /does not exist/i.test(error.message)) {
        return null;
      }
      console.error("[coach-ai] fetchActivePreferences failed:", error);
      return null;
    }

    if (!data || data.length === 0) return [];

    // Resolve precedence: playbook-specific overrides user-level for the
    // same key. Walk the rows once, prefer playbook-id matches.
    const byKey = new Map<string, CoachPreference>();
    for (const row of data) {
      const isPlaybookScope = row.playbook_id !== null;
      // Skip playbook-scoped rows that don't match the current playbook.
      if (isPlaybookScope && row.playbook_id !== playbookId) continue;

      const cur = byKey.get(row.pref_key);
      // Replace if: nothing yet, OR current is user-scoped and new is playbook-scoped.
      if (!cur || (cur.scope === "user" && isPlaybookScope)) {
        byKey.set(row.pref_key, {
          key: row.pref_key,
          value: row.pref_value,
          scope: isPlaybookScope ? "playbook" : "user",
          note: row.note,
        });
      }
    }
    return Array.from(byKey.values());
  } catch (e) {
    console.error("[coach-ai] fetchActivePreferences error:", e);
    return null;
  }
}

/**
 * Render the active preferences as a system-prompt block Cal reads on
 * every turn. Returns empty string if no prefs (so the prompt isn't
 * cluttered with "(none)" boilerplate).
 */
export function renderPreferencesBlock(prefs: CoachPreference[] | null): string {
  if (!prefs || prefs.length === 0) return "";

  // Group label-renames separately so the rule reads naturally.
  const labelRenames: string[] = [];
  const otherPrefs: string[] = [];
  for (const p of prefs) {
    if (p.key.startsWith("defender_label_") || p.key.startsWith("offense_label_")) {
      const canonical = p.key.replace(/^defender_label_|^offense_label_/, "");
      const scopeTag = p.scope === "playbook" ? " (this playbook only)" : "";
      labelRenames.push(`${canonical} → ${p.value}${scopeTag}`);
    } else {
      const scopeTag = p.scope === "playbook" ? " (this playbook only)" : "";
      otherPrefs.push(`${p.key}: ${p.value}${scopeTag}`);
    }
  }

  const lines = ["", "## Coach preferences (apply these on every diagram and answer)", ""];
  if (labelRenames.length > 0) {
    lines.push(
      "**Player label aliases — REQUIRED on every diagram:** when emitting players, replace canonical labels with the coach's preferred ones:",
    );
    for (const r of labelRenames) lines.push(`- ${r}`);
    lines.push(
      "Apply these BOTH for offense (when copying offense letters) AND defense (when copying place_defense's return). Do not silently drop a rename — the coach will notice.",
    );
    lines.push("");
  }
  if (otherPrefs.length > 0) {
    lines.push("**Other preferences:**");
    for (const p of otherPrefs) lines.push(`- ${p}`);
    lines.push("");
  }
  lines.push(
    "If the coach asks you to change one of these (\"actually call my safety C now\"), call `set_user_preference` to update — don't just remember it for one turn.",
  );
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/*  Tools                                                              */
/* ------------------------------------------------------------------ */

const set_user_preference: CoachAiTool = {
  def: {
    name: "set_user_preference",
    description:
      "Persist a coach preference that applies across ALL the coach's playbooks (or scope to one playbook by setting playbook_scope=true). Call this whenever the coach says \"always X\", \"from now on X\", \"I prefer X\", \"I want my Y labeled Z\". " +
      "Confirm the proposed key + value with the coach in plain English BEFORE calling. " +
      "Examples: pref_key=\"defender_label_FS\" pref_value=\"U\" — renames the free safety to U on every diagram. " +
      "pref_key=\"preferred_coverage\" pref_value=\"Cover 3\" — Cal defaults to Cover 3 when the coach doesn't specify. " +
      "Use stable snake_case keys (see the agent prompt's preferences section for the supported set).",
    input_schema: {
      type: "object",
      properties: {
        pref_key: {
          type: "string",
          description: "Stable snake_case key. See agent prompt for supported keys (defender_label_<id>, offense_label_<id>, preferred_coverage, etc.).",
        },
        pref_value: {
          type: "string",
          description: "Free-form value Cal interprets at draw / answer time. Keep it short (a label letter, a coverage name, a yard number).",
        },
        playbook_scope: {
          type: "boolean",
          description:
            "Default false (preference applies across all the coach's playbooks). Set true to scope to the currently-anchored playbook only — use this when the coach says \"for THIS team\" or \"for the Eagles only\".",
        },
        note: {
          type: "string",
          description:
            "Optional human-readable explanation (e.g. \"calls FS U because that's the position name in his system\"). Shown back when listing prefs.",
        },
      },
      required: ["pref_key", "pref_value"],
      additionalProperties: false,
    },
  },
  async handler(input, ctx) {
    const prefKey = typeof input.pref_key === "string" ? input.pref_key.trim() : "";
    const prefValue = typeof input.pref_value === "string" ? input.pref_value.trim() : "";
    const playbookScope = input.playbook_scope === true;
    const note = typeof input.note === "string" && input.note.trim() ? input.note.trim() : null;
    if (!prefKey) return { ok: false, error: "pref_key is required." };
    if (!prefValue) return { ok: false, error: "pref_value is required." };
    if (playbookScope && !ctx.playbookId) {
      return { ok: false, error: "playbook_scope=true but no playbook is anchored — open a playbook first or unset playbook_scope." };
    }

    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { ok: false, error: "Not signed in." };

      const playbookId = playbookScope ? ctx.playbookId : null;
      // Upsert by (user_id, pref_key, playbook_id). The unique constraint
      // covers this composite, but PG treats null as distinct in unique
      // constraints — so we explicitly check and update for the null case.
      let row;
      if (playbookId === null) {
        // Fetch existing user-level row (playbook_id is null).
        const { data: existing } = await supabase
          .from("coach_ai_user_preferences")
          .select("id")
          .eq("user_id", user.id)
          .eq("pref_key", prefKey)
          .is("playbook_id", null)
          .maybeSingle();
        if (existing) {
          const { data, error } = await supabase
            .from("coach_ai_user_preferences")
            .update({ pref_value: prefValue, note })
            .eq("id", existing.id)
            .select()
            .single();
          if (error) throw error;
          row = data;
        } else {
          const { data, error } = await supabase
            .from("coach_ai_user_preferences")
            .insert({ user_id: user.id, playbook_id: null, pref_key: prefKey, pref_value: prefValue, note })
            .select()
            .single();
          if (error) throw error;
          row = data;
        }
      } else {
        // playbook-scoped — composite unique allows upsert via on conflict.
        const { data, error } = await supabase
          .from("coach_ai_user_preferences")
          .upsert(
            { user_id: user.id, playbook_id: playbookId, pref_key: prefKey, pref_value: prefValue, note },
            { onConflict: "user_id,pref_key,playbook_id" },
          )
          .select()
          .single();
        if (error) throw error;
        row = data;
      }

      const scopeLabel = playbookScope ? `this playbook (${ctx.playbookName ?? ctx.playbookId})` : "all your playbooks";
      const knownLabel = KNOWN_PREFERENCE_KEYS[prefKey];
      const knownNote = knownLabel ? ` (${knownLabel})` : "";
      return {
        ok: true,
        result:
          `Saved preference: \`${prefKey}\` = \`${prefValue}\`${knownNote}. ` +
          `Applies to ${scopeLabel}. I'll use this on every diagram and answer from now on.`,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "set_user_preference failed";
      // Friendly error when the table isn't there yet (migration 0188 unapplied).
      if (/does not exist/i.test(msg) || /42P01/.test(msg)) {
        return {
          ok: false,
          error:
            "Preferences storage isn't enabled yet on this deployment (migration 0188 needs to apply). " +
            "I noted your preference for this conversation but won't be able to remember it across sessions until then.",
        };
      }
      return { ok: false, error: msg };
    }
  },
};

const list_user_preferences: CoachAiTool = {
  def: {
    name: "list_user_preferences",
    description:
      "List the coach's saved preferences (label aliases, default coverages, etc.). Call when the coach asks 'what preferences have I set?' or 'show me my preferences'. The active set is also injected into your system prompt every turn — only call this when the coach explicitly wants to see the list.",
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  async handler(_input, ctx) {
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { ok: false, error: "Not signed in." };

      const { data, error } = await supabase
        .from("coach_ai_user_preferences")
        .select("pref_key, pref_value, playbook_id, note")
        .eq("user_id", user.id)
        .order("pref_key");
      if (error) throw error;
      if (!data || data.length === 0) {
        return { ok: true, result: "No preferences saved yet. Tell me \"always X\" or \"I prefer Y\" and I'll save it." };
      }

      const lines = data.map((row) => {
        const scope = row.playbook_id ? (row.playbook_id === ctx.playbookId ? " [this playbook]" : ` [playbook ${row.playbook_id}]`) : " [all playbooks]";
        const noteText = row.note ? ` — ${row.note}` : "";
        return `- \`${row.pref_key}\` = \`${row.pref_value}\`${scope}${noteText}`;
      });
      return { ok: true, result: `Your preferences:\n\n${lines.join("\n")}` };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "list_user_preferences failed";
      if (/does not exist/i.test(msg) || /42P01/.test(msg)) {
        return { ok: true, result: "Preferences storage isn't enabled yet (migration 0188 pending) — nothing to list." };
      }
      return { ok: false, error: msg };
    }
  },
};

const delete_user_preference: CoachAiTool = {
  def: {
    name: "delete_user_preference",
    description:
      "Remove a saved preference. Use when the coach says \"stop labeling FS as U\" or \"forget my preferred coverage\". Confirm with the coach BEFORE calling.",
    input_schema: {
      type: "object",
      properties: {
        pref_key: { type: "string", description: "Snake_case preference key to delete." },
        playbook_scope: {
          type: "boolean",
          description:
            "If true, only deletes the playbook-specific override for the currently-anchored playbook (leaving any user-level value intact). Default false — deletes the user-level preference.",
        },
      },
      required: ["pref_key"],
      additionalProperties: false,
    },
  },
  async handler(input, ctx) {
    const prefKey = typeof input.pref_key === "string" ? input.pref_key.trim() : "";
    const playbookScope = input.playbook_scope === true;
    if (!prefKey) return { ok: false, error: "pref_key is required." };
    if (playbookScope && !ctx.playbookId) {
      return { ok: false, error: "playbook_scope=true but no playbook is anchored." };
    }

    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { ok: false, error: "Not signed in." };

      const playbookId = playbookScope ? ctx.playbookId : null;
      let q = supabase
        .from("coach_ai_user_preferences")
        .delete({ count: "exact" })
        .eq("user_id", user.id)
        .eq("pref_key", prefKey);
      q = playbookId === null ? q.is("playbook_id", null) : q.eq("playbook_id", playbookId);
      const { error, count } = await q;
      if (error) throw error;
      if (!count || count === 0) {
        return { ok: true, result: `No preference with key \`${prefKey}\` to delete.` };
      }
      return { ok: true, result: `Deleted preference \`${prefKey}\`.` };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "delete_user_preference failed";
      if (/does not exist/i.test(msg) || /42P01/.test(msg)) {
        return { ok: true, result: "Preferences storage isn't enabled yet (migration 0188 pending)." };
      }
      return { ok: false, error: msg };
    }
  },
};

export const USER_PREFERENCE_TOOLS: CoachAiTool[] = [
  set_user_preference,
  list_user_preferences,
  delete_user_preference,
];
