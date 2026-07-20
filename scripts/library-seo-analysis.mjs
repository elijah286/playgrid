// Library / Football-Library SEO analysis.
//
// Answers: are the /learn/library pages (entity pages AND the "collection"
// variant-rollup pages) actually earning organic traffic, engagement, and
// conversions since the library went public (2026-05-26)?
//
// The generic scripts/traffic-analysis.mjs reports the whole site; this one
// zooms into /learn* and buckets library URLs by type so we can see whether
// the *collection* pattern (variant rollups) pulls its weight vs individual
// entity pages — which is the core "should we build more collections?" question.
//
// Run where the prod service-role key lives (Railway shell, or local with
// .env.local sourced). Read-only; no writes.
//
//   DAYS=55 node scripts/library-seo-analysis.mjs
//
// Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// (DAYS defaults to 55 ≈ since the 2026-05-26 public launch.)

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error(
    'Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. ' +
      'Run this where the prod service-role key is available.',
  )
  process.exit(1)
}
const supabase = createClient(url, key)

const DAYS = Number(process.env.DAYS || 55)
const NOW = Date.now()
const SINCE = new Date(NOW - DAYS * 864e5).toISOString()
const PREV_SINCE = new Date(NOW - 2 * DAYS * 864e5).toISOString()

const pct = (n, d) => (d === 0 ? '—' : `${((n / d) * 100).toFixed(1)}%`)
const fmt = (n) => n.toLocaleString()
const ms = (m) => (m == null ? '—' : `${(m / 1000).toFixed(1)}s`)

async function fetchAll(table, columns, filter = (q) => q) {
  let all = []
  let from = 0
  const size = 1000
  while (true) {
    let q = supabase
      .from(table)
      .select(columns)
      .range(from, from + size - 1)
      .order('created_at', { ascending: false })
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

/** Bucket a library path into a type so we can compare collection pages
 *  (variant rollups) against entity pages against index/hub pages. */
function libraryBucket(path) {
  const p = (path || '').replace(/\?.*$/, '')
  if (!p.startsWith('/learn')) return null
  if (p === '/learn' || p === '/learn/library') return 'hub'
  if (p.startsWith('/learn/library/plays/variant/')) return 'collection: variant-rollup'
  if (/^\/learn\/library\/plays\/[^/]+\/[^/]+$/.test(p)) return 'entity: play (variant)'
  if (/^\/learn\/library\/plays\/[^/]+$/.test(p)) return 'entity: play (redirect)'
  if (p.startsWith('/learn/library/formations/')) return 'entity: formation'
  if (p.startsWith('/learn/library/routes/')) return 'entity: route'
  if (p.startsWith('/learn/library/defense/')) return 'entity: defense'
  if (p.startsWith('/learn/library/plays')) return 'index: plays'
  if (p.startsWith('/learn/library')) return 'index: other'
  if (p.startsWith('/learn/how-to')) return 'article: how-to guide'
  if (p.startsWith('/learn/using-xo')) return 'article: using-xo'
  return 'learn: other'
}

const isLibrary = (p) => (p || '').startsWith('/learn')
const stripQuery = (p) => (p || '').replace(/\?.*$/, '')

/** Classify a referrer host as an organic-search source. */
function refClass(referrer) {
  if (!referrer) return 'direct/none'
  let host
  try {
    host = new URL(referrer).hostname.replace(/^www\./, '')
  } catch {
    return 'other'
  }
  if (host.includes('xogridmaker') || host.includes('localhost')) return 'internal'
  if (/(^|\.)(google|bing|duckduckgo|ecosia|yahoo|yandex|baidu|brave)\./.test(host)) return `organic:${host}`
  if (/(facebook|instagram|t\.co|twitter|x\.com|reddit|youtube|linkedin|tiktok)/.test(host)) return `social:${host}`
  return `referral:${host}`
}

async function main() {
  console.log(`\n=== FOOTBALL-LIBRARY SEO ANALYSIS — last ${DAYS}d (vs prior ${DAYS}d) ===`)
  console.log(`Window: ${SINCE} → now\n`)

  // Fetch all page_views across both windows; filter in JS so we keep full
  // session context (needed for click-through from a library landing).
  console.log('Fetching page_views…')
  const pv = await fetchAll(
    'page_views',
    'session_id, path, referrer, country, device, is_bot, dwell_ms, is_exit, user_id, landing_path, created_at',
    (q) => q.gte('created_at', PREV_SINCE),
  )
  const curr = pv.filter((p) => p.created_at >= SINCE)
  const prior = pv.filter((p) => p.created_at < SINCE)
  const currReal = curr.filter((p) => !p.is_bot)
  const priorReal = prior.filter((p) => !p.is_bot)

  const libCurr = currReal.filter((p) => isLibrary(p.path))
  const libPrior = priorReal.filter((p) => isLibrary(p.path))
  const libBots = curr.filter((p) => p.is_bot && isLibrary(p.path))

  console.log('── Volume ──')
  console.log(`  site page_views (non-bot):      ${fmt(currReal.length)}  (prior ${fmt(priorReal.length)}, ${pct(currReal.length - priorReal.length, priorReal.length)})`)
  console.log(`  /learn page_views (non-bot):    ${fmt(libCurr.length)}  (prior ${fmt(libPrior.length)}, ${pct(libCurr.length - libPrior.length, libPrior.length)})`)
  console.log(`  /learn share of site traffic:   ${pct(libCurr.length, currReal.length)}`)
  console.log(`  /learn BOT hits (crawl proxy):  ${fmt(libBots.length)}\n`)

  // Sessions (non-bot, whole site) for landing + click-through analysis.
  const sessions = new Map()
  for (const p of currReal) {
    if (!p.session_id) continue
    if (!sessions.has(p.session_id)) sessions.set(p.session_id, [])
    sessions.get(p.session_id).push(p)
  }
  for (const s of sessions.values()) s.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

  // Sessions whose FIRST page is a /learn page = library landings (the SEO win).
  const libLandingSessions = [...sessions.values()].filter((s) => isLibrary(s[0].path))
  console.log('── Library as an entry point (organic SEO test) ──')
  console.log(`  sessions landing on /learn:     ${fmt(libLandingSessions.length)}  (${pct(libLandingSessions.length, sessions.size)} of all sessions)`)

  // Referrer class for those landings — how many came from organic search?
  const landRef = new Map()
  for (const s of libLandingSessions) {
    const c = refClass(s[0].referrer)
    landRef.set(c, (landRef.get(c) || 0) + 1)
  }
  const organicLandings = [...landRef.entries()]
    .filter(([k]) => k.startsWith('organic:'))
    .reduce((a, [, n]) => a + n, 0)
  console.log(`  …of which organic search:       ${fmt(organicLandings)}  (${pct(organicLandings, libLandingSessions.length)} of library landings)`)
  console.log('  landing referrer mix:')
  for (const [k, n] of [...landRef.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`    ${String(n).padStart(5)}  ${k}`)
  }

  // Click-through: of library-landing sessions, how many went deeper, reached
  // the editor/builder, or signed up in-session?
  let deeper = 0
  let reachedApp = 0
  const APP_HINT = /\/(plays|playbooks|teams|dashboard|home|new|builder|signup|login|editor)/
  for (const s of libLandingSessions) {
    if (s.length > 1) deeper++
    if (s.slice(1).some((p) => APP_HINT.test(stripQuery(p.path)))) reachedApp++
  }
  console.log('\n── Engagement from a library landing ──')
  console.log(`  went past the first page:       ${fmt(deeper)}  (${pct(deeper, libLandingSessions.length)})`)
  console.log(`  reached an app/editor/auth path:${fmt(reachedApp)}  (${pct(reachedApp, libLandingSessions.length)})`)

  // Per-bucket table.
  console.log('\n── /learn traffic by page type ──')
  const buckets = new Map()
  for (const p of libCurr) {
    const b = libraryBucket(p.path) || 'learn: other'
    if (!buckets.has(b)) buckets.set(b, { views: 0, dwell: 0, dwellN: 0, exits: 0 })
    const s = buckets.get(b)
    s.views++
    if (p.dwell_ms > 0) { s.dwell += p.dwell_ms; s.dwellN++ }
    if (p.is_exit) s.exits++
  }
  console.log(`  ${'views'.padStart(6)}  ${'dwell'.padStart(7)}  ${'exit%'.padStart(6)}  type`)
  for (const [b, s] of [...buckets.entries()].sort((a, b2) => b2[1].views - a[1].views)) {
    console.log(`  ${String(s.views).padStart(6)}  ${ms(s.dwell / Math.max(1, s.dwellN)).padStart(7)}  ${pct(s.exits, s.views).padStart(6)}  ${b}`)
  }

  // Top individual library pages.
  console.log('\n── Top individual /learn pages (by views) ──')
  const pageStats = new Map()
  for (const p of libCurr) {
    const k = stripQuery(p.path)
    if (!pageStats.has(k)) pageStats.set(k, { views: 0, dwell: 0, dwellN: 0 })
    const s = pageStats.get(k)
    s.views++
    if (p.dwell_ms > 0) { s.dwell += p.dwell_ms; s.dwellN++ }
  }
  console.log(`  ${'views'.padStart(6)}  ${'dwell'.padStart(7)}  path`)
  for (const [k, s] of [...pageStats.entries()].sort((a, b) => b[1].views - a[1].views).slice(0, 25)) {
    console.log(`  ${String(s.views).padStart(6)}  ${ms(s.dwell / Math.max(1, s.dwellN)).padStart(7)}  ${k}`)
  }

  // Conversion: signups whose first landing was a library page.
  console.log('\n── Conversion: signups first-landed on /learn ──')
  const profiles = await fetchAll(
    'profiles',
    'id, created_at, first_referrer, first_landing_path',
    (q) => q.gte('created_at', SINCE),
  )
  const libSignups = profiles.filter((p) => isLibrary(p.first_landing_path))
  console.log(`  signups in window:              ${fmt(profiles.length)}`)
  console.log(`  …first-landed on /learn:        ${fmt(libSignups.length)}  (${pct(libSignups.length, profiles.length)} of signups)`)
  const lp = new Map()
  for (const p of libSignups) {
    const k = stripQuery(p.first_landing_path)
    lp.set(k, (lp.get(k) || 0) + 1)
  }
  for (const [k, n] of [...lp.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`    ${String(n).padStart(3)}  ${k}`)
  }

  // In-app events fired ON library pages (install / try-in-builder / etc.).
  console.log('\n── ui_events fired on /learn pages ──')
  const ui = await fetchAll('ui_events', 'event_name, target, path, created_at', (q) => q.gte('created_at', SINCE))
  const libUi = ui.filter((e) => isLibrary(e.path))
  console.log(`  total ui_events on /learn:      ${fmt(libUi.length)}`)
  const ev = new Map()
  for (const e of libUi) ev.set(e.event_name, (ev.get(e.event_name) || 0) + 1)
  for (const [e, n] of [...ev.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
    console.log(`    ${String(n).padStart(5)}  ${e}`)
  }

  console.log('\nDone. Read: high organic-landing % + click-through = collections earn their keep → scale. Flat = fix discovery/entity depth first.')
}

main().catch((e) => { console.error(e); process.exit(1) })
