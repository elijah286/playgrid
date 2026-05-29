// App install report — how many installs, which users, by platform.
// Reads the app_installs table (first_opened_at == install). Run:
//   set -a && source .env.local && set +a && node scripts/app-installs.mjs
import { createClient } from "@supabase/supabase-js";

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fetchAll(table, columns) {
  let all = [], from = 0;
  for (;;) {
    const { data, error } = await s.from(table).select(columns).range(from, from + 999);
    if (error) { console.error(`${table} error:`, error.message); break; }
    if (!data || !data.length) break;
    all = all.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return all;
}

(async () => {
  const installs = await fetchAll(
    "app_installs",
    "install_id, user_id, platform, app_version, first_opened_at, last_opened_at, install_referrer",
  );
  const { data: au } = await s.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const email = {}; (au?.users || []).forEach((u) => { email[u.id] = u.email; });
  const now = Date.now();
  const days = (ts) => (now - new Date(ts).getTime()) / 86400000;

  console.log("\n=== APP INSTALLS ===\n");
  console.log(`Total installs (distinct devices): ${installs.length}`);
  const byPlatform = {}; installs.forEach((r) => { byPlatform[r.platform] = (byPlatform[r.platform] || 0) + 1; });
  console.log(`  by platform: ${JSON.stringify(byPlatform)}`);
  const withUser = installs.filter((r) => r.user_id);
  console.log(`  tied to a signed-in account: ${withUser.length}`);
  console.log(`  distinct users with the app: ${new Set(withUser.map((r) => r.user_id)).size}`);
  console.log(`  new installs last 7d / 30d: ${installs.filter((r) => days(r.first_opened_at) <= 7).length} / ${installs.filter((r) => days(r.first_opened_at) <= 30).length}`);
  console.log(`  active (opened) last 7d: ${installs.filter((r) => days(r.last_opened_at) <= 7).length}`);

  if (installs.length) {
    console.log("\n=== WHICH USERS (most recent 30 installs) ===");
    installs
      .sort((a, b) => new Date(b.first_opened_at) - new Date(a.first_opened_at))
      .slice(0, 30)
      .forEach((r) => {
        const who = email[r.user_id] || (r.user_id ? r.user_id.slice(0, 8) : "(not signed in)");
        console.log(
          `  ${r.platform.padEnd(8)} | ${who.padEnd(34)} | installed ${Math.floor(days(r.first_opened_at))}d ago, last open ${Math.floor(days(r.last_opened_at))}d ago` +
            (r.install_referrer ? ` | ref=${r.install_referrer}` : ""),
        );
      });
  }
})();
