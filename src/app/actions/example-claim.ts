"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { ensureDefaultWorkspace } from "@/lib/data/workspace";
import { copyPlaybookContents } from "@/lib/data/playbook-copy";
import { getUserEntitlement } from "@/lib/billing/entitlement";
import { FREE_MAX_PLAYBOOKS_OWNED, tierAtLeast } from "@/lib/billing/features";

export type ExamplePreview = {
  playbookId: string;
  name: string;
  season: string | null;
  sportVariant: string | null;
  logoUrl: string | null;
  color: string | null;
  playCount: number;
  exampleAuthorLabel: string | null;
};

export async function previewExamplePlaybookAction(
  playbookId: string,
): Promise<{ ok: true; preview: ExamplePreview } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const { data: book, error } = await supabase
    .from("playbooks")
    .select(
      "id, name, season, sport_variant, logo_url, color, is_public_example, example_author_label, plays(count)",
    )
    .eq("id", playbookId)
    .is("plays.deleted_at", null)
    .eq("plays.is_archived", false)
    .maybeSingle();
  if (error || !book) return { ok: false, error: "Example not found." };
  if (!book.is_public_example) {
    return { ok: false, error: "This playbook isn't a published example." };
  }
  const playRows = book.plays as unknown as Array<{ count: number }> | null;
  const playCount = Array.isArray(playRows) && playRows[0]?.count ? playRows[0].count : 0;
  return {
    ok: true,
    preview: {
      playbookId: book.id as string,
      name: book.name as string,
      season: (book.season as string | null) ?? null,
      sportVariant: (book.sport_variant as string | null) ?? null,
      logoUrl: (book.logo_url as string | null) ?? null,
      color: (book.color as string | null) ?? null,
      playCount,
      exampleAuthorLabel: (book.example_author_label as string | null) ?? null,
    },
  };
}

export type ClaimCustomizations = {
  /** Override the copied playbook's name. Trimmed; empty string = use source. */
  name?: string;
  /** Hex color, e.g. "#2563eb". Omit to keep the source color. */
  color?: string;
  /** Logo URL or null to clear. Omit to keep the source logo. */
  logoUrl?: string | null;
};

/** Clones a published example playbook into the caller's workspace as a
 *  fresh, owned playbook. Mirrors acceptCopyLinkAction but skips the
 *  token-redeem and referral side-effects (examples have no sender).
 *
 *  When `customizations` is provided, the new playbook is created with
 *  the user-chosen name/color/logo instead of copying from the source —
 *  the claim flow surfaces an inline editor so coaches own their
 *  playbook's identity from the first second they see it. */
export async function acceptExamplePlaybookAction(
  playbookId: string,
  customizations?: ClaimCustomizations,
): Promise<
  | { ok: true; playbookId: string }
  | { ok: false; error: string; needsUpgrade?: boolean }
> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: src, error: srcErr } = await supabase
    .from("playbooks")
    .select(
      "id, name, sport_variant, custom_offense_count, color, logo_url, season, is_public_example",
    )
    .eq("id", playbookId)
    .maybeSingle();
  if (srcErr || !src) return { ok: false, error: srcErr?.message ?? "Example not found." };
  if (!src.is_public_example) {
    return { ok: false, error: "This playbook isn't a published example." };
  }

  // Free-tier quota: one owned playbook. Upgrade prompt mirrors copy-link
  // claim so the user gets a consistent message wherever they enter from.
  const entitlement = await getUserEntitlement(user.id);
  if (!tierAtLeast(entitlement, "coach")) {
    const { count } = await supabase
      .from("playbook_members")
      .select("playbook_id, playbooks!inner(id)", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("role", "owner")
      .eq("playbooks.is_default", false);
    if ((count ?? 0) >= FREE_MAX_PLAYBOOKS_OWNED) {
      return {
        ok: false,
        error: `Free accounts are limited to ${FREE_MAX_PLAYBOOKS_OWNED} playbook. Upgrade to Team Coach to claim this copy.`,
        needsUpgrade: true,
      };
    }
  }

  let targetTeamId: string;
  try {
    const ws = await ensureDefaultWorkspace(supabase, user.id);
    targetTeamId = ws.teamId;
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not resolve workspace.",
    };
  }

  const overrideName = customizations?.name?.trim();
  const overrideColor = customizations?.color?.trim();
  const overrideLogoUrl =
    customizations && "logoUrl" in customizations
      ? customizations.logoUrl
      : undefined;
  const { data: newBook, error: pbErr } = await supabase
    .from("playbooks")
    .insert({
      team_id: targetTeamId,
      name: (overrideName && overrideName.length > 0
        ? overrideName
        : (src.name as string)
      ).slice(0, 120),
      sport_variant: src.sport_variant,
      custom_offense_count: src.custom_offense_count,
      color:
        overrideColor && overrideColor.length > 0 ? overrideColor : src.color,
      logo_url:
        overrideLogoUrl === undefined ? src.logo_url : overrideLogoUrl,
      season: src.season,
    })
    .select("id")
    .single();
  if (pbErr) return { ok: false, error: pbErr.message };

  await supabase
    .from("playbook_members")
    .insert({ playbook_id: newBook.id, user_id: user.id, role: "owner" });

  await copyPlaybookContents(supabase, src.id as string, newBook.id, user.id);

  // Telemetry: this is one of the most valuable conversion moments — the
  // moment a visitor turned into an owner-of-content. Logged via the
  // service role so RLS doesn't get in the way.
  try {
    const admin = createServiceRoleClient();
    await admin.from("ui_events").insert({
      session_id: `server:${user.id}`,
      user_id: user.id,
      path: `/copy/example/${playbookId}`,
      event_name: "example_claimed",
      target: playbookId,
      metadata: { source_playbook_id: playbookId, new_playbook_id: newBook.id },
    });
  } catch {
    /* best-effort */
  }

  revalidatePath("/home");
  return { ok: true, playbookId: newBook.id as string };
}
