"use server";

// Server actions for per-user custom route templates surfaced in the play
// editor's Quick Routes panel. Storage + RLS:
//   supabase/migrations/20260518120000_user_route_templates.sql
// Domain helpers (normalize / instantiate):
//   src/domain/play/userRouteTemplates.ts

import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import type {
  Point2,
  RouteStyle,
  SegmentShape,
  StrokePattern,
} from "@/domain/play/types";
import type { UserRouteTemplate } from "@/domain/play/userRouteTemplates";

const NAME_MAX = 40;
const POINTS_MAX = 32;

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

/* ------------------------------------------------------------------ */
/*  Input sanitization                                                 */
/* ------------------------------------------------------------------ */

function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().slice(0, NAME_MAX);
  return trimmed.length > 0 ? trimmed : null;
}

function isFinitePoint(p: unknown): p is Point2 {
  return (
    typeof p === "object" &&
    p !== null &&
    typeof (p as Point2).x === "number" &&
    typeof (p as Point2).y === "number" &&
    Number.isFinite((p as Point2).x) &&
    Number.isFinite((p as Point2).y)
  );
}

function isShape(v: unknown): v is SegmentShape {
  return v === "straight" || v === "curve" || v === "zigzag";
}

function isStrokePattern(v: unknown): v is StrokePattern {
  return v === "solid" || v === "dashed" || v === "dotted" || v === "motion";
}

function cleanStyle(raw: unknown): RouteStyle | null {
  if (typeof raw !== "object" || raw === null) return null;
  const s = raw as Partial<RouteStyle>;
  if (typeof s.stroke !== "string" || !/^#[0-9a-fA-F]{3,8}$/.test(s.stroke)) return null;
  if (typeof s.strokeWidth !== "number" || !Number.isFinite(s.strokeWidth)) return null;
  const out: RouteStyle = { stroke: s.stroke, strokeWidth: s.strokeWidth };
  if (typeof s.dash === "string" && s.dash.length > 0 && s.dash.length <= 40) {
    out.dash = s.dash;
  }
  return out;
}

type SavePayload = {
  name: string;
  points: Point2[];
  shapes: SegmentShape[];
  strokePatterns?: StrokePattern[];
  style: RouteStyle;
};

function validatePayload(raw: {
  name: unknown;
  points: unknown;
  shapes: unknown;
  strokePatterns?: unknown;
  style: unknown;
}): SavePayload | { error: string } {
  const name = cleanName(raw.name);
  if (!name) return { error: "Template name is required." };

  if (!Array.isArray(raw.points) || raw.points.length < 2 || raw.points.length > POINTS_MAX) {
    return { error: "Route must have between 2 and 32 points." };
  }
  if (!raw.points.every(isFinitePoint)) {
    return { error: "Route points must be finite numbers." };
  }
  const points = raw.points as Point2[];

  if (!Array.isArray(raw.shapes) || raw.shapes.length !== points.length - 1) {
    return { error: "Shape count must match segment count." };
  }
  if (!raw.shapes.every(isShape)) {
    return { error: "Unknown segment shape." };
  }
  const shapes = raw.shapes as SegmentShape[];

  let strokePatterns: StrokePattern[] | undefined;
  if (Array.isArray(raw.strokePatterns)) {
    if (raw.strokePatterns.length !== shapes.length) {
      return { error: "Stroke-pattern count must match segment count." };
    }
    if (!raw.strokePatterns.every(isStrokePattern)) {
      return { error: "Unknown stroke pattern." };
    }
    strokePatterns = raw.strokePatterns as StrokePattern[];
  }

  const style = cleanStyle(raw.style);
  if (!style) return { error: "Invalid route style." };

  return { name, points, shapes, strokePatterns, style };
}

/* ------------------------------------------------------------------ */
/*  Row mapping                                                        */
/* ------------------------------------------------------------------ */

function rowToTemplate(r: {
  id: string;
  name: string;
  points: unknown;
  shapes: unknown;
  stroke_patterns: unknown;
  style: unknown;
  created_at: string;
}): UserRouteTemplate | null {
  if (!Array.isArray(r.points) || !r.points.every(isFinitePoint)) return null;
  if (!Array.isArray(r.shapes) || !r.shapes.every(isShape)) return null;
  const style = cleanStyle(r.style);
  if (!style) return null;
  let strokePatterns: StrokePattern[] | undefined;
  if (Array.isArray(r.stroke_patterns) && r.stroke_patterns.every(isStrokePattern)) {
    strokePatterns = r.stroke_patterns as StrokePattern[];
  }
  return {
    id: r.id,
    name: r.name,
    points: r.points as Point2[],
    shapes: r.shapes as SegmentShape[],
    strokePatterns,
    style,
    createdAt: r.created_at,
  };
}

/* ------------------------------------------------------------------ */
/*  Actions                                                            */
/* ------------------------------------------------------------------ */

export async function listUserRouteTemplatesAction(): Promise<
  Result<UserRouteTemplate[]>
> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data, error } = await supabase
    .from("user_route_templates")
    .select("id, name, points, shapes, stroke_patterns, style, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: error.message };

  const templates = (data ?? [])
    .map(rowToTemplate)
    .filter((t): t is UserRouteTemplate => t !== null);
  return { ok: true, data: templates };
}

export async function createUserRouteTemplateAction(
  raw: {
    name: unknown;
    points: unknown;
    shapes: unknown;
    strokePatterns?: unknown;
    style: unknown;
  },
): Promise<Result<UserRouteTemplate>> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const v = validatePayload(raw);
  if ("error" in v) return { ok: false, error: v.error };

  const { data, error } = await supabase
    .from("user_route_templates")
    .insert({
      user_id: user.id,
      name: v.name,
      points: v.points,
      shapes: v.shapes,
      stroke_patterns: v.strokePatterns ?? null,
      style: v.style,
    })
    .select("id, name, points, shapes, stroke_patterns, style, created_at")
    .single();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Insert returned no row." };

  const template = rowToTemplate(data);
  if (!template) return { ok: false, error: "Stored template failed validation read-back." };

  // Verify row reads back under the user's session.
  const { data: verify } = await supabase
    .from("user_route_templates")
    .select("id")
    .eq("id", template.id)
    .maybeSingle();
  if (!verify?.id) return { ok: false, error: "Template insert could not be verified." };

  return { ok: true, data: template };
}

export async function renameUserRouteTemplateAction(
  id: string,
  rawName: unknown,
): Promise<Result<{ id: string; name: string }>> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const name = cleanName(rawName);
  if (!name) return { ok: false, error: "Name cannot be empty." };

  const { data, error } = await supabase
    .from("user_route_templates")
    .update({ name })
    .eq("id", id)
    .eq("user_id", user.id) // belt-and-suspenders; RLS already enforces
    .select("id, name")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Template not found." };
  return { ok: true, data };
}

export async function deleteUserRouteTemplateAction(
  id: string,
): Promise<Result<{ id: string }>> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase
    .from("user_route_templates")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id } };
}
