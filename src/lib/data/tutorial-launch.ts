import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import type { SportVariant } from "@/domain/play/types";

export type LearnPlaybookOption = {
  id: string;
  name: string;
  variant: SportVariant | null;
};

/**
 * Resolve the launch options for the Learning Center: the user's
 * non-archived, non-default playbooks. The tour always creates a fresh
 * play under the chosen playbook (so the coach starts on a clean slate)
 * — we don't need to resolve an existing play id here.
 *
 * Downgrade-locked playbooks are NOT filtered out: tutorial plays are
 * disposable scratch space that bypasses `assertNotLocked` and
 * `assertPlayCap` via the `is_tutorial` flag, so coaches on downgraded
 * plans can still take the tour in any of their playbooks.
 */
export async function getTutorialLaunchOptions(): Promise<LearnPlaybookOption[]> {
  if (!hasSupabaseEnv()) return [];
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: members } = await supabase
    .from("playbook_members")
    .select(
      "playbooks!inner(id, name, sport_variant, updated_at, is_default, is_archived)",
    )
    .eq("user_id", user.id);

  type Row = {
    playbooks: {
      id: string;
      name: string | null;
      sport_variant: SportVariant | null;
      updated_at: string | null;
      is_default: boolean | null;
      is_archived: boolean | null;
    };
  };

  const seen = new Set<string>();
  return ((members ?? []) as unknown as Row[])
    .map((r) => r.playbooks)
    .filter((p) => p && !p.is_default && !p.is_archived)
    .filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    })
    .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""))
    .map((p) => ({
      id: p.id,
      name: p.name ?? "Untitled playbook",
      variant: p.sport_variant ?? null,
    }));
}
