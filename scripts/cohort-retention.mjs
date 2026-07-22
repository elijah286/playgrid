// Cohort-retention tracker for paid subscriptions.
//
// The aggregate churn number lies when a launch spike is in the mix (2026-05
// launch cohort churned ~82%; the 2026-06/07 cohorts retained ~80-86%). This
// script splits paid subs into monthly cohorts and shows how each survives
// over time — so you watch the real signal, not the launch noise. Run it
// monthly; the number that matters most is whether a cohort survives its
// first football season-end (Nov/Dec).
//
// Read-only. Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
//   node scripts/cohort-retention.mjs

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const s = createClient(url, key);

// Price assumption (no amount column on subscriptions; MRR is derived).
const PRICE = { "coach/month": 9, "coach/year": 90 / 12 };
const NOW = new Date();
const ym = (d) => (d ? String(d).slice(0, 7) : null);
const monthKey = (dt) => `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
const monthsBetween = (a, b) =>
  (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
const endOfMonth = (key) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0, 23, 59, 59)); // day 0 of next month = last day of this
};

async function fetchAll(table, cols) {
  let all = [], from = 0; const size = 1000;
  for (;;) {
    const { data, error } = await s.from(table).select(cols).order("created_at", { ascending: false }).range(from, from + size - 1);
    if (error) { console.error(`${table}:`, error.message); break; }
    if (!data?.length) break;
    all = all.concat(data);
    if (data.length < size) break;
    from += size;
  }
  return all;
}

const subs = await fetchAll(
  "subscriptions",
  "user_id,tier,status,billing_interval,created_at,cancel_at,current_period_end,updated_at,cancel_at_period_end",
);
const profiles = await fetchAll("profiles", "id,created_at");

// churn-effective date for a sub (null = still alive)
const churnDate = (x) =>
  x.status === "canceled" ? new Date(x.cancel_at || x.current_period_end || x.updated_at) : null;
const aliveAt = (x, d) => new Date(x.created_at) <= d && (() => { const c = churnDate(x); return !c || c > d; })();

// ---- current state ----
const active = subs.filter((x) => x.status === "active");
let mrr = 0;
for (const x of active) mrr += PRICE[`${x.tier}/${x.billing_interval}`] ?? 9;
const leavingSoon = active.filter((x) => x.cancel_at_period_end).length;

console.log(`\n=== COHORT RETENTION TRACKER — ${NOW.toISOString().slice(0, 10)} ===`);
console.log(`Active payers: ${active.length}  |  est. MRR: $${mrr.toFixed(0)}  |  flagged to cancel at period-end: ${leavingSoon}`);
console.log(`Total subs ever: ${subs.length}  |  total signups: ${profiles.length}`);

// ---- signups by cohort (for conversion) ----
const signupByMo = {};
for (const p of profiles) { const m = ym(p.created_at); if (m) signupByMo[m] = (signupByMo[m] || 0) + 1; }

// ---- retention triangle ----
const cohorts = {};
for (const x of subs) { const c = ym(x.created_at); (cohorts[c] ??= []).push(x); }
const cohortKeys = Object.keys(cohorts).sort();
const maxAge = Math.max(0, ...cohortKeys.map((c) => monthsBetween(endOfMonth(c), NOW)));

console.log(`\nRetention triangle — % of each paid cohort still active, by months since start (M0 = signup month):`);
const header = ["Cohort", "Size", "Conv%", ...Array.from({ length: maxAge + 1 }, (_, k) => `M${k}`)];
console.log("  " + header.map((h) => String(h).padStart(6)).join(""));
for (const c of cohortKeys) {
  const arr = cohorts[c];
  const conv = signupByMo[c] ? ((arr.length / signupByMo[c]) * 100).toFixed(0) + "%" : "—";
  const age = monthsBetween(endOfMonth(c), NOW);
  const row = [c, arr.length, conv];
  for (let k = 0; k <= maxAge; k++) {
    if (k > age) { row.push(""); continue; }
    const d = endOfMonth(monthKey(new Date(Date.UTC(+c.split("-")[0], +c.split("-")[1] - 1 + k, 1))));
    const alive = arr.filter((x) => aliveAt(x, d)).length;
    row.push(Math.round((alive / arr.length) * 100) + "%");
  }
  console.log("  " + row.map((v) => String(v).padStart(6)).join(""));
}

// ---- monthly net movement ----
console.log(`\nMonthly movement (new paid / churned / net):`);
const months = [...new Set(subs.map((x) => ym(x.created_at)))].sort();
const first = months[0];
const allMonths = [];
for (let d = new Date(first + "-01T00:00:00Z"); monthKey(d) <= monthKey(NOW); d.setUTCMonth(d.getUTCMonth() + 1)) allMonths.push(monthKey(d));
for (const m of allMonths) {
  const nw = subs.filter((x) => ym(x.created_at) === m).length;
  const ch = subs.filter((x) => { const c = churnDate(x); return c && ym(c.toISOString()) === m; }).length;
  console.log(`  ${m}:  +${nw}  -${ch}  = ${nw - ch >= 0 ? "+" : ""}${nw - ch}`);
}

console.log(`\nHeadline: launch cohort (${cohortKeys[0]}) retention vs post-launch — watch each cohort through its first Nov/Dec season-end.`);
