"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { requireAdmin } from "./admin-guard";
import type { ReportStatus } from "@/lib/moderation/report-types";
import { REPORT_STATUSES } from "@/lib/moderation/report-types";

export type ContentReportRow = {
  id: string;
  content_type: string;
  content_ref: string | null;
  playbook_id: string | null;
  reason: string;
  details: string | null;
  reported_text: string | null;
  status: ReportStatus;
  created_at: string;
  reviewed_at: string | null;
  reporter_id: string | null;
  reporter_email: string | null;
  reporter_display_name: string | null;
};

/** Resolve reporter email (auth admin API) + display name (profiles) for a set
 *  of user ids. profiles has no email column, so email comes from listUsers —
 *  same approach as the refusal/feedback admin queues. */
async function resolveReporters(
  userIds: string[],
): Promise<Map<string, { email: string | null; display_name: string | null }>> {
  const out = new Map<string, { email: string | null; display_name: string | null }>();
  if (userIds.length === 0) return out;
  const admin = createServiceRoleClient();
  const [{ data: profiles }, authRes] = await Promise.all([
    admin.from("profiles").select("id, display_name").in("id", userIds),
    admin.auth.admin.listUsers({ perPage: 1000, page: 1 }),
  ]);
  const nameById = new Map(
    (profiles ?? []).map((p) => [
      p.id as string,
      (p as { display_name: string | null }).display_name ?? null,
    ]),
  );
  const emailById = new Map((authRes.data?.users ?? []).map((u) => [u.id, u.email ?? null]));
  for (const id of userIds) {
    out.set(id, { email: emailById.get(id) ?? null, display_name: nameById.get(id) ?? null });
  }
  return out;
}

export async function listContentReportsAction(
  statusFilter: "open" | "all" = "open",
): Promise<{ ok: true; items: ContentReportRow[] } | { ok: false; error: string }> {
  await requireAdmin();
  const supabase = await createClient();
  let q = supabase
    .from("content_reports")
    .select(
      "id, content_type, content_ref, playbook_id, reason, details, reported_text, status, created_at, reviewed_at, reporter_id",
    )
    .order("created_at", { ascending: false })
    .limit(500);
  if (statusFilter === "open") q = q.eq("status", "open");
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };

  const rows = (data ?? []) as Array<Omit<ContentReportRow, "reporter_email" | "reporter_display_name">>;
  const reporterIds = Array.from(
    new Set(rows.map((r) => r.reporter_id).filter((id): id is string => !!id)),
  );
  const reporters = await resolveReporters(reporterIds);
  const items: ContentReportRow[] = rows.map((r) => {
    const info = r.reporter_id ? reporters.get(r.reporter_id) : null;
    return {
      ...r,
      reporter_email: info?.email ?? null,
      reporter_display_name: info?.display_name ?? null,
    };
  });
  return { ok: true, items };
}

export async function setContentReportStatusAction(
  id: string,
  status: ReportStatus,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user } = await requireAdmin();
  if (!REPORT_STATUSES.includes(status)) return { ok: false, error: "Invalid status." };
  const supabase = await createClient();
  const resolved = status !== "open";
  const { error } = await supabase
    .from("content_reports")
    .update({
      status,
      reviewed_at: resolved ? new Date().toISOString() : null,
      reviewed_by: resolved ? user?.id ?? null : null,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteContentReportAction(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("content_reports").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
