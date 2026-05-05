/**
 * Coach Cal play tools — list_plays, get_play, update_play.
 *
 * These tools are available in normal mode whenever Coach Cal is anchored
 * to a specific playbook (ctx.playbookId !== null).  update_play also
 * requires ctx.canEditPlaybook.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { coachDiagramToPlayDocument, type CoachDiagram } from "@/features/coach-ai/coachDiagramConverter";
import { recordPlayVersion } from "@/lib/versions/play-version-writer";
import type { PlayDocument, SportVariant } from "@/domain/play/types";
import type { PlaySpec } from "@/domain/play/spec";
import { parsePlaySpec } from "@/domain/play/spec";
import { coachDiagramToPlaySpec } from "@/domain/play/specParser";
import { playSpecToCoachDiagram, type RenderWarning } from "@/domain/play/specRenderer";
import { parseCoachDiagram } from "@/features/coach-ai/coachDiagramConverter";
import { sanitizeCoachDiagram } from "@/domain/play/sanitize";
import type { CoachAiTool } from "./tools";
import { validateRouteAssignments, type RouteAssignmentError } from "./route-assignment-validate";
import { validatePlayContent, formatPlayContentErrors } from "./play-content-validate";
import { defaultSettingsForVariant, normalizePlaybookSettings } from "@/domain/playbook/settings";
import { validateDefenderAssignments, formatDefenseValidationErrors } from "./defense-validate";
import { projectSpecToNotes } from "./notes-from-spec";
import {
  lintNotesAgainstSpec,
  lintNotesSideAwareness,
  formatNotesLintIssues,
  formatSideAwarenessIssues,
} from "./notes-lint";
import { explainSpec } from "./explain-from-spec";
import { applyPlayerStyleMod } from "./player-mutations";

const LOS_Y = 0.4;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Read a playbook's normalized settings (centerIsEligible, blocking
 * rules, etc.) for the save-time content validators. Falls back to
 * variant defaults when the column is missing or the row can't be
 * read (don't block a save on a settings query failure — the gate
 * will use defaults that match the variant convention).
 */
async function loadPlaybookSettings(
  playbookId: string,
  variant: SportVariant,
) {
  try {
    const admin = createServiceRoleClient();
    const { data } = await admin
      .from("playbooks")
      .select("settings, player_count")
      .eq("id", playbookId)
      .maybeSingle();
    return normalizePlaybookSettings(
      data?.settings ?? null,
      variant,
      (data as { player_count?: number | null } | null)?.player_count ?? null,
    );
  } catch {
    return defaultSettingsForVariant(variant);
  }
}

type ResolverPlayRow = {
  id: string;
  name: string;
  sort_order: number;
  group_id: string | null;
};

type OrderedPlaybook = {
  /** Plays in playbook display order — same compareNavPlays sort the UI uses. */
  plays: ResolverPlayRow[];
  /** group_id (or empty string for ungrouped) → display label. */
  groupLabelByKey: Map<string, string>;
  /** group_id (or empty string) → 1-based slot map for that section. */
  slotByPlayId: Map<string, number>;
  /** group_id (or empty string) → ordered plays in that section. */
  sectionPlays: Map<string, ResolverPlayRow[]>;
  /** Section keys in display order (ungrouped first). */
  sectionOrder: string[];
};

const UNGROUPED_LABEL = "Ungrouped";

async function loadOrderedPlaybook(playbookId: string): Promise<{ ok: true; data: OrderedPlaybook } | { ok: false; error: string }> {
  const admin = createServiceRoleClient();
  // Mirror the playbook UI's compareNavPlays ordering so slot numbers
  // restart per group and match the orange play badges. See ui.tsx
  // (positionByPlayId) for the per-section, 1-based numbering the coach sees.
  const [playsRes, groupsRes] = await Promise.all([
    admin
      .from("plays")
      .select("id, name, sort_order, group_id")
      .eq("playbook_id", playbookId)
      .eq("is_archived", false)
      .is("deleted_at", null)
      .is("attached_to_play_id", null),
    admin
      .from("playbook_groups")
      .select("id, name, sort_order, deleted_at")
      .eq("playbook_id", playbookId)
      .is("deleted_at", null),
  ]);
  if (playsRes.error) return { ok: false, error: playsRes.error.message };

  const groupSortById = new Map<string, number>();
  const groupNameById = new Map<string, string>();
  for (const g of (groupsRes.data ?? []) as Array<{ id: string; name: string; sort_order: number | null }>) {
    groupSortById.set(g.id, g.sort_order ?? 0);
    groupNameById.set(g.id, g.name ?? "");
  }

  const plays = ((playsRes.data ?? []) as ResolverPlayRow[])
    .slice()
    .sort((a, b) => {
      const ungA = a.group_id == null ? 0 : 1;
      const ungB = b.group_id == null ? 0 : 1;
      if (ungA !== ungB) return ungA - ungB;
      const ga = a.group_id != null ? groupSortById.get(a.group_id) ?? 0 : 0;
      const gb = b.group_id != null ? groupSortById.get(b.group_id) ?? 0 : 0;
      if (ga !== gb) return ga - gb;
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    });

  const groupLabelByKey = new Map<string, string>();
  const sectionPlays = new Map<string, ResolverPlayRow[]>();
  const sectionOrder: string[] = [];
  const slotByPlayId = new Map<string, number>();
  for (const p of plays) {
    const key = p.group_id ?? "";
    if (!sectionPlays.has(key)) {
      sectionPlays.set(key, []);
      sectionOrder.push(key);
      groupLabelByKey.set(
        key,
        p.group_id ? groupNameById.get(p.group_id) ?? "(unknown group)" : UNGROUPED_LABEL,
      );
    }
    const arr = sectionPlays.get(key)!;
    arr.push(p);
    slotByPlayId.set(p.id, arr.length);
  }

  return { ok: true, data: { plays, groupLabelByKey, slotByPlayId, sectionPlays, sectionOrder } };
}

/** Strip a leading "play" or "#" / "/" / "—" / dash separators (e.g. "Recommended Play 5" → "5"). */
function parseTrailingSlot(remainder: string): number | null {
  const m = remainder.trim().match(/^(?:[#/\-–—:]\s*)?(?:play\s*)?#?\s*(\d+)\s*$/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Pure resolver — given a parsed playbook and a raw input string, return the
 * matching play (or an error). Factored out so it can be unit-tested without
 * mocking Supabase. `resolvePlayId` is the I/O wrapper.
 *
 * Accepts:
 *   - a real UUID — returned as-is after confirming it's in the playbook
 *   - a group-qualified slot — "Recommended #5", "Goal Line/2", "Ungrouped 3" —
 *     numbered 1-based within that group (matches the orange UI badges)
 *   - a bare slot — "5", "Play 5", "#5" — accepted only when exactly one
 *     section has a play at that position; otherwise the candidates are returned
 *     so Cal can ask which group
 *   - an exact play name (case-insensitive)
 *   - a fuzzy substring match if exactly one play matches
 */
export function resolvePlayIdFromOrdered(
  rawInput: string,
  ordered: OrderedPlaybook,
): { ok: true; id: string; name: string } | { ok: false; error: string } {
  const input = rawInput.trim();
  if (!input) return { ok: false, error: "play_id is required." };

  const { plays, groupLabelByKey, slotByPlayId, sectionPlays, sectionOrder } = ordered;
  if (plays.length === 0) return { ok: false, error: "No plays in this playbook." };

  // 1) Direct UUID match.
  if (UUID_RE.test(input)) {
    const hit = plays.find((p) => p.id === input);
    if (hit) return { ok: true, id: hit.id, name: hit.name };
    return { ok: false, error: `No play with id ${input} in this playbook.` };
  }

  // Build a quick lookup: lowercased group label → section key. Allow fuzzy
  // start-of-input matching since Cal might have stripped/altered formatting
  // (e.g. "Goal-line #2" for "Goal Line").
  const labelEntries: Array<{ key: string; label: string }> = [];
  for (const key of sectionOrder) {
    labelEntries.push({ key, label: groupLabelByKey.get(key) ?? "" });
  }
  // Sort longer labels first so "Goal Line Red Zone" wins over "Goal Line".
  labelEntries.sort((a, b) => b.label.length - a.label.length);

  const lower = input.toLowerCase();

  // 2) Group-qualified slot — "Recommended #5", "Goal Line/2", "Ungrouped 3".
  for (const { key, label } of labelEntries) {
    if (!label) continue;
    const lowerLabel = label.toLowerCase();
    if (!lower.startsWith(lowerLabel)) continue;
    const remainder = input.slice(label.length);
    const slot = parseTrailingSlot(remainder);
    if (slot == null) continue;
    const section = sectionPlays.get(key) ?? [];
    if (slot >= 1 && slot <= section.length) {
      const hit = section[slot - 1];
      return { ok: true, id: hit.id, name: hit.name };
    }
    return {
      ok: false,
      error: `Slot ${slot} is out of range for "${label}" (${section.length} play${section.length === 1 ? "" : "s"}).`,
    };
  }

  // 3) Bare slot — "5", "Play 5", "#5". With per-group numbering this is
  //    only unambiguous when exactly one section has a play at that slot.
  const bareSlot = parseTrailingSlot(input);
  if (bareSlot != null) {
    const candidates: Array<{ key: string; label: string; row: ResolverPlayRow }> = [];
    for (const key of sectionOrder) {
      const section = sectionPlays.get(key) ?? [];
      if (bareSlot >= 1 && bareSlot <= section.length) {
        candidates.push({ key, label: groupLabelByKey.get(key) ?? "", row: section[bareSlot - 1] });
      }
    }
    if (candidates.length === 1) {
      return { ok: true, id: candidates[0].row.id, name: candidates[0].row.name };
    }
    if (candidates.length === 0) {
      return {
        ok: false,
        error: `No section has a play at slot ${bareSlot}. Use the group-qualified form (e.g. "${groupLabelByKey.get(sectionOrder[0]) ?? UNGROUPED_LABEL} #${bareSlot}") or the play name.`,
      };
    }
    const list = candidates
      .map((c) => `"${c.label} #${bareSlot}" → "${c.row.name}"`)
      .join(", ");
    return {
      ok: false,
      error: `"${input}" is ambiguous — multiple groups have a #${bareSlot}. Pick one: ${list}.`,
    };
  }

  // 4) Exact name match (case-insensitive).
  const exact = plays.filter((p) => p.name.toLowerCase() === lower);
  if (exact.length === 1) return { ok: true, id: exact[0].id, name: exact[0].name };
  if (exact.length > 1) {
    const tags = exact
      .map((p) => `"${groupLabelByKey.get(p.group_id ?? "") ?? UNGROUPED_LABEL} #${slotByPlayId.get(p.id) ?? "?"}"`)
      .join(", ");
    return {
      ok: false,
      error: `Multiple plays named "${input}". Use the group-qualified slot or UUID to disambiguate. Candidates: ${tags}.`,
    };
  }

  // 5) Fuzzy substring match — accept only if exactly one hit.
  const fuzzy = plays.filter((p) => p.name.toLowerCase().includes(lower));
  if (fuzzy.length === 1) return { ok: true, id: fuzzy[0].id, name: fuzzy[0].name };
  if (fuzzy.length > 1) {
    const matches = fuzzy
      .slice(0, 5)
      .map((p) => `"${p.name}" (${groupLabelByKey.get(p.group_id ?? "") ?? UNGROUPED_LABEL} #${slotByPlayId.get(p.id) ?? "?"})`)
      .join(", ");
    return {
      ok: false,
      error: `"${input}" matched multiple plays. Use the group-qualified slot or full name. Matches: ${matches}.`,
    };
  }

  return { ok: false, error: `No play matched "${input}" — try the group-qualified slot (e.g. "Recommended #5") or exact name.` };
}

/** I/O wrapper: load the playbook ordering, then run the pure resolver. */
export async function resolvePlayId(
  rawInput: string,
  playbookId: string,
): Promise<{ ok: true; id: string; name: string } | { ok: false; error: string }> {
  const trimmed = rawInput.trim();
  if (!trimmed) return { ok: false, error: "play_id is required." };
  const loaded = await loadOrderedPlaybook(playbookId);
  if (!loaded.ok) return loaded;
  return resolvePlayIdFromOrdered(trimmed, loaded.data);
}

// Internal helper exported only for testing — builds an OrderedPlaybook from
// in-memory rows, mirroring the database loader's sort/section logic.
export function _buildOrderedPlaybookForTest(args: {
  plays: Array<{ id: string; name: string; sort_order: number; group_id: string | null }>;
  groups: Array<{ id: string; name: string; sort_order: number }>;
}): OrderedPlaybook {
  const groupSortById = new Map<string, number>();
  const groupNameById = new Map<string, string>();
  for (const g of args.groups) {
    groupSortById.set(g.id, g.sort_order);
    groupNameById.set(g.id, g.name);
  }
  const plays = args.plays.slice().sort((a, b) => {
    const ungA = a.group_id == null ? 0 : 1;
    const ungB = b.group_id == null ? 0 : 1;
    if (ungA !== ungB) return ungA - ungB;
    const ga = a.group_id != null ? groupSortById.get(a.group_id) ?? 0 : 0;
    const gb = b.group_id != null ? groupSortById.get(b.group_id) ?? 0 : 0;
    if (ga !== gb) return ga - gb;
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  });
  const groupLabelByKey = new Map<string, string>();
  const sectionPlays = new Map<string, ResolverPlayRow[]>();
  const sectionOrder: string[] = [];
  const slotByPlayId = new Map<string, number>();
  for (const p of plays) {
    const key = p.group_id ?? "";
    if (!sectionPlays.has(key)) {
      sectionPlays.set(key, []);
      sectionOrder.push(key);
      groupLabelByKey.set(
        key,
        p.group_id ? groupNameById.get(p.group_id) ?? "(unknown group)" : UNGROUPED_LABEL,
      );
    }
    const arr = sectionPlays.get(key)!;
    arr.push(p);
    slotByPlayId.set(p.id, arr.length);
  }
  return { plays, groupLabelByKey, slotByPlayId, sectionPlays, sectionOrder };
}

/** Convert a saved PlayDocument back into the CoachDiagram yard-based format. */
export function playDocumentToCoachDiagram(doc: PlayDocument, name: string): CoachDiagram {
  const { fieldWidthYds, fieldLengthYds, variant } = doc.sportProfile;

  // Build a stable id per player that's unique within the diagram. Letter
  // labels collide regularly (twins formation, two Zs in 4-wide, etc.) and
  // collapsing both into the same diagram id makes Coach Cal conflate the
  // players — every route attaches to the first one. Suffix duplicates
  // (Z, Z2, Z3) so each player has a distinct handle while the display
  // letter (`role`) stays the original. Single-player cases are unchanged.
  const seen = new Map<string, number>();
  const idByPlayerUuid = new Map<string, string>();
  for (const p of doc.layers.players) {
    const base = p.label || p.id;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    idByPlayerUuid.set(p.id, count === 1 ? base : `${base}${count}`);
  }

  const players = doc.layers.players.map((p) => ({
    id: idByPlayerUuid.get(p.id)!,
    role: p.label || p.role,
    x: Math.round(((p.position.x - 0.5) * fieldWidthYds) * 10) / 10,
    y: Math.round(((p.position.y - LOS_Y) * fieldLengthYds) * 10) / 10,
    team: (p.style.fill === "#DC2626" || p.style.fill === "#B91C1C") ? "D" as const : "O" as const,
    color: p.style.fill,
  }));

  const routes = doc.layers.routes.map((r) => {
    const nodes = r.nodes.slice(1); // skip start node (= player position)
    const path: [number, number][] = nodes.map((n) => [
      Math.round(((n.position.x - 0.5) * fieldWidthYds) * 10) / 10,
      Math.round(((n.position.y - LOS_Y) * fieldLengthYds) * 10) / 10,
    ]);
    const fromLabel = idByPlayerUuid.get(r.carrierPlayerId) ?? r.carrierPlayerId;
    const hasCurve = r.segments.some((s) => s.shape === "curve");
    // Round-trip the saved RouteSemantic back to a `route_kind` string so
    // subsequent update_play calls keep passing the SFPA validator. For
    // family="custom" with a tag, prefer the tag (e.g. "dig"); otherwise
    // use the family name. Routes saved before SFPA shipped have
    // semantic=null and round-trip without route_kind (still valid).
    const kind = r.semantic
      ? r.semantic.family === "custom"
        ? (r.semantic.tags?.[0] ?? "")
        : r.semantic.family
      : "";
    return {
      from: fromLabel,
      path,
      ...(hasCurve ? { curve: true } : {}),
      tip: (r.endDecoration ?? "arrow") as "arrow" | "t" | "none",
      ...(kind ? { route_kind: kind } : {}),
    };
  });

  // Coverage zones (Cover 2 deep halves, hook/curl drops, etc.) live on the
  // play document and are part of how a defensive diagram reads — without
  // them Cal sees a defensive play as just a row of red dots and ends up
  // describing positions instead of coverage. PlayDocument stores HALF
  // extents in normalized coords; CoachDiagram uses FULL width/height in
  // yards, so multiply by 2 and by the field dimensions.
  const zones = (doc.layers.zones ?? []).map((z) => ({
    kind: z.kind,
    center: [
      Math.round(((z.center.x - 0.5) * fieldWidthYds) * 10) / 10,
      Math.round(((z.center.y - LOS_Y) * fieldLengthYds) * 10) / 10,
    ] as [number, number],
    size: [
      Math.round((z.size.w * 2 * fieldWidthYds) * 10) / 10,
      Math.round((z.size.h * 2 * fieldLengthYds) * 10) / 10,
    ] as [number, number],
    label: z.label,
    color: z.style.fill,
  }));

  return {
    title: name,
    variant: variant as string,
    players,
    routes,
    ...(zones.length > 0 ? { zones } : {}),
  };
}

/**
 * Format route-assignment errors into a single critique string Cal sees as
 * the tool's `error` field. Lists each violation by carrier + declared kind
 * so Cal can re-emit the diagram with corrected route_kinds (or corrected
 * geometry if the kind is right but the path was wrong).
 */
function formatRouteAssignmentErrors(errors: RouteAssignmentError[]): string {
  const lines = errors.map((e) => `  • ${e.carrier} (declared "${e.declaredKind}"): ${e.message}`);
  return (
    `Route-assignment validation failed for ${errors.length} route(s) — diagram NOT saved. ` +
    `Each declared route_kind must agree with the path's depth and side per the catalog's constraints. ` +
    `Fix the route_kind to match the geometry, or fix the path to match the route_kind, then re-emit.\n` +
    lines.join("\n")
  );
}

/**
 * Render warnings split into "hard" (block save) and "soft" (save anyway,
 * surface to Cal). Hard warnings indicate the saved play would be a
 * silent substitution of what Cal asked for — formation fallback, route
 * template not in the catalog, sanitizer dropping geometry, a specific
 * defense missing from the catalog (note: unknown/unknown is short-circuited
 * upstream and never emits the warning). Soft warnings indicate "Cal
 * referenced something we couldn't place; we dropped it but the rest
 * of the play is honored verbatim" — assignment_player_missing,
 * defender_*_missing, defender_zone_unknown. Soft warnings match the
 * legacy diagram path's behavior (which silently dropped routes whose
 * carrier wasn't on the field) so Cal isn't penalized for label
 * mismatches that don't corrupt the diagram.
 */
export const HARD_RENDER_WARNINGS: ReadonlySet<RenderWarning["code"]> = new Set([
  "formation_fallback",
  "formation_player_count_mismatch",
  "defense_unknown",
  "route_template_missing",
  "sanitizer_dropped",
]);

export function isHardWarning(w: RenderWarning): boolean {
  return HARD_RENDER_WARNINGS.has(w.code);
}

/**
 * Format renderer warnings (from playSpecToCoachDiagram) into a critique
 * shown when at least one HARD warning fires. Soft warnings are formatted
 * separately by formatSpecRenderSoftWarnings for inclusion in success
 * responses.
 */
function formatSpecRenderWarnings(warnings: ReadonlyArray<RenderWarning>): string {
  const lines = warnings.map((w) => `  • [${w.code}] ${w.message}`);
  return (
    `PlaySpec render failed — ${warnings.length} issue(s). The spec is the source of truth, so silent fallbacks aren't acceptable. ` +
    `Fix the spec (or change to a catalog formation/defense/route family) and re-emit.\n` +
    lines.join("\n")
  );
}

/**
 * Format soft warnings as a non-fatal "by the way" note appended to a
 * successful save, so Cal can mention to the coach which assignments
 * were dropped (e.g. "You asked Y to run a route, but Trips Right's
 * roster is X/Z/H/S — Y wasn't drawn").
 */
function formatSpecRenderSoftWarnings(warnings: ReadonlyArray<RenderWarning>): string {
  if (warnings.length === 0) return "";
  const lines = warnings.map((w) => `  • [${w.code}] ${w.message}`);
  return `\nNote — ${warnings.length} assignment(s) couldn't be placed and were skipped:\n${lines.join("\n")}`;
}

/**
 * Walk a saved spec and produce a one-line confidence summary. Used in
 * create_play / update_play tool results so Cal sees, immediately after
 * a save, which elements (if any) are low-confidence — and can prompt
 * the coach to confirm before claiming success.
 *
 * Returns "" when everything is high — saves Cal a noise line.
 */
function summarizeConfidence(spec: PlaySpec | null): string {
  if (!spec) return "";
  type Item = { label: string; conf: "high" | "med" | "low" };
  const items: Item[] = [];
  items.push({ label: `formation "${spec.formation.name}"`, conf: spec.formation.confidence ?? "high" });
  if (spec.defense) {
    items.push({
      label: `defense ${spec.defense.front}/${spec.defense.coverage}`,
      conf: spec.defense.confidence ?? "high",
    });
  }
  for (const a of spec.assignments) {
    items.push({ label: `@${a.player}`, conf: a.confidence ?? "high" });
  }
  const lows = items.filter((i) => i.conf === "low");
  const meds = items.filter((i) => i.conf === "med");
  if (lows.length === 0 && meds.length === 0) return "";

  const lowClause = lows.length > 0 ? `Low-confidence: ${lows.map((i) => i.label).slice(0, 5).join(", ")}${lows.length > 5 ? ` (+${lows.length - 5} more)` : ""}.` : "";
  const medClause = meds.length > 0 ? `Medium-confidence: ${meds.map((i) => i.label).slice(0, 5).join(", ")}.` : "";
  const reminder =
    lows.length > 0
      ? " Surface these to the coach before claiming the play is fully ready — they may need confirmation."
      : "";
  return `\n\n${[lowClause, medClause].filter(Boolean).join(" ")}${reminder}`;
}

/**
 * Result shape from resolveDiagramAndSpec. `diagram` is what gets
 * rendered + persisted; `spec` is what gets stamped on
 * PlayDocument.metadata.spec for downstream notes generation.
 */
type ResolvedInput =
  | { ok: true; diagram: CoachDiagram; spec: PlaySpec | null; softWarnings: ReadonlyArray<RenderWarning> }
  | { ok: false; error: string };

/**
 * Resolve the inputs Cal can pass to create_play / update_play into a
 * single (diagram, spec) pair. The two paths:
 *
 *   1. PlaySpec input — Cal composed via primitives. Render to diagram
 *      via specRenderer; promote any warnings to errors (the spec is
 *      authoritative, no silent fallbacks); save spec verbatim.
 *
 *   2. Legacy CoachDiagram input — Cal emitted waypoints directly.
 *      Use the diagram as-is; derive a best-effort spec via
 *      coachDiagramToPlaySpec so future edits + notes generation have
 *      a structured handle.
 *
 * Either input may be provided; play_spec wins if both. The diagram-only
 * path is the backward-compatible legacy flow and stays supported until
 * Cal's prompt is updated to prefer specs (Phase 4).
 */
function resolveDiagramAndSpec(
  rawSpec: unknown,
  rawDiagram: unknown,
  resolvedVariant: SportVariant,
  options: {
    formationName?: string;
    playType?: "offense" | "defense" | "special_teams";
  } = {},
): ResolvedInput {
  // SCHEMA TOOL-INPUT BOUNDARY (AGENTS.md Rule: strict at write).
  // Both paths run their inputs through the canonical Zod schemas
  // before any further processing. This blocks Cal from smuggling
  // unknown fields, malformed nested shapes, or wrong-typed values
  // into the converter chain — every byte of the diagram/spec
  // matches the contract before it touches geometry math.

  // Path 1: PlaySpec input.
  if (rawSpec && typeof rawSpec === "object") {
    // Inject the resolved variant BEFORE parse — the spec schema
    // requires `variant`, and we want playbook-context to win over
    // whatever the spec author set anyway.
    const candidate = { ...(rawSpec as Record<string, unknown>), variant: resolvedVariant };
    const parsed = parsePlaySpec(candidate);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .slice(0, 6)
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ");
      return {
        ok: false,
        error:
          `play_spec failed schema validation. Fix the spec shape and re-emit. ` +
          `Issues: ${issues}${parsed.error.issues.length > 6 ? `, +${parsed.error.issues.length - 6} more` : ""}.`,
      };
    }
    const spec = parsed.data as PlaySpec;
    // Phase D4: validate defender overrides BEFORE rendering so the
    // error message points at the spec, not the warning surface. Render
    // warnings still fire for catalog-defaulted defenders (e.g. unknown
    // defense ref); this layer covers the spec-side overrides.
    const defenseValidation = validateDefenderAssignments(spec);
    if (!defenseValidation.ok) {
      return { ok: false, error: formatDefenseValidationErrors(defenseValidation.errors) };
    }
    const { diagram, warnings } = playSpecToCoachDiagram(spec);
    const hardWarnings = warnings.filter(isHardWarning);
    if (hardWarnings.length > 0) {
      return { ok: false, error: formatSpecRenderWarnings(hardWarnings) };
    }
    const softWarnings = warnings.filter((w) => !isHardWarning(w));
    return { ok: true, diagram, spec, softWarnings };
  }

  // Path 2: legacy CoachDiagram input.
  if (rawDiagram && typeof rawDiagram === "object") {
    const parsed = parseCoachDiagram(rawDiagram);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .slice(0, 6)
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ");
      return {
        ok: false,
        error:
          `diagram failed schema validation. ` +
          `Issues: ${issues}${parsed.error.issues.length > 6 ? `, +${parsed.error.issues.length - 6} more` : ""}.`,
      };
    }
    const diagram = parsed.data as CoachDiagram;
    const derivedSpec = coachDiagramToPlaySpec(diagram, {
      variant: resolvedVariant,
      formation: options.formationName,
      playType: options.playType,
    });
    return { ok: true, diagram, spec: derivedSpec, softWarnings: [] };
  }

  return {
    ok: false,
    error:
      "Either play_spec (preferred) or diagram (legacy) is required. " +
      "play_spec is the structured composition path: { variant, formation: { name }, assignments: [...] }. " +
      "diagram is the legacy waypoint format.",
  };
}

const list_plays: CoachAiTool = {
  def: {
    name: "list_plays",
    description:
      "List all plays in the current playbook. Returns each play's id, name, " +
      "formation, play type, group, and tags. Call this before get_play to find " +
      "the right play id, or when the coach asks what plays are in the playbook.",
    input_schema: {
      type: "object",
      properties: {
        filter_name: {
          type: "string",
          description: "Optional substring to filter plays by name (case-insensitive).",
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  async handler(input, ctx) {
    if (!ctx.playbookId) return { ok: false, error: "No playbook selected." };
    const filter = typeof input.filter_name === "string" ? input.filter_name.toLowerCase() : null;

    try {
      const ordered = await loadOrderedPlaybook(ctx.playbookId);
      if (!ordered.ok) return ordered;
      const { plays, groupLabelByKey, slotByPlayId, sectionPlays, sectionOrder } = ordered.data;
      if (plays.length === 0) return { ok: true, result: "No plays found in this playbook." };

      // Pull formation/type/tags in a single round-trip — we already have ids
      // from the resolver helper but it doesn't fetch these fields.
      const admin = createServiceRoleClient();
      const { data: meta, error: metaErr } = await admin
        .from("plays")
        .select("id, formation_name, play_type, tags")
        .eq("playbook_id", ctx.playbookId)
        .in("id", plays.map((p) => p.id));
      if (metaErr) return { ok: false, error: metaErr.message };
      const metaById = new Map<string, { formation_name: string | null; play_type: string | null; tags: string[] | null }>();
      for (const m of (meta ?? []) as Array<{ id: string; formation_name: string | null; play_type: string | null; tags: string[] | null }>) {
        metaById.set(m.id, { formation_name: m.formation_name, play_type: m.play_type, tags: m.tags });
      }

      // Filter is applied within sections so the per-group slot numbers stay
      // stable (they always reflect the play's actual UI position, not its
      // position in the filtered subset).
      const sectionsOut: string[] = [];
      let totalShown = 0;
      for (const key of sectionOrder) {
        const section = sectionPlays.get(key) ?? [];
        const matching = filter ? section.filter((p) => p.name.toLowerCase().includes(filter)) : section;
        if (matching.length === 0) continue;
        const label = groupLabelByKey.get(key) ?? UNGROUPED_LABEL;
        const lines = matching.map((p) => {
          const slot = slotByPlayId.get(p.id) ?? 0;
          const m = metaById.get(p.id);
          const metaLine = [
            m?.play_type ?? "offense",
            m?.formation_name ? `formation: ${m.formation_name}` : null,
            m?.tags && m.tags.length > 0 ? `tags: ${m.tags.join(", ")}` : null,
          ]
            .filter(Boolean)
            .join(" | ");
          return `• #${slot} — "${p.name}" [${p.id}] (${metaLine})`;
        });
        sectionsOut.push(`## ${label} (${section.length} play${section.length === 1 ? "" : "s"})\n${lines.join("\n")}`);
        totalShown += matching.length;
      }

      if (totalShown === 0) {
        return { ok: true, result: `No plays match "${input.filter_name}".` };
      }

      const header =
        `${totalShown} play(s) shown, grouped by section. ` +
        `Slot numbers (#1, #2, ...) restart per group and match the orange badges in the UI. ` +
        `When you reference a play to the coach, qualify it by group: "Recommended #5", "Goal Line #2", etc. ` +
        `When calling other play tools (get_play, rename_play, ...), you can pass the group-qualified slot ` +
        `("Recommended #5"), the UUID, or the exact play name.`;
      return { ok: true, result: `${header}\n\n${sectionsOut.join("\n\n")}` };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "list_plays failed" };
    }
  },
};

const get_play: CoachAiTool = {
  def: {
    name: "get_play",
    description:
      "Get the full diagram for a specific play in the current playbook. " +
      "Returns a CoachDiagram JSON with players (positions, colors) and routes. " +
      "Accepts UUID, group-qualified slot (\"Recommended #5\"), or exact play name.",
    input_schema: {
      type: "object",
      properties: {
        play_id: {
          type: "string",
          description:
            "UUID, group-qualified slot (\"Recommended #5\", \"Goal Line/2\", \"Ungrouped #3\"), or exact name of the play to retrieve. " +
            "Slot numbers restart per group and match the orange badges in the UI. " +
            "A bare slot (\"5\") works only when exactly one group has a #5 — otherwise specify the group.",
        },
      },
      required: ["play_id"],
      additionalProperties: false,
    },
  },
  async handler(input, ctx) {
    if (!ctx.playbookId) return { ok: false, error: "No playbook selected." };
    const rawId = typeof input.play_id === "string" ? input.play_id : "";
    const resolved = await resolvePlayId(rawId, ctx.playbookId);
    if (!resolved.ok) return { ok: false, error: resolved.error };
    const playId = resolved.id;

    try {
      const admin = createServiceRoleClient();
      const { data: play, error } = await admin
        .from("plays")
        .select("id, name, playbook_id, current_version_id, formation_name, play_type, tags")
        .eq("id", playId)
        .eq("playbook_id", ctx.playbookId)
        .is("deleted_at", null)
        .is("attached_to_play_id", null)
        .maybeSingle();

      if (error) return { ok: false, error: error.message };
      if (!play) return { ok: false, error: `Play not found or not in this playbook.` };

      const versionId = play.current_version_id as string | null;
      if (!versionId) return { ok: false, error: "Play has no saved version yet." };

      const { data: version, error: vErr } = await admin
        .from("play_versions")
        .select("document")
        .eq("id", versionId)
        .maybeSingle();

      if (vErr || !version?.document) return { ok: false, error: "Could not load play document." };

      const doc = version.document as PlayDocument;
      const rawDiagram = playDocumentToCoachDiagram(doc, play.name as string);
      // CRITICAL: sanitize before exposing to Cal. The renderer always
      // sanitizes via PlayDocRender → DiagramCanvas (Rule 10), so the coach
      // sees a cleaned diagram on screen. Returning raw data here causes Cal
      // to "discover" corruption the coach never sees — empty-path routes,
      // out-of-bounds zones, NaN coords — and report them as play problems
      // ("@F has TWO routes, one empty and one real"). Sanitize here so
      // Cal's view of the play matches what's on the coach's screen.
      const { diagram, warnings: sanitizeWarnings } = sanitizeCoachDiagram(rawDiagram);

      const meta = [
        play.formation_name ? `formation: ${play.formation_name}` : null,
        play.play_type ? `type: ${play.play_type}` : null,
        Array.isArray(play.tags) && play.tags.length > 0 ? `tags: ${(play.tags as string[]).join(", ")}` : null,
        sanitizeWarnings.length > 0
          ? `note: ${sanitizeWarnings.length} legacy artifact(s) auto-cleaned for display (do NOT report as play issues)`
          : null,
      ].filter(Boolean).join(" | ");

      // To DISPLAY a saved play, the agent emits a play-ref fence —
      // the renderer fetches the saved document by id and renders the
      // exact saved coordinates. The model never transmits coordinates
      // through, so it cannot paraphrase or "clean up" the diagram.
      // The full diagram JSON is still returned below for the cases
      // where the agent needs to read coordinates (e.g. before proposing
      // an edit — that path uses a regular ```play fence so the model
      // can actually modify the data).
      const refFence = `\`\`\`play-ref\n${JSON.stringify({ id: playId })}\n\`\`\``;

      return {
        ok: true,
        result:
          `Play: "${play.name}" (${meta || "no metadata"}).\n\n` +
          `**To SHOW this play to the coach, paste the play-ref fence below into your reply VERBATIM:**\n\n${refFence}\n\n` +
          `The renderer fetches the saved document by id, so the coach sees their exact saved alignment, routes, and zones — no need to copy coordinates through chat.\n\n` +
          `Only when the coach asks for an EDIT to this play do you need the raw coordinates. They're below for that case — read them, propose changes, then call \`update_play\` after explicit confirmation:\n\n` +
          `\`\`\`json\n${JSON.stringify(diagram, null, 2)}\n\`\`\``,
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "get_play failed" };
    }
  },
};

const update_play: CoachAiTool = {
  def: {
    name: "update_play",
    description:
      "Save an updated diagram to an existing play in the current playbook. " +
      "IMPORTANT: Always confirm with the coach before calling this — show them " +
      "what you plan to change and wait for an explicit 'yes' or 'go ahead'.",
    input_schema: {
      type: "object",
      properties: {
        play_id: {
          type: "string",
          description: "UUID, group-qualified slot (\"Recommended #5\"), or exact name of the play to update.",
        },
        play_spec: {
          type: "object",
          description:
            "PlaySpec JSON (preferred) — structured composition format, same shape as on create_play. " +
            "When provided, replaces the play's content and the saved canonical spec. " +
            "When `play_spec` is provided, `diagram` is ignored.",
        },
        diagram: {
          type: "object",
          description:
            "CoachDiagram JSON — LEGACY waypoint format. Prefer play_spec when possible. " +
            "Same format as diagrams rendered in chat. " +
            "For every route that's a NAMED catalog family (slant, post, dig, curl, out, " +
            "in, hitch, comeback, corner, fade, wheel, drag, flat, seam, go, etc.) set " +
            "`route_kind: \"<family>\"` on the route — the server validates depth + side " +
            "against the catalog. A 12-yard slant is rejected here before persistence.",
        },
        max_throw_depth_yds: {
          type: "number",
          description:
            "Optional — coach-stated maximum forward throw depth in yards. Pass this whenever " +
            "the coach has set a cap (e.g. \"10-year-olds, max 10 yards reliably\", \"keep " +
            "everything under 12\", \"short throws only\"). The validator will reject any route " +
            "deeper than the cap unless `nonCanonical: true` is set on that specific route. " +
            "Once a coach states a cap in the conversation, propagate it on every subsequent " +
            "create_play / update_play call until they explicitly raise it.",
        },
        note: {
          type: "string",
          description: "Short edit note for the version history (1-2 sentences).",
        },
      },
      // play_spec OR diagram must be provided (validated in handler).
      required: ["play_id"],
      additionalProperties: false,
    },
  },
  async handler(input, ctx) {
    if (!ctx.playbookId) return { ok: false, error: "No playbook selected." };
    if (!ctx.canEditPlaybook) return { ok: false, error: "You don't have edit access to this playbook." };

    const rawId = typeof input.play_id === "string" ? input.play_id : "";
    const resolved = await resolvePlayId(rawId, ctx.playbookId);
    if (!resolved.ok) return { ok: false, error: resolved.error };
    const playId = resolved.id;
    const maxRouteDepthYds =
      typeof input.max_throw_depth_yds === "number" && Number.isFinite(input.max_throw_depth_yds)
        ? input.max_throw_depth_yds
        : undefined;

    try {
      const admin = createServiceRoleClient();
      const { data: play, error } = await admin
        .from("plays")
        .select("id, name, playbook_id, current_version_id, play_type")
        .eq("id", playId)
        .eq("playbook_id", ctx.playbookId)
        .is("deleted_at", null)
        .is("attached_to_play_id", null)
        .maybeSingle();

      if (error) return { ok: false, error: error.message };
      if (!play) return { ok: false, error: "Play not found or not in this playbook." };

      // Resolve variant from playbook (authoritative) or input hint. The
      // variant lives on `playbooks`, not `plays`, so we rely on
      // ctx.sportVariant (set from the anchored playbook) and input hints.
      const specHintVariant = (input.play_spec as { variant?: string } | null | undefined)?.variant;
      const diagramHintVariant = (input.diagram as { variant?: string } | null | undefined)?.variant;
      const resolvedVariant = (ctx.sportVariant ?? specHintVariant ?? diagramHintVariant ?? "flag_7v7") as SportVariant;

      // Read the parent play's type — drives both spec parsing hints
      // and the cross-side strip below.
      const playRow = play as { play_type?: string };
      const playType = (playRow.play_type as "offense" | "defense" | "special_teams" | undefined) ?? "offense";

      // Resolve spec/diagram inputs through the shared helper.
      const inputResolved = resolveDiagramAndSpec(input.play_spec, input.diagram, resolvedVariant, {
        playType,
      });
      if (!inputResolved.ok) return { ok: false, error: inputResolved.error };
      const diagram = inputResolved.diagram;
      const persistedSpec = inputResolved.spec;
      const updateSoftWarnings = inputResolved.softWarnings;

      // Strip cross-side players before persisting. Without this, an
      // update that included defenders for visualization would save
      // them as offensive players and trip the editor's variant count
      // check.
      const dropTeam: "O" | "D" | null =
        playType === "offense" ? "D" : playType === "defense" ? "O" : null;
      let updateStripped = 0;
      let cleanDiagram: CoachDiagram = { ...diagram, variant: resolvedVariant };
      if (dropTeam && Array.isArray(cleanDiagram.players)) {
        const beforeCount = cleanDiagram.players.length;
        const keptPlayers = cleanDiagram.players.filter((p) => p.team !== dropTeam);
        const droppedIds = new Set(
          cleanDiagram.players.filter((p) => p.team === dropTeam).map((p) => p.id),
        );
        const keptRoutes = (cleanDiagram.routes ?? []).filter((r) => !droppedIds.has(r.from));
        updateStripped = beforeCount - keptPlayers.length;
        if (updateStripped > 0) {
          cleanDiagram = { ...cleanDiagram, players: keptPlayers, routes: keptRoutes };
        }
      }
      void updateStripped;
      const diagramWithVariant: CoachDiagram = cleanDiagram;

      // Load playbook settings up-front so the depth gate can fall back
      // to the persistent maxThrowDepthYds setting when the call didn't
      // include max_throw_depth_yds (Cal frequently forgets to propagate
      // it across a series of update_play calls — surfaced 2026-05-04).
      const playbookSettings = await loadPlaybookSettings(ctx.playbookId, resolvedVariant);
      const effectiveMaxRouteDepthYds =
        maxRouteDepthYds ?? playbookSettings.maxThrowDepthYds ?? undefined;

      // SFPA Layer 2 gate: every route that declared route_kind must satisfy
      // the catalog's constraints (depth, side). Catches "12-yard slant"
      // and "post breaking outside" before they persist. Plus the variant-
      // aware QB-flag rule and the coach-stated max-throw-depth cap.
      const assignmentCheck = validateRouteAssignments(diagramWithVariant, {
        variant: resolvedVariant,
        maxRouteDepthYds: effectiveMaxRouteDepthYds,
      });
      if (!assignmentCheck.ok) {
        return { ok: false, error: formatRouteAssignmentErrors(assignmentCheck.errors) };
      }

      // SFPA Layer 4 gate: content coherence. Color clashes, center
      // eligibility, and offensive-coverage (every non-QB player has
      // an action) — historically only enforced at chat-time, now also
      // at save-time so a `create_play`/`update_play` JSON that bypasses
      // chat cannot persist either. See play-content-validate.ts.
      const contentCheck = validatePlayContent(
        diagramWithVariant,
        resolvedVariant,
        playbookSettings,
        playType,
      );
      if (!contentCheck.ok) {
        return { ok: false, error: formatPlayContentErrors(contentCheck.errors) };
      }

      const newDoc = coachDiagramToPlayDocument(diagramWithVariant);

      // Carry over existing metadata (notes, coachName) from the parent version
      const parentId = play.current_version_id as string | null;
      if (parentId) {
        const { data: parent } = await admin
          .from("play_versions")
          .select("document")
          .eq("id", parentId)
          .maybeSingle();
        const parentDoc = parent?.document as PlayDocument | null;
        if (parentDoc?.metadata) {
          newDoc.metadata = {
            ...parentDoc.metadata,
            coachName: diagram.title ?? parentDoc.metadata.coachName ?? (play.name as string),
            formation: diagram.title ?? parentDoc.metadata.formation ?? "",
          };
        }
      }
      // Stamp the canonical spec on the saved document. This OVERWRITES
      // any prior spec, intentionally — an update means the spec has
      // moved, and the new spec (whether spec-input or derived from a
      // legacy diagram) is now authoritative for downstream notes.
      if (persistedSpec) newDoc.metadata.spec = persistedSpec;

      // Get the caller's user id from the active session
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { ok: false, error: "Not signed in." };

      const versionResult = await recordPlayVersion({
        supabase: admin,
        playId,
        document: newDoc,
        parentVersionId: parentId,
        userId: user.id,
        kind: "edit",
        note: typeof input.note === "string" ? input.note : "Edited by Coach Cal",
      });

      if (!versionResult.ok) return { ok: false, error: versionResult.error };
      if (versionResult.deduped) {
        return { ok: true, result: "No changes detected — play is already up to date." };
      }

      // Update current_version_id on the play
      const { error: upErr } = await admin
        .from("plays")
        .update({ current_version_id: versionResult.versionId, updated_at: new Date().toISOString() })
        .eq("id", playId);

      if (upErr) return { ok: false, error: upErr.message };

      // Build a one-line summary of what changed so Cal can recap it.
      const playerCount = Array.isArray(diagram.players) ? diagram.players.length : 0;
      const routeCount = Array.isArray(diagram.routes) ? diagram.routes.length : 0;
      const routeSummary = Array.isArray(diagram.routes)
        ? diagram.routes
            .map((r) =>
              r && typeof r === "object" && typeof (r as { from?: unknown }).from === "string"
                ? (r as { from: string }).from
                : null,
            )
            .filter((from): from is string => from !== null)
            .slice(0, 12)
            .join(", ")
        : "";
      return {
        ok: true,
        result:
          `Play "${play.name}" updated successfully (version ${versionResult.versionId.slice(0, 8)}).\n\n` +
          `Saved diagram: ${playerCount} player(s), ${routeCount} route(s)` +
          (routeSummary ? ` (carriers: ${routeSummary})` : "") +
          `. Recap to the coach which specific changes you just shipped (not just "done") so they can verify the edit matches their request.` +
          summarizeConfidence(persistedSpec) +
          formatSpecRenderSoftWarnings(updateSoftWarnings),
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "update_play failed" };
    }
  },
};

const create_play: CoachAiTool = {
  def: {
    name: "create_play",
    description:
      "Create a brand-new play in the current playbook. Use this when the coach asks " +
      "you to make/add/build a new play (or accepts your offer to do so). Requires " +
      "edit access to the playbook. Always confirm name + diagram with the coach " +
      "before calling — show them the play diagram and wait for an explicit 'yes'.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Play name. 1-80 chars. Required." },
        play_spec: {
          type: "object",
          description:
            "PlaySpec JSON (preferred) — the structured composition format. Shape: " +
            "{ schemaVersion: 1, variant, formation: { name, strength? }, defense?: { front, coverage, strength? }, " +
            "assignments: [{ player: \"X\", action: { kind: \"route\", family: \"Slant\" } }, ...] }. " +
            "Geometry is derived from the catalogs — no waypoints, no overlap risk. " +
            "Renderer rejects unknown formations, defenses, or route families instead of silently substituting. " +
            "Use this when you can describe the play in named primitives (catalog routes, named formation, named defense). " +
            "When `play_spec` is provided, `diagram` is ignored.",
        },
        diagram: {
          type: "object",
          description:
            "CoachDiagram JSON — LEGACY waypoint format. Prefer play_spec when possible. " +
            "Same format as diagrams rendered in chat: players + optional routes/zones. " +
            "For every route that's a NAMED catalog family (slant, post, dig, curl, out, " +
            "in, hitch, comeback, corner, fade, wheel, drag, flat, seam, go, etc.) set " +
            "`route_kind: \"<family>\"` on the route — the server validates that the path's " +
            "depth and side actually match that family. A 12-yard slant or a post breaking " +
            "outside is rejected here BEFORE persistence, with a structured error you can " +
            "act on. Omit `route_kind` only for genuinely off-catalog custom shapes.",
        },
        formation_name: {
          type: "string",
          description: "Optional formation label (e.g. \"Trips Right\", \"Spread\"). ≤60 chars.",
        },
        play_type: {
          type: "string",
          enum: ["offense", "defense", "special_teams"],
          description: "Play type. Defaults to \"offense\".",
        },
        max_throw_depth_yds: {
          type: "number",
          description:
            "Optional — coach-stated maximum forward throw depth in yards. Pass this whenever " +
            "the coach has set a cap (e.g. \"10-year-olds, max 10 yards reliably\", \"keep " +
            "everything under 12\", \"short throws only\"). The validator will reject any route " +
            "deeper than the cap unless `nonCanonical: true` is set on that specific route. " +
            "Once a coach states a cap in the conversation, propagate it on every subsequent " +
            "create_play / update_play call until they explicitly raise it.",
        },
        note: {
          type: "string",
          description: "Optional short note recorded on the initial version (1-2 sentences).",
        },
      },
      // `name` is required. play_spec OR diagram must be provided
      // (validated in handler — JSON schema can't express "exactly one").
      required: ["name"],
      additionalProperties: false,
    },
  },
  async handler(input, ctx) {
    if (!ctx.playbookId) return { ok: false, error: "No playbook selected." };
    if (!ctx.canEditPlaybook) return { ok: false, error: "You don't have edit access to this playbook." };

    const name = typeof input.name === "string" ? input.name.trim().slice(0, 80) : "";
    if (!name) return { ok: false, error: "Play name is required." };
    const maxRouteDepthYds =
      typeof input.max_throw_depth_yds === "number" && Number.isFinite(input.max_throw_depth_yds)
        ? input.max_throw_depth_yds
        : undefined;

    const playType = (typeof input.play_type === "string" && ["offense", "defense", "special_teams"].includes(input.play_type)
      ? input.play_type
      : "offense") as "offense" | "defense" | "special_teams";
    const formationName = typeof input.formation_name === "string" ? input.formation_name.slice(0, 60) : undefined;

    // Resolve variant: playbook's variant > spec/diagram hint > default.
    const specHintVariant = (input.play_spec as { variant?: string } | null | undefined)?.variant;
    const diagramHintVariant = (input.diagram as { variant?: string } | null | undefined)?.variant;
    const resolvedVariant = (ctx.sportVariant ?? specHintVariant ?? diagramHintVariant ?? "flag_7v7") as SportVariant;

    const resolved = resolveDiagramAndSpec(input.play_spec, input.diagram, resolvedVariant, {
      formationName,
      playType,
    });
    if (!resolved.ok) return { ok: false, error: resolved.error };
    let diagram = resolved.diagram;
    const persistedSpec = resolved.spec;
    const softWarnings = resolved.softWarnings;

    // ── Strip cross-side players before persisting ──────────────────
    // Cal sometimes ships a chat diagram that includes BOTH offense + defense
    // (visualizing a matchup), then calls create_play to save it. Without
    // this filter the defenders get saved into the play's main roster as
    // offensive players — which trips the editor's variant count check
    // ("22 players on the field — this playbook allows only 11") and turns
    // the defenders into stuck offensive tokens that move with offense.
    //
    // Save policy:
    //   - offense play  → keep team !== "D" players, drop team === "D"
    //   - defense play  → keep team === "D" players, drop team !== "D"
    //   - special teams → keep all (kicking/return units mix sides)
    //
    // Routes attached to the dropped side are also pruned so the saved
    // diagram doesn't have orphaned route carriers. Defenders the coach
    // wanted alongside the play should be added later via the "custom
    // opponent" overlay (Coach Cal will gain a tool for that next).
    const dropTeam: "O" | "D" | null =
      playType === "offense" ? "D"
      : playType === "defense" ? "O"
      : null;
    let strippedCount = 0;
    if (dropTeam) {
      const beforeCount = diagram.players.length;
      const keptPlayers = diagram.players.filter((p) => p.team !== dropTeam);
      const droppedIds = new Set(
        diagram.players
          .filter((p) => p.team === dropTeam)
          .map((p) => p.id),
      );
      const keptRoutes = (diagram.routes ?? []).filter(
        (r) => !droppedIds.has(r.from),
      );
      strippedCount = beforeCount - keptPlayers.length;
      if (strippedCount > 0) {
        diagram = { ...diagram, players: keptPlayers, routes: keptRoutes };
      }
    }

    // Validate FIRST, then create the play row. Prior to 2026-05-04 we
    // called createPlayAction before validating; when a gate later
    // rejected the diagram, the play row was already in the DB at v0
    // with the variant default formation and no routes. The coach
    // would see a phantom "Doubles Dig-Flat" with no actions on it
    // even though the tool returned ok:false. Run all gates against
    // the inbound diagram BEFORE create, so a failing save leaves no
    // residue.
    const diagramWithVariant: CoachDiagram = { ...diagram, variant: resolvedVariant, title: diagram.title ?? name };

    // Load the playbook's persistent settings up-front so the depth gate
    // can use settings.maxThrowDepthYds as a fallback when the call
    // didn't include max_throw_depth_yds. Surfaced 2026-05-04: Cal
    // generated 7 plays with 13.8-yard verticals despite the coach
    // stating "less than 15 yards" — Cal forgot to propagate
    // max_throw_depth_yds on the create_play calls. The persistent
    // playbook setting closes the gap so the cap can't be lost.
    const playbookSettingsPreCreate = await loadPlaybookSettings(ctx.playbookId, resolvedVariant);
    const effectiveMaxRouteDepthYds =
      maxRouteDepthYds ?? playbookSettingsPreCreate.maxThrowDepthYds ?? undefined;

    // SFPA Layer 2 gate: every route that declared route_kind must satisfy
    // the catalog's constraints (depth, side). Catches "12-yard slant"
    // and "post breaking outside" before they persist. Plus the variant-
    // aware QB-flag rule and the coach-stated max-throw-depth cap.
    const assignmentCheck = validateRouteAssignments(diagramWithVariant, {
      variant: resolvedVariant,
      maxRouteDepthYds: effectiveMaxRouteDepthYds,
    });
    if (!assignmentCheck.ok) {
      return { ok: false, error: formatRouteAssignmentErrors(assignmentCheck.errors) };
    }

    // SFPA Layer 4 gate: content coherence. Color clashes, center
    // eligibility, and offensive-coverage (every non-QB has an action).
    const contentCheckPreCreate = validatePlayContent(
      diagramWithVariant,
      resolvedVariant,
      playbookSettingsPreCreate,
      playType,
    );
    if (!contentCheckPreCreate.ok) {
      return { ok: false, error: formatPlayContentErrors(contentCheckPreCreate.errors) };
    }

    try {
      // All gates passed — now create the play row.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createPlayAction } = require("@/app/actions/plays") as typeof import("@/app/actions/plays");
      const createRes = await createPlayAction(ctx.playbookId, {
        playName: name,
        playType,
        formationName,
        variant: resolvedVariant,
      });
      if (!createRes.ok) return { ok: false, error: createRes.error };

      const newDoc = coachDiagramToPlayDocument(diagramWithVariant);
      newDoc.metadata.coachName = name;
      if (formationName) newDoc.metadata.formation = formationName;
      newDoc.metadata.playType = playType;
      // Stamp the canonical spec on the saved document. Future edits +
      // notes generation can read this back as the semantic source of
      // truth without re-deriving from the diagram.
      if (persistedSpec) newDoc.metadata.spec = persistedSpec;

      // STRUCTURAL GUARANTEE: every spec-based play ships with notes from
      // the first saved version. Coaches reported Cal creating plays in
      // batch and skipping the per-play "ALWAYS write notes" prompt rule;
      // a behavioral rule is too easy to miss. Project canonical notes
      // from the spec deterministically here so a play is never noteless.
      // Cal can still rephrase via update_play_notes afterwards if the
      // canonical projection feels mechanical — but the play is born
      // teach-ready. Legacy diagram-only creates (no spec) are the one
      // case left where Cal must follow up — those should be rare.
      if (persistedSpec) {
        try {
          const projected = projectSpecToNotes(persistedSpec);
          if (projected.trim().length > 0) {
            newDoc.metadata.notes = projected;
          }
        } catch {
          // Don't block create on a notes-projection bug; the play still
          // saves and Cal can call update_play_notes manually.
        }
      }

      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { ok: false, error: "Not signed in." };

      const admin = createServiceRoleClient();
      const versionResult = await recordPlayVersion({
        supabase: admin,
        playId: createRes.playId,
        document: newDoc,
        parentVersionId: createRes.versionId,
        userId: user.id,
        kind: "edit",
        note: typeof input.note === "string" ? input.note : "Created by Coach Cal",
      });
      if (!versionResult.ok) return { ok: false, error: versionResult.error };

      const finalVersionId = versionResult.deduped ? createRes.versionId : versionResult.versionId;
      if (!versionResult.deduped) {
        const { error: upErr } = await admin
          .from("plays")
          .update({ current_version_id: finalVersionId, updated_at: new Date().toISOString() })
          .eq("id", createRes.playId);
        if (upErr) return { ok: false, error: upErr.message };
      }

      const url = `/plays/${createRes.playId}/edit`;
      const stripNote = strippedCount > 0
        ? ` (Dropped ${strippedCount} ${dropTeam === "D" ? "defender" : "offensive"} player(s) from the saved diagram — only ${playType === "offense" ? "offense" : playType === "defense" ? "defense" : "all sides"} is persisted on this play. Tell the coach if they want the opposing side saved as a reusable opponent overlay.)`
        : "";
      const notesNote = persistedSpec
        ? " Default notes were auto-generated from the spec (when-to-run + per-player jobs); call update_play_notes to rephrase or expand if you want to add coaching voice."
        : " ⚠️ NO notes were auto-written (legacy diagram path, no spec). You MUST call update_play_notes for this play before ending the turn — every play needs notes.";
      return {
        ok: true,
        result:
          `Created play "${name}" in the current playbook. Tell the coach it's ready and link them: ` +
          `[Open ${name}](${url}).${stripNote}${notesNote}` +
          summarizeConfidence(persistedSpec) +
          formatSpecRenderSoftWarnings(softWarnings),
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "create_play failed" };
    }
  },
};

const rename_play: CoachAiTool = {
  def: {
    name: "rename_play",
    description:
      "Rename an existing play in the current playbook. Use this when the coach " +
      "asks you to rename, retitle, or relabel a play — do NOT try to do it via " +
      "update_play (that one only edits the diagram). " +
      "ALWAYS confirm the new name with the coach before calling. " +
      "Requires edit access to the playbook.",
    input_schema: {
      type: "object",
      properties: {
        play_id: {
          type: "string",
          description: "UUID, group-qualified slot (\"Recommended #5\"), or exact name of the play to rename.",
        },
        new_name: { type: "string", description: "The new play name. 1-80 chars, trimmed." },
      },
      required: ["play_id", "new_name"],
      additionalProperties: false,
    },
  },
  async handler(input, ctx) {
    if (!ctx.playbookId) return { ok: false, error: "No playbook selected." };
    if (!ctx.canEditPlaybook) return { ok: false, error: "You don't have edit access to this playbook." };
    const rawId = typeof input.play_id === "string" ? input.play_id : "";
    const newName = typeof input.new_name === "string" ? input.new_name.trim() : "";
    if (!newName) return { ok: false, error: "new_name can't be empty." };
    if (newName.length > 80) return { ok: false, error: "new_name must be 80 characters or fewer." };

    const resolved = await resolvePlayId(rawId, ctx.playbookId);
    if (!resolved.ok) return { ok: false, error: resolved.error };
    const playId = resolved.id;
    const oldName = resolved.name;
    if (oldName === newName) {
      return { ok: true, result: `Play is already named "${newName}" — no change.` };
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { renamePlayAction } = require("@/app/actions/plays") as typeof import("@/app/actions/plays");
      const res = await renamePlayAction(playId, newName);
      if (!res.ok) return { ok: false, error: res.error };
      return {
        ok: true,
        result:
          `Renamed "${oldName}" → "${newName}". ` +
          `Tell the coach the rename is saved and quote both names ("${oldName}" → "${newName}") so they can verify.`,
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "rename_play failed" };
    }
  },
};

const update_play_notes: CoachAiTool = {
  def: {
    name: "update_play_notes",
    description:
      "Replace the notes field on an existing play. Use this for the coaching " +
      "narrative attached to a play — what the QB reads, what each skill player " +
      "should look for, and any decision points on option/choice routes. " +
      "DOES NOT touch the diagram. " +
      "ALWAYS show the coach the proposed notes and wait for explicit confirmation " +
      "before calling. Requires edit access to the playbook.\n\n" +
      "Style rules:\n" +
      "- Reference players by their on-field label using @Label (e.g. @Q, @F, @Y, @Z). " +
      "  The renderer auto-links these to the player tokens in the diagram.\n" +
      "- **CHECK THE PLAY'S SIDE BEFORE WRITING.** The saved play has " +
      "  `metadata.playType` = \"offense\" | \"defense\" | \"special_teams\". The notes " +
      "  must be written from the perspective of the side actually running the play — " +
      "  a server-side lint will reject offense-perspective prose on a defense play and " +
      "  vice versa. The cases:\n" +
      "  - For OFFENSIVE plays: open with a one-line summary of the QB's reads based " +
      "    on what the defense shows. Then list each skill player's job in order. If any " +
      "    skill player has a decision (option route, choice route, read on leverage, sit " +
      "    vs. continue), call it out explicitly. ✓ \"@Q reads the safety…\", \"hit @X on " +
      "    the slant\", \"the throw goes…\".\n" +
      "  - For DEFENSIVE plays: the play IS the defense. Describe what defenders DO — not " +
      "    how the offense beats them. Open with when to call this defense (down/distance/" +
      "    formation tendency) and the primary key/trigger each defender reads. Then per-" +
      "    defender assignments: zone drops with the void to protect, man matches with " +
      "    leverage, blitz lanes, pattern-match rules. ✓ \"Best on 3rd-and-long vs trips. " +
      "    @M keys #3 strong; if #2 goes vertical, @M carries; otherwise sink to the " +
      "    hook.\" ✗ NEVER say \"@Q reads…\", \"the throw\", \"hit @X\", \"exploits Tampa " +
      "    2\", \"the void between hooks and safeties\", \"why it works: the offense " +
      "    attacks…\" — those frame the play as offense attacking the coverage, which " +
      "    is the wrong play. If the coach asked you to save \"how to beat Tampa 2\", " +
      "    that's an OFFENSE play, not a defense play; check what you actually saved.\n" +
      "- Keep it tight — 4-8 short bullets typically. Coaches will scan, not read.\n\n" +
      "OPTIONAL `from_spec: true` mode: if the play has a saved PlaySpec on " +
      "metadata.spec (created via play_spec on create_play/update_play), pass " +
      "`from_spec: true` and OMIT `notes` to regenerate the notes deterministically " +
      "from the saved spec. The spec → notes projection is canonical: same spec → " +
      "same notes, every time. Use this when you want to guarantee the prose matches " +
      "the diagram (no fabrication risk). You can pass BOTH `notes` and `from_spec` to " +
      "use the projection as a starting point that you then rephrase — but the rephrased " +
      "notes still need to be consistent with the spec.",
    input_schema: {
      type: "object",
      properties: {
        play_id: {
          type: "string",
          description: "UUID, group-qualified slot (\"Recommended #5\"), or exact name of the play to update.",
        },
        notes: {
          type: "string",
          description:
            "The new notes content. Use @Label to reference players. " +
            "Pass empty string to clear notes. Required UNLESS `from_spec: true`.",
        },
        from_spec: {
          type: "boolean",
          description:
            "When true, regenerate notes from the play's saved PlaySpec via the " +
            "canonical projection (projectSpecToNotes). Fails if no spec is saved " +
            "on the play. Mutually optional with `notes` — pass both to use " +
            "projection as a starting point, or just `from_spec: true` to overwrite " +
            "with the canonical projection.",
        },
        edit_note: {
          type: "string",
          description: "Short one-line note for the version history. Default: 'Updated notes via Coach Cal'.",
        },
      },
      required: ["play_id"],
      additionalProperties: false,
    },
  },
  async handler(input, ctx) {
    if (!ctx.playbookId) return { ok: false, error: "No playbook selected." };
    if (!ctx.canEditPlaybook) return { ok: false, error: "You don't have edit access to this playbook." };
    const rawId = typeof input.play_id === "string" ? input.play_id : "";
    const fromSpec = input.from_spec === true;
    const explicitNotes = typeof input.notes === "string" ? input.notes : null;
    if (!fromSpec && explicitNotes === null) {
      return { ok: false, error: "Provide `notes` (the prose) OR `from_spec: true` (regenerate from saved spec)." };
    }
    if (explicitNotes !== null && explicitNotes.length > 4000) {
      return { ok: false, error: "notes must be 4000 characters or fewer." };
    }
    const resolved = await resolvePlayId(rawId, ctx.playbookId);
    if (!resolved.ok) return { ok: false, error: resolved.error };
    const playId = resolved.id;

    try {
      const admin = createServiceRoleClient();
      const { data: play, error } = await admin
        .from("plays")
        .select("id, name, playbook_id, current_version_id")
        .eq("id", playId)
        .eq("playbook_id", ctx.playbookId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) return { ok: false, error: error.message };
      if (!play) return { ok: false, error: "Play not found or not in this playbook." };

      const parentId = play.current_version_id as string | null;
      if (!parentId) {
        return { ok: false, error: "Play has no current version to update." };
      }
      const { data: parent, error: parentErr } = await admin
        .from("play_versions")
        .select("document")
        .eq("id", parentId)
        .maybeSingle();
      if (parentErr) return { ok: false, error: parentErr.message };
      const parentDoc = parent?.document as PlayDocument | null;
      if (!parentDoc) return { ok: false, error: "Could not read current play document." };

      // Resolve final notes content. from_spec mode reads the saved
      // spec and runs the canonical projection. When both `notes` and
      // `from_spec` are present, `notes` wins (Cal's rephrased text)
      // and the projection is informational only.
      let notes: string;
      if (explicitNotes !== null) {
        notes = explicitNotes;
      } else {
        // from_spec mode without explicit notes — projection IS the notes.
        const savedSpec = parentDoc.metadata.spec ?? null;
        if (!savedSpec) {
          return {
            ok: false,
            error:
              "from_spec=true but this play has no saved PlaySpec on metadata.spec. " +
              "Either pass `notes` directly, or first save the play with a play_spec via create_play/update_play.",
          };
        }
        notes = projectSpecToNotes(savedSpec);
      }

      // Notes-spec consistency lint: when Cal supplies its OWN prose AND
      // the play has a saved spec, the prose must not contradict the
      // spec's per-player route families. Catches "@X runs a post" when
      // spec says Slant. Conservative — silent paraphrasing is allowed,
      // only ACTIVE contradictions fail. See notes-lint.ts for details.
      if (explicitNotes !== null && parentDoc.metadata.spec) {
        const lint = lintNotesAgainstSpec(notes, parentDoc.metadata.spec);
        if (!lint.ok) {
          return { ok: false, error: formatNotesLintIssues(lint.issues) };
        }
        // Side-awareness lint — defense plays must not be narrated from
        // the offense's POV (and vice versa). The infrastructure (spec
        // playType, projectSpecToNotes openers) has been side-aware
        // since Phase 4; this is the gate that enforces it on Cal-
        // authored prose. Surfaced 2026-05-03 (coach screenshot showed
        // a defense play with offense-attack notes — "@Q reads", "the
        // throw", "exploits Tampa 2"). See notes-lint.ts.
        const sideLint = lintNotesSideAwareness(notes, parentDoc.metadata.spec);
        if (!sideLint.ok) {
          return { ok: false, error: formatSideAwarenessIssues(sideLint.issues) };
        }
      }

      const newDoc: PlayDocument = {
        ...parentDoc,
        metadata: {
          ...parentDoc.metadata,
          notes,
        },
      };

      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { ok: false, error: "Not signed in." };

      const editNote = typeof input.edit_note === "string" && input.edit_note.trim()
        ? input.edit_note.trim()
        : "Updated notes via Coach Cal";

      const versionResult = await recordPlayVersion({
        supabase: admin,
        playId,
        document: newDoc,
        parentVersionId: parentId,
        userId: user.id,
        kind: "edit",
        note: editNote,
      });
      if (!versionResult.ok) return { ok: false, error: versionResult.error };
      if (versionResult.deduped) {
        return { ok: true, result: "Notes are already up to date — no change." };
      }
      const { error: upErr } = await admin
        .from("plays")
        .update({ current_version_id: versionResult.versionId, updated_at: new Date().toISOString() })
        .eq("id", playId);
      if (upErr) return { ok: false, error: upErr.message };
      // Echo the saved notes back so Cal can recap them to the coach in
      // the confirmation reply (the chat is the only confirmation surface
      // until the editor is open). Truncate aggressively if huge.
      const savedNotes = notes.length > 1500 ? `${notes.slice(0, 1500)}…` : notes;
      return {
        ok: true,
        result:
          `Notes updated on "${play.name}" (version ${versionResult.versionId.slice(0, 8)}).\n\n` +
          `Saved notes (recap these to the coach in your confirmation, formatted as you presented them):\n` +
          `${savedNotes || "(empty — notes cleared)"}`,
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "update_play_notes failed" };
    }
  },
};

const update_player: CoachAiTool = {
  def: {
    name: "update_player",
    description:
      "Change a single player's LABEL, FILL color, label/letter color, or shape on a saved play. " +
      "Identity-preserving by construction: the player's id, position, and role are guaranteed unchanged — " +
      "this is a recolor/relabel, NOT a re-formation. Routes owned by the player keep their shape; their " +
      "stroke follows the new fill so the diagram still color-codes by player. @LABEL mentions in the play's " +
      "notes are auto-rewritten when the label changes (e.g. \"@H runs the slant\" becomes \"@F runs the slant\").\n\n" +
      "Use this when a coach asks to:\n" +
      "  - Recolor a position (\"make H purple\", \"the back should be green\")\n" +
      "  - Rename a position label (\"call the H player F instead\", \"rename B to RB\")\n" +
      "  - Change a player marker's shape (\"the QB should be a square\")\n\n" +
      "ALWAYS confirm the proposed change with the coach before calling. For batched recolors across many " +
      "plays, call this tool once per (play, player) pair — there is no batch form. ALWAYS show the coach " +
      "the proposed change and wait for explicit confirmation before calling. Requires edit access.",
    input_schema: {
      type: "object",
      properties: {
        play_id: {
          type: "string",
          description: "UUID, group-qualified slot (\"Recommended #5\"), or exact name of the play to update.",
        },
        player: {
          type: "string",
          description:
            "Selector for which player to update — use the SAME id you see in get_play's diagram JSON. " +
            "When labels are unique within the play, that's just the label (e.g. \"H\", \"B\", \"X\"). " +
            "When two or more players share a label (e.g. a play with two Z's), get_play disambiguates " +
            "them by suffix: the first is `Z`, the second is `Z2`, the third is `Z3`. Pass that exact " +
            "suffixed id here to target the duplicate. The player's UUID also works if you have it. " +
            "Case-sensitive.",
        },
        label: {
          type: "string",
          description: "New label, 1-3 characters (e.g. \"F\", \"RB\", \"W1\"). Optional.",
        },
        fill: {
          type: "string",
          description:
            "New fill color. Either a named color (white, slate, black, orange, blue, red, green, yellow, " +
            "purple) or a 6-char hex code like \"#A855F7\". When fill changes, label_color auto-picks a " +
            "contrasting white/black unless you also pass label_color explicitly. Optional.",
        },
        label_color: {
          type: "string",
          description:
            "Override the letter color: \"white\", \"black\", or a hex code. Optional — auto-picked from " +
            "fill when omitted.",
        },
        shape: {
          type: "string",
          description: "Marker shape — one of: circle, square, diamond, triangle, star. Optional.",
        },
        edit_note: {
          type: "string",
          description: "Short one-line note for version history. Default: 'Updated player via Coach Cal'.",
        },
      },
      required: ["play_id", "player"],
      additionalProperties: false,
    },
  },
  async handler(input, ctx) {
    if (!ctx.playbookId) return { ok: false, error: "No playbook selected." };
    if (!ctx.canEditPlaybook) return { ok: false, error: "You don't have edit access to this playbook." };
    const rawPlayId = typeof input.play_id === "string" ? input.play_id : "";
    const playerSelector = typeof input.player === "string" ? input.player : "";
    if (!playerSelector.trim()) return { ok: false, error: "player selector is required." };

    const resolved = await resolvePlayId(rawPlayId, ctx.playbookId);
    if (!resolved.ok) return { ok: false, error: resolved.error };
    const playId = resolved.id;

    try {
      const admin = createServiceRoleClient();
      const { data: play, error } = await admin
        .from("plays")
        .select("id, name, playbook_id, current_version_id")
        .eq("id", playId)
        .eq("playbook_id", ctx.playbookId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) return { ok: false, error: error.message };
      if (!play) return { ok: false, error: "Play not found or not in this playbook." };

      const parentId = play.current_version_id as string | null;
      if (!parentId) return { ok: false, error: "Play has no current version to update." };

      const { data: parent, error: parentErr } = await admin
        .from("play_versions")
        .select("document")
        .eq("id", parentId)
        .maybeSingle();
      if (parentErr) return { ok: false, error: parentErr.message };
      const parentDoc = parent?.document as PlayDocument | null;
      if (!parentDoc) return { ok: false, error: "Could not read current play document." };

      const modResult = applyPlayerStyleMod(parentDoc, {
        player_selector: playerSelector,
        label: typeof input.label === "string" ? input.label : undefined,
        fill: typeof input.fill === "string" ? input.fill : undefined,
        label_color: typeof input.label_color === "string" ? input.label_color : undefined,
        shape: typeof input.shape === "string" ? input.shape : undefined,
      });
      if (!modResult.ok) return { ok: false, error: modResult.error };

      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { ok: false, error: "Not signed in." };

      const editNote = typeof input.edit_note === "string" && input.edit_note.trim()
        ? input.edit_note.trim()
        : `Updated player ${modResult.player.label} via Coach Cal`;

      const versionResult = await recordPlayVersion({
        supabase: admin,
        playId,
        document: modResult.doc,
        parentVersionId: parentId,
        userId: user.id,
        kind: "edit",
        note: editNote,
      });
      if (!versionResult.ok) return { ok: false, error: versionResult.error };
      if (versionResult.deduped) {
        return { ok: true, result: `No change — player ${modResult.player.label} already matches.` };
      }
      const { error: upErr } = await admin
        .from("plays")
        .update({ current_version_id: versionResult.versionId, updated_at: new Date().toISOString() })
        .eq("id", playId);
      if (upErr) return { ok: false, error: upErr.message };

      const changeSummary = modResult.changedFields.join(", ");
      return {
        ok: true,
        result:
          `Updated player ${modResult.player.label} on "${play.name}" — changed ${changeSummary} ` +
          `(version ${versionResult.versionId.slice(0, 8)}).`,
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "update_player failed" };
    }
  },
};

// ─────────────────────────────────────────────────────────────────────
//  Practice plans
// ─────────────────────────────────────────────────────────────────────

const create_practice_plan: CoachAiTool = {
  def: {
    name: "create_practice_plan",
    description:
      "Create a new practice plan in the current playbook, optionally seeded " +
      "with a list of time blocks (warm-up / individual / team install / etc). " +
      "Use this when the coach asks you to save / build / make a practice plan " +
      "in their playbook (NOT just describe one in chat). " +
      "ALWAYS confirm the plan title and the block breakdown with the coach " +
      "before calling — show the proposed timeline in plain English (e.g. " +
      "'15 min warm-up → 20 min individual → 25 min team install → 10 min " +
      "conditioning, 70 min total — sound right?') and wait for an explicit " +
      "yes. Requires edit access to the playbook.",
    input_schema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description:
            "Practice plan title, e.g. \"Tuesday — Install + Special Teams\" " +
            "or \"Week 3 Practice 1\". 1-200 chars.",
        },
        notes: {
          type: "string",
          description:
            "Optional plan-level notes shown above the timeline. Use this " +
            "for the practice's overall focus / theme (e.g. 'Install Trips " +
            "Right concept; refine Cover 3 reads; prep for Saturday game').",
        },
        age_tier: {
          type: "string",
          enum: ["tier1_5_8", "tier2_9_11", "tier3_12_14", "tier4_hs"],
          description:
            "Optional age tier for content guidance. Pull from the playbook " +
            "context if the coach hasn't said.",
        },
        blocks: {
          type: "array",
          description:
            "Optional ordered list of time blocks. If omitted, the plan is " +
            "created empty and the coach fills it in via the editor. If " +
            "provided, each block must include a title + durationMinutes; " +
            "startOffsetMinutes is auto-computed sequentially when omitted. " +
            "Each block can have 1-3 parallel lanes (Skill / Line / etc.) " +
            "for stations.",
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "Block label, e.g. \"Warm-up\", \"Individual\", \"Team install\"." },
              duration_minutes: { type: "integer", minimum: 1, maximum: 240 },
              start_offset_minutes: {
                type: "integer",
                minimum: 0,
                description: "Optional explicit start offset in minutes from the start of practice. Defaults to sequential layout.",
              },
              notes: { type: "string", description: "Plain-text coaching notes for this block." },
              lanes: {
                type: "array",
                maxItems: 3,
                description: "Optional 1-3 parallel lanes (stations). If omitted, a single lane is auto-created from the block title + notes.",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string", description: "Lane label, e.g. \"Skill\", \"Line\", \"Specialists\"." },
                    notes: { type: "string", description: "Activity description / coaching points for this lane." },
                  },
                  required: [],
                  additionalProperties: false,
                },
              },
            },
            required: ["title", "duration_minutes"],
            additionalProperties: false,
          },
        },
      },
      required: ["title"],
      additionalProperties: false,
    },
  },
  async handler(input, ctx) {
    if (!ctx.playbookId) return { ok: false, error: "No playbook selected." };
    if (!ctx.canEditPlaybook) return { ok: false, error: "You don't have edit access to this playbook." };

    const title = typeof input.title === "string" ? input.title : "";
    if (!title.trim()) return { ok: false, error: "title is required." };
    const notes = typeof input.notes === "string" ? input.notes : undefined;
    const ageTierRaw = typeof input.age_tier === "string" ? input.age_tier : undefined;
    const allowedTiers = ["tier1_5_8", "tier2_9_11", "tier3_12_14", "tier4_hs"] as const;
    type Tier = (typeof allowedTiers)[number];
    const ageTier: Tier | null =
      ageTierRaw && (allowedTiers as readonly string[]).includes(ageTierRaw)
        ? (ageTierRaw as Tier)
        : null;

    type RawBlock = {
      title?: unknown;
      duration_minutes?: unknown;
      start_offset_minutes?: unknown;
      notes?: unknown;
      lanes?: unknown;
    };
    const rawBlocks = Array.isArray(input.blocks) ? (input.blocks as RawBlock[]) : [];
    const blocks = rawBlocks
      .map((b) => ({
        title: typeof b?.title === "string" ? b.title : "Block",
        durationMinutes: typeof b?.duration_minutes === "number" ? b.duration_minutes : 0,
        startOffsetMinutes:
          typeof b?.start_offset_minutes === "number" ? b.start_offset_minutes : undefined,
        notes: typeof b?.notes === "string" ? b.notes : "",
        lanes: Array.isArray(b?.lanes)
          ? (b.lanes as Array<{ title?: unknown; notes?: unknown }>).map((l) => ({
              title: typeof l?.title === "string" ? l.title : "",
              notes: typeof l?.notes === "string" ? l.notes : "",
            }))
          : undefined,
      }))
      .filter((b) => b.durationMinutes > 0);

    try {
      const { createClient } = await import("@/lib/supabase/server");
      const { createPracticePlanForUser } = await import("@/lib/data/practice-plan-create");
      const supabase = await createClient();
      const res = await createPracticePlanForUser(supabase, {
        playbookId: ctx.playbookId,
        title: title.trim(),
        notes,
        ageTier,
        blocks: blocks.length > 0 ? blocks : undefined,
      });
      if (!res.ok) return { ok: false, error: res.error };
      const url = `/practice-plans/${res.planId}/edit`;
      const summary = blocks.length > 0
        ? `${res.blockCount} block(s), ${res.totalDurationMinutes} min total`
        : "empty (coach will fill in via the editor)";
      return {
        ok: true,
        result:
          `Created practice plan "${title.trim()}" — ${summary}. Tell the coach it's saved and link them: ` +
          `[Open practice plan](${url}). It also shows up in the Practice Plans tab of the playbook.`,
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "create_practice_plan failed" };
    }
  },
};

/**
 * explain_play — produces a structural explanation of a saved play
 * directly from its PlaySpec. NO LLM synthesis happens server-side; the
 * output is a deterministic projection from spec data + catalog
 * lookups. This is the "ask Cal to defend a play" capability: Cal can
 * always explain why a play means what it means, by walking the spec
 * rather than reciting from memory.
 *
 * Falls back to deriving a spec from the saved diagram when the play
 * predates the PlaySpec era — output is shaped the same, but
 * confidence flags will surface that the spec is parser-derived.
 */
const explain_play: CoachAiTool = {
  def: {
    name: "explain_play",
    description:
      "Explain a saved play structurally — formation, defense (if set), per-player assignments, " +
      "and confidence per element. The server walks the play's saved PlaySpec and returns a " +
      "deterministic markdown explanation; no prose generation, no fabrication risk. " +
      "Use this when the coach asks 'why does this play work', 'what are X's reads', " +
      "'walk me through this play', or when you (Cal) need to verify your understanding " +
      "of a saved play before suggesting an edit. Available when anchored to a playbook.",
    input_schema: {
      type: "object",
      properties: {
        play_id: {
          type: "string",
          description: "UUID, group-qualified slot (\"Recommended #5\"), or exact name of the play to explain.",
        },
      },
      required: ["play_id"],
      additionalProperties: false,
    },
  },
  async handler(input, ctx) {
    if (!ctx.playbookId) return { ok: false, error: "No playbook selected." };

    const rawId = typeof input.play_id === "string" ? input.play_id : "";
    const resolved = await resolvePlayId(rawId, ctx.playbookId);
    if (!resolved.ok) return { ok: false, error: resolved.error };
    const playId = resolved.id;

    try {
      const admin = createServiceRoleClient();
      const { data: play, error } = await admin
        .from("plays")
        .select("id, name, current_version_id, play_type")
        .eq("id", playId)
        .eq("playbook_id", ctx.playbookId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) return { ok: false, error: error.message };
      if (!play) return { ok: false, error: "Play not found or not in this playbook." };

      const versionId = play.current_version_id as string | null;
      if (!versionId) return { ok: false, error: "Play has no current version." };

      const { data: version, error: vErr } = await admin
        .from("play_versions")
        .select("document")
        .eq("id", versionId)
        .maybeSingle();
      if (vErr) return { ok: false, error: vErr.message };
      const doc = version?.document as PlayDocument | null;
      if (!doc) return { ok: false, error: "Could not read saved play document." };

      // Prefer the saved spec. If absent (legacy plays), derive one from
      // the diagram so the explanation still has a structural source.
      // The parser-derived path attaches lower confidence so the output
      // surfaces "this is reconstructed, not authored" honestly.
      const savedSpec = doc.metadata.spec ?? null;
      let specForExplain = savedSpec;
      let derivedNote = "";
      if (!specForExplain) {
        // Same rule as get_play: sanitize before reasoning. Legacy plays
        // without a saved spec are exactly the rows most likely to have
        // accumulated empty/out-of-bounds artifacts, so the cleanup matters
        // most here. The user-facing diagram already runs through this
        // pass; explain output should agree.
        const rawDiagram = playDocumentToCoachDiagram(doc, play.name as string);
        const { diagram } = sanitizeCoachDiagram(rawDiagram);
        specForExplain = coachDiagramToPlaySpec(diagram, {
          variant: doc.sportProfile.variant as SportVariant,
          formation: doc.metadata.formation || undefined,
          playType: (play.play_type as "offense" | "defense" | "special_teams" | undefined) ?? undefined,
        });
        derivedNote =
          "\n\n_Note: this play predates the PlaySpec era; explanation was reconstructed from the diagram. " +
          "Some confidence flags reflect parser inference, not authored intent._";
      }

      const explanation = explainSpec(specForExplain);
      return {
        ok: true,
        result: `${explanation}${derivedNote}`,
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "explain_play failed" };
    }
  },
};

// ── Play groups ────────────────────────────────────────────────────────────
//
// Coaches asked to have Cal organize plays into buckets like "3rd & long",
// "goal line", "extra point", etc. The UI's Manage Groups modal already
// surfaces create/rename/delete + per-play assign; these tools mirror those
// flows so Cal can do the same end-to-end without falling back to
// "click here in the sidebar."

/** Resolve a group identifier (UUID or exact/fuzzy name) to a group id +
 *  current name. Mirrors resolvePlayId so Cal can pass whichever it has. */
async function resolveGroupId(
  input: string,
  playbookId: string,
): Promise<{ ok: true; id: string; name: string } | { ok: false; error: string }> {
  if (!input || !input.trim()) return { ok: false, error: "group_id is required." };
  const admin = createServiceRoleClient();
  const { data: groups, error } = await admin
    .from("playbook_groups")
    .select("id, name")
    .eq("playbook_id", playbookId)
    .is("deleted_at", null);
  if (error) return { ok: false, error: error.message };
  const list = (groups ?? []) as Array<{ id: string; name: string }>;
  if (list.length === 0) return { ok: false, error: "This playbook has no groups yet." };

  if (UUID_RE.test(input)) {
    const hit = list.find((g) => g.id === input);
    if (hit) return { ok: true, id: hit.id, name: hit.name };
    return { ok: false, error: `No group with id ${input} in this playbook.` };
  }

  const lower = input.trim().toLowerCase();
  const exact = list.filter((g) => g.name.toLowerCase() === lower);
  if (exact.length === 1) return { ok: true, id: exact[0].id, name: exact[0].name };
  if (exact.length > 1) {
    return {
      ok: false,
      error: `Multiple groups named "${input}". Use the group's UUID to disambiguate.`,
    };
  }
  const fuzzy = list.filter((g) => g.name.toLowerCase().includes(lower));
  if (fuzzy.length === 1) return { ok: true, id: fuzzy[0].id, name: fuzzy[0].name };
  if (fuzzy.length > 1) {
    return {
      ok: false,
      error:
        `"${input}" matched multiple groups. Use the exact name or UUID. Matches: ` +
        fuzzy.slice(0, 5).map((g) => `"${g.name}"`).join(", "),
    };
  }
  return { ok: false, error: `No group matched "${input}". Existing groups: ${list.map((g) => `"${g.name}"`).join(", ")}` };
}

const list_play_groups: CoachAiTool = {
  def: {
    name: "list_play_groups",
    description:
      "List the play groups (folders) in the current playbook with each group's id, " +
      "name, sort order, and the count of plays inside. Call this before creating a " +
      "new group so you don't make a duplicate, and before assigning plays so you " +
      "use the right group_id. The plays themselves come from list_plays — each " +
      "row's `group: …` metadata tells you which group it currently lives in.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  async handler(_input, ctx) {
    if (!ctx.playbookId) return { ok: false, error: "No playbook selected." };
    try {
      const admin = createServiceRoleClient();
      const [groupsRes, playsRes] = await Promise.all([
        admin
          .from("playbook_groups")
          .select("id, name, sort_order")
          .eq("playbook_id", ctx.playbookId)
          .is("deleted_at", null)
          .order("sort_order", { ascending: true }),
        admin
          .from("plays")
          .select("group_id")
          .eq("playbook_id", ctx.playbookId)
          .eq("is_archived", false)
          .is("deleted_at", null)
          .is("attached_to_play_id", null),
      ]);
      if (groupsRes.error) return { ok: false, error: groupsRes.error.message };
      const groups = (groupsRes.data ?? []) as Array<{ id: string; name: string; sort_order: number }>;
      const counts = new Map<string | null, number>();
      for (const p of (playsRes.data ?? []) as Array<{ group_id: string | null }>) {
        counts.set(p.group_id, (counts.get(p.group_id) ?? 0) + 1);
      }
      if (groups.length === 0) {
        const ungrouped = counts.get(null) ?? 0;
        return {
          ok: true,
          result:
            `No groups in this playbook yet. ${ungrouped} ungrouped active play(s). ` +
            `Use create_play_group to add the first one (e.g. "Red Zone", "3rd & Long").`,
        };
      }
      const lines = groups.map(
        (g) => `• "${g.name}" [${g.id}] — ${counts.get(g.id) ?? 0} play(s)`,
      );
      const ungrouped = counts.get(null) ?? 0;
      return {
        ok: true,
        result:
          `${groups.length} group(s) in display order:\n${lines.join("\n")}\n\n` +
          `${ungrouped} active play(s) currently ungrouped.`,
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "list_play_groups failed" };
    }
  },
};

const create_play_group: CoachAiTool = {
  def: {
    name: "create_play_group",
    description:
      "Create a new play group (folder) in the current playbook. Use this when " +
      "the coach wants to organize plays into buckets (\"3rd & Long\", \"Goal Line\", " +
      "\"Extra Point\", \"Red Zone\", etc.). Returns the new group's id, which you " +
      "should keep so you can immediately assign plays to it via assign_plays_to_group. " +
      "ALWAYS confirm the group name with the coach before calling — and call " +
      "list_play_groups first to avoid creating a duplicate of an existing group. " +
      "Requires edit access to the playbook.",
    input_schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Group name (1-60 chars). Short situational labels work best.",
        },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
  async handler(input, ctx) {
    if (!ctx.playbookId) return { ok: false, error: "No playbook selected." };
    if (!ctx.canEditPlaybook) return { ok: false, error: "You don't have edit access to this playbook." };
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name) return { ok: false, error: "name can't be empty." };
    if (name.length > 60) return { ok: false, error: "name must be 60 characters or fewer." };
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createPlaybookGroupAction } = require("@/app/actions/plays") as typeof import("@/app/actions/plays");
      const res = await createPlaybookGroupAction(ctx.playbookId, name);
      if (!res.ok) return { ok: false, error: res.error };
      return {
        ok: true,
        result: `Created group "${res.group.name}" [${res.group.id}]. Use this id when calling assign_plays_to_group.`,
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "create_play_group failed" };
    }
  },
};

const rename_play_group: CoachAiTool = {
  def: {
    name: "rename_play_group",
    description:
      "Rename an existing play group. ALWAYS confirm the new name with the coach " +
      "before calling. Requires edit access to the playbook.",
    input_schema: {
      type: "object",
      properties: {
        group_id: {
          type: "string",
          description: "UUID or exact name of the group to rename.",
        },
        new_name: { type: "string", description: "The new group name (1-60 chars)." },
      },
      required: ["group_id", "new_name"],
      additionalProperties: false,
    },
  },
  async handler(input, ctx) {
    if (!ctx.playbookId) return { ok: false, error: "No playbook selected." };
    if (!ctx.canEditPlaybook) return { ok: false, error: "You don't have edit access to this playbook." };
    const newName = typeof input.new_name === "string" ? input.new_name.trim() : "";
    if (!newName) return { ok: false, error: "new_name can't be empty." };
    if (newName.length > 60) return { ok: false, error: "new_name must be 60 characters or fewer." };
    const resolved = await resolveGroupId(
      typeof input.group_id === "string" ? input.group_id : "",
      ctx.playbookId,
    );
    if (!resolved.ok) return { ok: false, error: resolved.error };
    if (resolved.name === newName) {
      return { ok: true, result: `Group is already named "${newName}" — no change.` };
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { renamePlaybookGroupAction } = require("@/app/actions/plays") as typeof import("@/app/actions/plays");
      const res = await renamePlaybookGroupAction(resolved.id, newName);
      if (!res.ok) return { ok: false, error: res.error };
      return { ok: true, result: `Renamed group "${resolved.name}" → "${newName}".` };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "rename_play_group failed" };
    }
  },
};

const delete_play_group: CoachAiTool = {
  def: {
    name: "delete_play_group",
    description:
      "Delete a play group. The plays inside the group are NOT deleted — they " +
      "drop back to the ungrouped bucket and stay live. The group itself is " +
      "soft-deleted (recoverable from trash for 30 days). ALWAYS confirm with " +
      "the coach and remind them where the plays will end up. Requires edit access.",
    input_schema: {
      type: "object",
      properties: {
        group_id: {
          type: "string",
          description: "UUID or exact name of the group to delete.",
        },
      },
      required: ["group_id"],
      additionalProperties: false,
    },
  },
  async handler(input, ctx) {
    if (!ctx.playbookId) return { ok: false, error: "No playbook selected." };
    if (!ctx.canEditPlaybook) return { ok: false, error: "You don't have edit access to this playbook." };
    const resolved = await resolveGroupId(
      typeof input.group_id === "string" ? input.group_id : "",
      ctx.playbookId,
    );
    if (!resolved.ok) return { ok: false, error: resolved.error };
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { deletePlaybookGroupAction } = require("@/app/actions/plays") as typeof import("@/app/actions/plays");
      const res = await deletePlaybookGroupAction(resolved.id);
      if (!res.ok) return { ok: false, error: res.error };
      return {
        ok: true,
        result:
          `Deleted group "${resolved.name}". Any plays that were in it are now ungrouped and still live in the playbook.`,
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "delete_play_group failed" };
    }
  },
};

const assign_plays_to_group: CoachAiTool = {
  def: {
    name: "assign_plays_to_group",
    description:
      "Move one or more plays into a group (or out of any group). Pass `group_id` " +
      "as the target group's UUID or exact name; pass `null` (or omit) to UNGROUP. " +
      "`play_refs` accepts an array of UUIDs, group-qualified slots (\"Recommended #5\"), and/or exact " +
      "play names — same resolution rules as get_play. Bulk on purpose: when " +
      "organizing 20+ plays, batching avoids 20 round trips. ALWAYS show the " +
      "coach the proposed grouping and wait for explicit confirmation before " +
      "calling. Requires edit access.",
    input_schema: {
      type: "object",
      properties: {
        group_id: {
          type: "string",
          description:
            "Target group UUID or exact group name. Omit (or pass an empty string) to UNGROUP the plays.",
        },
        play_refs: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          maxItems: 100,
          description:
            "Array of play references — UUIDs, group-qualified slots (\"Recommended #5\"), or exact names.",
        },
      },
      required: ["play_refs"],
      additionalProperties: false,
    },
  },
  async handler(input, ctx) {
    if (!ctx.playbookId) return { ok: false, error: "No playbook selected." };
    if (!ctx.canEditPlaybook) return { ok: false, error: "You don't have edit access to this playbook." };

    const refs = Array.isArray(input.play_refs)
      ? input.play_refs.filter((r): r is string => typeof r === "string" && r.trim().length > 0)
      : [];
    if (refs.length === 0) return { ok: false, error: "play_refs must include at least one play." };

    const groupRef = typeof input.group_id === "string" ? input.group_id.trim() : "";
    let targetGroupId: string | null = null;
    let targetGroupName = "(ungrouped)";
    if (groupRef) {
      const resolved = await resolveGroupId(groupRef, ctx.playbookId);
      if (!resolved.ok) return { ok: false, error: resolved.error };
      targetGroupId = resolved.id;
      targetGroupName = resolved.name;
    }

    // Resolve each play ref. Collect failures so the model can fix them in a
    // follow-up call without losing the rest of the batch.
    const resolvedPlays: Array<{ id: string; name: string; ref: string }> = [];
    const failures: string[] = [];
    for (const ref of refs) {
      const r = await resolvePlayId(ref, ctx.playbookId);
      if (r.ok) resolvedPlays.push({ id: r.id, name: r.name, ref });
      else failures.push(`"${ref}": ${r.error}`);
    }
    if (resolvedPlays.length === 0) {
      return {
        ok: false,
        error: `No play_refs resolved. Issues:\n- ${failures.join("\n- ")}`,
      };
    }

    // setPlayGroupAction is per-play; loop server-side. Track per-play
    // success so partial failures still leave a useful summary.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { setPlayGroupAction } = require("@/app/actions/plays") as typeof import("@/app/actions/plays");
    const moved: string[] = [];
    const errors: string[] = [];
    for (const p of resolvedPlays) {
      const res = await setPlayGroupAction(p.id, targetGroupId);
      if (res.ok) moved.push(`"${p.name}"`);
      else errors.push(`"${p.name}": ${res.error}`);
    }

    const lines: string[] = [];
    lines.push(
      `Moved ${moved.length} play(s) → ${targetGroupName}: ${moved.join(", ") || "(none)"}`,
    );
    if (failures.length > 0) {
      lines.push(`Could not resolve ${failures.length} ref(s):\n- ${failures.join("\n- ")}`);
    }
    if (errors.length > 0) {
      lines.push(`Failed to move ${errors.length} play(s):\n- ${errors.join("\n- ")}`);
    }
    // If nothing moved, treat as a hard failure so the model surfaces it
    // clearly. Otherwise return ok with the partial breakdown so the coach
    // sees what worked AND what didn't, in one reply.
    if (moved.length === 0) {
      return { ok: false, error: lines.join("\n\n") };
    }
    return { ok: true, result: lines.join("\n\n") };
  },
};

const archive_play: CoachAiTool = {
  def: {
    name: "archive_play",
    description:
      "Archive one or more plays in the current playbook. Archived plays are " +
      "hidden from the main playbook view and removed from rotation, but the " +
      "underlying data is preserved (the coach can restore from the archive UI). " +
      "Use this when the coach asks to archive, hide, retire, or shelve plays " +
      "they no longer want active. NOT a delete — for permanent removal the " +
      "coach must use the playbook UI directly. " +
      "`play_refs` accepts an array of UUIDs, group-qualified slots (\"Recommended #5\"), and/or " +
      "exact play names — same resolution rules as get_play. Bulk on purpose: " +
      "when archiving a group of legacy plays, batching avoids round trips. " +
      "ALWAYS list the plays you intend to archive and wait for explicit " +
      "coach confirmation before calling. Requires edit access. Will fail " +
      "if the playbook has an active game session in progress.",
    input_schema: {
      type: "object",
      properties: {
        play_refs: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          maxItems: 100,
          description:
            "Array of play references — UUIDs, group-qualified slots (\"Recommended #5\"), or exact names.",
        },
      },
      required: ["play_refs"],
      additionalProperties: false,
    },
  },
  async handler(input, ctx) {
    if (!ctx.playbookId) return { ok: false, error: "No playbook selected." };
    if (!ctx.canEditPlaybook) return { ok: false, error: "You don't have edit access to this playbook." };

    const refs = Array.isArray(input.play_refs)
      ? input.play_refs.filter((r): r is string => typeof r === "string" && r.trim().length > 0)
      : [];
    if (refs.length === 0) return { ok: false, error: "play_refs must include at least one play." };

    const resolvedPlays: Array<{ id: string; name: string; ref: string }> = [];
    const failures: string[] = [];
    for (const ref of refs) {
      const r = await resolvePlayId(ref, ctx.playbookId);
      if (r.ok) resolvedPlays.push({ id: r.id, name: r.name, ref });
      else failures.push(`"${ref}": ${r.error}`);
    }
    if (resolvedPlays.length === 0) {
      return {
        ok: false,
        error: `No play_refs resolved. Issues:\n- ${failures.join("\n- ")}`,
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { archivePlayAction } = require("@/app/actions/plays") as typeof import("@/app/actions/plays");
    const archived: string[] = [];
    const errors: string[] = [];
    for (const p of resolvedPlays) {
      const res = await archivePlayAction(p.id, true);
      if (res.ok) archived.push(`"${p.name}"`);
      else errors.push(`"${p.name}": ${res.error}`);
    }

    const lines: string[] = [];
    lines.push(
      `Archived ${archived.length} play(s): ${archived.join(", ") || "(none)"}`,
    );
    if (failures.length > 0) {
      lines.push(`Could not resolve ${failures.length} ref(s):\n- ${failures.join("\n- ")}`);
    }
    if (errors.length > 0) {
      lines.push(`Failed to archive ${errors.length} play(s):\n- ${errors.join("\n- ")}`);
    }
    if (archived.length === 0) {
      return { ok: false, error: lines.join("\n\n") };
    }
    return { ok: true, result: lines.join("\n\n") };
  },
};

/**
 * Read recent edit history for a play. Cal calls this when the coach asks to
 * "undo", "revert", "go back", or otherwise reverse a recent change — Cal
 * needs to see which version to restore. Versions are returned newest-first;
 * the first row is the current state, so most "undo last change" requests
 * mean restoring the SECOND row.
 */
const list_play_versions: CoachAiTool = {
  def: {
    name: "list_play_versions",
    description:
      "List the recent edit history of a play (newest first). Each row shows the " +
      "version id, what kind of change it was (create/edit/restore), who made it, " +
      "when, and a short diff summary. Use this when the coach asks to undo, revert, " +
      "or reverse a change — pair it with restore_play_version. The current saved " +
      "state is the first row; \"undo my last change\" usually means restoring the " +
      "second row.",
    input_schema: {
      type: "object",
      properties: {
        play_id: {
          type: "string",
          description: "UUID, slot number (\"4\"), or exact name of the play.",
        },
        limit: {
          type: "number",
          description: "Max rows to return. Default 10, max 50.",
        },
      },
      required: ["play_id"],
      additionalProperties: false,
    },
  },
  async handler(input, ctx) {
    if (!ctx.playbookId) return { ok: false, error: "No playbook selected." };
    const rawId = typeof input.play_id === "string" ? input.play_id : "";
    const resolved = await resolvePlayId(rawId, ctx.playbookId);
    if (!resolved.ok) return { ok: false, error: resolved.error };
    const playId = resolved.id;
    const limit = Math.max(1, Math.min(50, Number(input.limit) || 10));

    const admin = createServiceRoleClient();
    const { data: play } = await admin
      .from("plays")
      .select("name, current_version_id, playbook_id")
      .eq("id", playId)
      .maybeSingle();
    if (!play || play.playbook_id !== ctx.playbookId) {
      return { ok: false, error: "Play not found in this playbook." };
    }
    const currentId = (play.current_version_id as string | null) ?? null;

    const { data: versions, error } = await admin
      .from("play_versions")
      .select("id, created_at, editor_name_snapshot, note, diff_summary, kind")
      .eq("play_id", playId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return { ok: false, error: error.message };

    const lines: string[] = [];
    lines.push(`Recent versions of "${play.name}" (newest first):`);
    for (const v of versions ?? []) {
      const id = v.id as string;
      const isCurrent = id === currentId;
      const when = new Date(v.created_at as string).toLocaleString("en-US");
      const editor = (v.editor_name_snapshot as string | null) ?? "unknown";
      const kind = (v.kind as string | null) ?? "edit";
      const note = (v.note as string | null) ?? "";
      const diff = (v.diff_summary as string | null) ?? "";
      const label = [
        `${isCurrent ? "→ CURRENT  " : "           "}${id.slice(0, 8)}`,
        kind,
        editor,
        when,
        note || diff || "",
      ]
        .filter(Boolean)
        .join(" · ");
      lines.push(label);
    }
    if ((versions ?? []).length === 0) {
      lines.push("(no history yet)");
    }
    return { ok: true, result: lines.join("\n") };
  },
};

/**
 * Cal-callable wrapper around the existing restorePlayVersionAction. The
 * restore creates a NEW version row (kind=restore) so the audit trail stays
 * intact — it doesn't mutate or delete history.
 */
const restore_play_version: CoachAiTool = {
  def: {
    name: "restore_play_version",
    description:
      "Revert a play to a prior version's contents. Use this for any \"undo\", " +
      "\"revert\", \"go back\", \"that wasn't right\" request — restoring is the " +
      "only safe way to reverse an earlier write tool call. ALWAYS call " +
      "list_play_versions first so you know which version_id to target, AND " +
      "ALWAYS confirm the restore with the coach before calling (\"this will " +
      "revert to the version saved at HH:MM by NAME — proceed?\"). Restoring " +
      "creates a new \"restore\" version row; nothing is permanently lost. " +
      "Requires edit access to the playbook.",
    input_schema: {
      type: "object",
      properties: {
        play_id: {
          type: "string",
          description: "UUID, slot number, or name of the play to revert.",
        },
        version_id: {
          type: "string",
          description:
            "UUID of the play_versions row to restore (from list_play_versions). " +
            "Or the literal string \"previous\" to restore the version immediately " +
            "before the current one (most common case for \"undo my last change\").",
        },
      },
      required: ["play_id", "version_id"],
      additionalProperties: false,
    },
  },
  async handler(input, ctx) {
    if (!ctx.playbookId) return { ok: false, error: "No playbook selected." };
    if (!ctx.canEditPlaybook) return { ok: false, error: "You don't have edit access to this playbook." };
    const rawId = typeof input.play_id === "string" ? input.play_id : "";
    const versionArg = typeof input.version_id === "string" ? input.version_id.trim() : "";
    if (!versionArg) return { ok: false, error: "version_id is required." };

    const resolved = await resolvePlayId(rawId, ctx.playbookId);
    if (!resolved.ok) return { ok: false, error: resolved.error };
    const playId = resolved.id;

    const admin = createServiceRoleClient();
    const { data: play } = await admin
      .from("plays")
      .select("name, current_version_id, playbook_id")
      .eq("id", playId)
      .maybeSingle();
    if (!play || play.playbook_id !== ctx.playbookId) {
      return { ok: false, error: "Play not found in this playbook." };
    }
    const currentId = (play.current_version_id as string | null) ?? null;

    // Resolve "previous" → the version immediately before the current one.
    let targetVersionId: string;
    if (versionArg.toLowerCase() === "previous") {
      const { data: rows } = await admin
        .from("play_versions")
        .select("id")
        .eq("play_id", playId)
        .order("created_at", { ascending: false })
        .limit(2);
      const list = (rows ?? []) as { id: string }[];
      if (list.length < 2) {
        return {
          ok: false,
          error: "No prior version exists for this play — nothing to revert to.",
        };
      }
      // First row is the current; second is the previous.
      const first = list[0]!.id;
      const second = list[1]!.id;
      targetVersionId = first === currentId ? second : first;
    } else if (UUID_RE.test(versionArg)) {
      targetVersionId = versionArg;
    } else {
      return {
        ok: false,
        error:
          "version_id must be a UUID from list_play_versions, or the literal \"previous\".",
      };
    }

    if (targetVersionId === currentId) {
      return { ok: true, result: "That version is already current — nothing to revert." };
    }

    const { restorePlayVersionAction } = await import("@/app/actions/versions");
    const res = await restorePlayVersionAction(playId, targetVersionId);
    if (!res.ok) return { ok: false, error: res.error };

    return {
      ok: true,
      result:
        `Restored "${play.name}" to version ${targetVersionId.slice(0, 8)}. ` +
        `A new "restore" entry was added to the history; the old state is still ` +
        `available via list_play_versions if you need to revert again.`,
    };
  },
};

export const PLAY_TOOLS: CoachAiTool[] = [
  list_plays,
  get_play,
  create_play,
  update_play,
  rename_play,
  update_play_notes,
  update_player,
  explain_play,
  list_play_versions,
  restore_play_version,
  create_practice_plan,
  list_play_groups,
  create_play_group,
  rename_play_group,
  delete_play_group,
  assign_plays_to_group,
  archive_play,
];
