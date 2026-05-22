import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

const DAYS = Number(process.env.DAYS || 30)
const NOW = Date.now()
const SINCE = new Date(NOW - DAYS * 24 * 60 * 60 * 1000).toISOString()
const PREV_SINCE = new Date(NOW - 2 * DAYS * 24 * 60 * 60 * 1000).toISOString()

async function fetchAll(table, columns, filter = (q) => q) {
  let all = []
  let from = 0
  const size = 1000
  while (true) {
    let q = supabase.from(table).select(columns).range(from, from + size - 1).order('created_at', { ascending: false })
    q = filter(q)
    const { data, error } = await q
    if (error) {
      console.error(`${table} error:`, error.message)
      return all
    }
    if (!data || data.length === 0) break
    all = all.concat(data)
    if (data.length < size) break
    from += size
  }
  return all
}

const pct = (n, d) => (d === 0 ? '—' : `${((n / d) * 100).toFixed(1)}%`)
const fmt = (n) => n.toLocaleString()
const ms = (m) => (m == null ? '—' : `${(m / 1000).toFixed(1)}s`)

function normalizePath(p) {
  if (!p) return '(unknown)'
  // collapse dynamic segments: /plays/<uuid>, /v/<token>, /copy/<token>, /share/<token>
  return p
    .replace(/\/plays\/[^/]+\/edit/g, '/plays/[id]/edit')
    .replace(/\/plays\/[^/]+$/g, '/plays/[id]')
    .replace(/\/playbooks\/[^/]+/g, '/playbooks/[id]')
    .replace(/\/teams\/[^/]+/g, '/teams/[id]')
    .replace(/\/v\/[^/]+/g, '/v/[token]')
    .replace(/\/copy\/[^/]+/g, '/copy/[token]')
    .replace(/\/share\/[^/]+/g, '/share/[token]')
    .replace(/\/o\/[^/]+/g, '/o/[slug]')
    .replace(/\?.*$/, '')
}

async function main() {
  console.log(`\n=== TRAFFIC ANALYSIS — last ${DAYS} days (vs prior ${DAYS}) ===`)
  console.log(`Window: ${SINCE} → now\n`)

  // ─────────────────────────────────────────────────────────────
  // 1. Page views
  // ─────────────────────────────────────────────────────────────
  console.log('Fetching page_views…')
  const pageViews = await fetchAll(
    'page_views',
    'id, session_id, path, referrer, utm_source, utm_medium, utm_campaign, country, device, is_bot, dwell_ms, is_exit, user_id, share_token, landing_path, created_at',
    (q) => q.gte('created_at', PREV_SINCE),
  )
  const pvCurrent = pageViews.filter((p) => p.created_at >= SINCE)
  const pvPrior = pageViews.filter((p) => p.created_at < SINCE)
  const real = pvCurrent.filter((p) => !p.is_bot)
  const realPrior = pvPrior.filter((p) => !p.is_bot)

  console.log(`  total page_views (curr): ${fmt(pvCurrent.length)} (${fmt(real.length)} non-bot)`)
  console.log(`  total page_views (prior): ${fmt(pvPrior.length)} (${fmt(realPrior.length)} non-bot)`)
  console.log(`  change: ${pct(real.length - realPrior.length, realPrior.length)}\n`)

  // ─────────────────────────────────────────────────────────────
  // 2. Sessions
  // ─────────────────────────────────────────────────────────────
  const sessionsCurr = new Map()
  for (const pv of real) {
    if (!pv.session_id) continue
    if (!sessionsCurr.has(pv.session_id)) sessionsCurr.set(pv.session_id, [])
    sessionsCurr.get(pv.session_id).push(pv)
  }
  const sessionCount = sessionsCurr.size
  let bounced = 0
  let totalDwell = 0
  let dwellCount = 0
  for (const sess of sessionsCurr.values()) {
    if (sess.length === 1) bounced++
    for (const pv of sess) {
      if (pv.dwell_ms != null && pv.dwell_ms > 0) {
        totalDwell += pv.dwell_ms
        dwellCount++
      }
    }
  }
  console.log(`Sessions: ${fmt(sessionCount)}  bounce: ${pct(bounced, sessionCount)}  avg dwell: ${ms(totalDwell / Math.max(1, dwellCount))}\n`)

  // ─────────────────────────────────────────────────────────────
  // 3. Top entry pages (first page of each session)
  // ─────────────────────────────────────────────────────────────
  const entryPaths = new Map()
  for (const sess of sessionsCurr.values()) {
    sess.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    const entry = normalizePath(sess[0].path)
    entryPaths.set(entry, (entryPaths.get(entry) || 0) + 1)
  }
  console.log('Top entry pages:')
  const entryTop = [...entryPaths.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)
  for (const [path, n] of entryTop) {
    console.log(`  ${String(n).padStart(5)}  ${path}`)
  }

  // ─────────────────────────────────────────────────────────────
  // 4. Top paths overall + dwell + exit rate
  // ─────────────────────────────────────────────────────────────
  console.log('\nTop pages (volume, dwell, exit-rate, bounce-from):')
  const pathStats = new Map()
  for (const pv of real) {
    const k = normalizePath(pv.path)
    if (!pathStats.has(k)) pathStats.set(k, { views: 0, dwell: 0, dwellN: 0, exits: 0, bouncesFrom: 0 })
    const s = pathStats.get(k)
    s.views++
    if (pv.dwell_ms != null && pv.dwell_ms > 0) {
      s.dwell += pv.dwell_ms
      s.dwellN++
    }
    if (pv.is_exit) s.exits++
  }
  // Bounce-from: this path was the first AND only page of a session
  for (const sess of sessionsCurr.values()) {
    if (sess.length === 1) {
      const k = normalizePath(sess[0].path)
      const s = pathStats.get(k)
      if (s) s.bouncesFrom++
    }
  }
  const topPaths = [...pathStats.entries()].sort((a, b) => b[1].views - a[1].views).slice(0, 20)
  console.log(`  ${'views'.padStart(6)}  ${'dwell'.padStart(7)}  ${'exit%'.padStart(6)}  ${'bnc%'.padStart(6)}  path`)
  for (const [path, s] of topPaths) {
    console.log(
      `  ${String(s.views).padStart(6)}  ${ms(s.dwell / Math.max(1, s.dwellN)).padStart(7)}  ${pct(s.exits, s.views).padStart(6)}  ${pct(s.bouncesFrom, s.views).padStart(6)}  ${path}`,
    )
  }

  // ─────────────────────────────────────────────────────────────
  // 5. Top exit pages (where do people leave?)
  // ─────────────────────────────────────────────────────────────
  console.log('\nTop exit pages (where sessions end):')
  const exits = new Map()
  for (const pv of real) {
    if (!pv.is_exit) continue
    const k = normalizePath(pv.path)
    exits.set(k, (exits.get(k) || 0) + 1)
  }
  const exitTop = [...exits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)
  for (const [path, n] of exitTop) {
    console.log(`  ${String(n).padStart(5)}  ${path}`)
  }

  // ─────────────────────────────────────────────────────────────
  // 6. Top referrers + UTM sources
  // ─────────────────────────────────────────────────────────────
  console.log('\nTop referrers (non-self):')
  const refs = new Map()
  for (const pv of real) {
    if (!pv.referrer) continue
    let host
    try {
      host = new URL(pv.referrer).hostname.replace(/^www\./, '')
    } catch {
      host = pv.referrer.slice(0, 40)
    }
    if (host.includes('xogridmaker') || host.includes('localhost')) continue
    refs.set(host, (refs.get(host) || 0) + 1)
  }
  const refTop = [...refs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
  for (const [host, n] of refTop) console.log(`  ${String(n).padStart(5)}  ${host}`)

  console.log('\nTop UTM sources:')
  const utm = new Map()
  for (const pv of real) {
    if (!pv.utm_source) continue
    const k = `${pv.utm_source}/${pv.utm_medium || '-'}/${pv.utm_campaign || '-'}`
    utm.set(k, (utm.get(k) || 0) + 1)
  }
  const utmTop = [...utm.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
  for (const [k, n] of utmTop) console.log(`  ${String(n).padStart(5)}  ${k}`)

  // ─────────────────────────────────────────────────────────────
  // 7. Device + country mix
  // ─────────────────────────────────────────────────────────────
  console.log('\nDevice mix:')
  const dev = new Map()
  for (const pv of real) dev.set(pv.device || 'unknown', (dev.get(pv.device || 'unknown') || 0) + 1)
  for (const [d, n] of [...dev.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(5)}  ${d}  (${pct(n, real.length)})`)
  }

  console.log('\nTop countries:')
  const ctry = new Map()
  for (const pv of real) ctry.set(pv.country || 'unknown', (ctry.get(pv.country || 'unknown') || 0) + 1)
  for (const [c, n] of [...ctry.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`  ${String(n).padStart(5)}  ${c}  (${pct(n, real.length)})`)
  }

  // ─────────────────────────────────────────────────────────────
  // 8. Conversion: visits → signups
  // ─────────────────────────────────────────────────────────────
  console.log('\n=== CONVERSION FUNNEL ===\n')
  const profiles = await fetchAll(
    'profiles',
    'id, created_at, first_utm_source, first_utm_medium, first_utm_campaign, first_referrer, first_landing_path',
    (q) => q.gte('created_at', PREV_SINCE),
  )
  const profCurr = profiles.filter((p) => p.created_at >= SINCE)
  const profPrior = profiles.filter((p) => p.created_at < SINCE)
  const uniqueVisitors = new Set(real.map((p) => p.session_id)).size
  console.log(`Visitors (sessions): ${fmt(uniqueVisitors)}`)
  console.log(`Signups (curr ${DAYS}d): ${fmt(profCurr.length)}  →  ${pct(profCurr.length, uniqueVisitors)} visit→signup`)
  console.log(`Signups (prior ${DAYS}d): ${fmt(profPrior.length)}  →  change: ${pct(profCurr.length - profPrior.length, profPrior.length)}\n`)

  console.log('Signup source mix (first-touch):')
  const srcMix = new Map()
  for (const p of profCurr) {
    let src = 'direct/unknown'
    if (p.first_utm_source) src = `${p.first_utm_source}/${p.first_utm_medium || '-'}`
    else if (p.first_referrer) {
      try {
        src = `ref:${new URL(p.first_referrer).hostname.replace(/^www\./, '')}`
      } catch {
        src = `ref:${p.first_referrer.slice(0, 30)}`
      }
    }
    srcMix.set(src, (srcMix.get(src) || 0) + 1)
  }
  for (const [k, n] of [...srcMix.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`  ${String(n).padStart(3)}  ${k}`)
  }

  console.log('\nSignup landing paths:')
  const lpMix = new Map()
  for (const p of profCurr) {
    const k = normalizePath(p.first_landing_path || '(none)')
    lpMix.set(k, (lpMix.get(k) || 0) + 1)
  }
  for (const [k, n] of [...lpMix.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`  ${String(n).padStart(3)}  ${k}`)
  }

  // ─────────────────────────────────────────────────────────────
  // 9. UI events — funnel through key actions
  // ─────────────────────────────────────────────────────────────
  console.log('\n=== IN-APP FUNNEL (ui_events, last 30d) ===\n')
  const uiEvents = await fetchAll('ui_events', 'event_name, target, user_id, session_id, path, created_at', (q) =>
    q.gte('created_at', SINCE),
  )
  console.log(`Total ui_events: ${fmt(uiEvents.length)}`)
  const eventCounts = new Map()
  for (const e of uiEvents) eventCounts.set(e.event_name, (eventCounts.get(e.event_name) || 0) + 1)
  console.log('Top events:')
  for (const [e, n] of [...eventCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
    console.log(`  ${String(n).padStart(6)}  ${e}`)
  }

  // ─────────────────────────────────────────────────────────────
  // 10. Drop-off candidates: pages with high views + high exit rate + low dwell
  // ─────────────────────────────────────────────────────────────
  console.log('\n=== DROP-OFF CANDIDATES (high views, high exit rate, low dwell) ===\n')
  const candidates = [...pathStats.entries()]
    .filter(([_, s]) => s.views >= 20)
    .map(([path, s]) => ({
      path,
      views: s.views,
      avgDwell: s.dwell / Math.max(1, s.dwellN),
      exitRate: s.exits / s.views,
      bounceRate: s.bouncesFrom / s.views,
    }))
    .sort((a, b) => b.views * b.exitRate - a.views * a.exitRate)
    .slice(0, 12)

  console.log(`  ${'views'.padStart(6)}  ${'exit%'.padStart(6)}  ${'bnc%'.padStart(6)}  ${'dwell'.padStart(7)}  path`)
  for (const c of candidates) {
    console.log(
      `  ${String(c.views).padStart(6)}  ${pct(c.exits || c.exitRate * c.views, c.views).padStart(6)}  ${pct(c.bounceRate * c.views, c.views).padStart(6)}  ${ms(c.avgDwell).padStart(7)}  ${c.path}`,
    )
  }

  console.log('\nDone.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
