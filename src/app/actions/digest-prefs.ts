"use server";

import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";

export type DigestPrefs = {
  optedOut: boolean;
  sendHourLocal: number;
  timezone: string;
};

const DEFAULT_HOUR = 8;
const DEFAULT_TZ = "America/Los_Angeles";

function browserTzOrDefault(input: string | null | undefined): string {
  const tz = (input ?? "").trim();
  if (!tz) return DEFAULT_TZ;
  // Validate by attempting to format with it; fall back on error.
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TZ;
  }
}

export type DigestPlaybookPref = {
  playbookId: string;
  playbookName: string;
  playbookColor: string | null;
  playbookLogoUrl: string | null;
  optedOut: boolean;
  sendHourLocal: number;
  timezone: string;
};

export async function listDigestPlaybooksAction(): Promise<
  | { ok: true; items: DigestPlaybookPref[] }
  | { ok: false; error: string }
> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: members, error: mErr } = await supabase
    .from("playbook_members")
    .select(
      "playbook_id, playbooks!inner(id, name, color, logo_url, is_archived)",
    )
    .eq("user_id", user.id)
    .eq("status", "active")
    .eq("playbooks.is_archived", false);
  if (mErr) return { ok: false, error: mErr.message };

  type Row = {
    playbook_id: string;
    playbooks:
      | { id: string; name: string; color: string | null; logo_url: string | null }
      | { id: string; name: string; color: string | null; logo_url: string | null }[]
      | null;
  };
  const rows = (members ?? []) as unknown as Row[];
  const ids = rows
    .map((r) => r.playbook_id)
    .filter((v): v is string => Boolean(v));
  if (ids.length === 0) return { ok: true, items: [] };

  const { data: prefs } = await supabase
    .from("digest_preferences")
    .select("playbook_id, opted_out, send_hour_local, timezone")
    .eq("user_id", user.id)
    .in("playbook_id", ids);
  type Pref = {
    playbook_id: string;
    opted_out: boolean;
    send_hour_local: number;
    timezone: string;
  };
  const prefMap = new Map<string, Pref>();
  for (const p of (prefs ?? []) as Pref[]) prefMap.set(p.playbook_id, p);

  const items: DigestPlaybookPref[] = [];
  for (const r of rows) {
    const pb = Array.isArray(r.playbooks) ? r.playbooks[0] : r.playbooks;
    if (!pb) continue;
    const p = prefMap.get(pb.id);
    items.push({
      playbookId: pb.id,
      playbookName: pb.name,
      playbookColor: pb.color,
      playbookLogoUrl: pb.logo_url,
      optedOut: p?.opted_out ?? false,
      sendHourLocal: p?.send_hour_local ?? DEFAULT_HOUR,
      timezone: p?.timezone ?? DEFAULT_TZ,
    });
  }
  items.sort((a, b) => a.playbookName.localeCompare(b.playbookName));
  return { ok: true, items };
}

export async function getDigestPrefsAction(
  playbookId: string,
): Promise<{ ok: true; prefs: DigestPrefs } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data, error } = await supabase
    .from("digest_preferences")
    .select("opted_out, send_hour_local, timezone")
    .eq("user_id", user.id)
    .eq("playbook_id", playbookId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) {
    return {
      ok: true,
      prefs: {
        optedOut: false,
        sendHourLocal: DEFAULT_HOUR,
        timezone: DEFAULT_TZ,
      },
    };
  }
  return {
    ok: true,
    prefs: {
      optedOut: Boolean(data.opted_out),
      sendHourLocal: Number(data.send_hour_local),
      timezone: String(data.timezone),
    },
  };
}

export async function updateDigestPrefsAction(args: {
  playbookId: string;
  optedOut: boolean;
  sendHourLocal: number;
  timezone: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const hour = Math.max(0, Math.min(23, Math.round(args.sendHourLocal)));
  const tz = browserTzOrDefault(args.timezone);

  const { error } = await supabase.from("digest_preferences").upsert(
    {
      user_id: user.id,
      playbook_id: args.playbookId,
      opted_out: args.optedOut,
      send_hour_local: hour,
      timezone: tz,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,playbook_id" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
