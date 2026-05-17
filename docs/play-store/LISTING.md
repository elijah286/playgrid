# Google Play Console listing — XO Gridmaker

Field-by-field copy for the Android Play Store submission.

---

## Store presence

**App name** (30 chars max)
```
XO Gridmaker
```

**Short description** (80 chars max)
```
Football playbook designer. Build plays, share with your team, call from the sideline.
```
(85 — trim)

Use instead:
```
Football playbook designer. Build, share, and call plays from the sideline.
```
(73/80)

**Full description** (4000 chars max)
```
XO Gridmaker is the playbook designer for football coaches who'd rather
spend their week on Xs and Os than wrestling with PowerPoint.

Build plays in seconds. Drag players, draw routes, swap formations,
animate the motion. Every change saves automatically and syncs to every
device on your team.

BUILT FOR THE SIDELINE
• Download any playbook for offline use — no signal, no problem
• Game Mode keeps the screen awake and one-tap-calls plays
• Tag wins and losses against each play to learn what works
• Optional GPS venue tagging on every game

BUILT FOR YOUR TEAM
• Invite assistant coaches and players via link, QR, or email
• Per-player wristband sheets you can print or wear
• Real-time sync across phones, tablets, and laptops
• Public example playbooks if you're just starting out

BUILT FOR THE SEASON
• Version history on every play — undo a bad idea instantly
• Print or export your full book as a study sheet or wristband
• Schedule games, capture film links, review what you ran

Coaches in 7v7 flag, 11-man tackle, and youth leagues use XO Gridmaker
to ship their playbook faster and call better games. Free to try,
upgrade to Coach or Team when you're ready to bring the rest of the
staff in.

Sign up at xogridmaker.com or download the app and start your first
play in under a minute.
```

---

## Categorization

**App category**: Sports
**Tags** (up to 5): Football, Sports Coaching, Productivity, Sports News, Sports Games

**Content rating**: Everyone (complete IARC questionnaire — no violence, no language, no user-generated content shown publicly without moderation)

---

## Contact details

**Email**: admin@xogridmaker.com
**Website**: https://www.xogridmaker.com
**Phone** (optional, recommended): your business phone

---

## Privacy policy URL
```
https://www.xogridmaker.com/privacy
```

---

## Data safety form

### Data collected and shared

Scoped to the **Android app** (native Capacitor build). Some web-only data
flows do not apply here — see "Web-only data flows (NOT in Play Data Safety)"
below.

| Data Type | Collected? | Shared? | Required/Optional | Purpose |
|---|---|---|---|---|
| Email address | Yes | No | Required | Account management, communications |
| Name | Yes | No | Optional | App functionality (display name) |
| User photos | Yes | No | Optional | App functionality (team logos) |
| Other user-generated content | Yes | No | Required | App functionality (playbooks, plays, notes) |
| Other in-app messages | Yes | No | Optional | App functionality (team chat per playbook) |
| Calendar events | Yes | No | Optional | App functionality (game/practice schedule) |
| Precise location | Yes | No | Optional | App functionality (Game Mode venue tagging, calendar venue) |

### Categories explicitly NOT collected on Android (leave unchecked)

- Audio files — app has no audio capture / recording
- Files and docs — app does not access user files outside its own data
- Contacts — app does not read device address book; team invites are by email/link only
- Web browsing — app is not a browser; no URL history tracked
- App info and performance (crash logs / diagnostics / other perf) — Sentry is
  initialized only when `!isNativeApp()` per `sentry.client.config.ts`. Native
  app installs collect no crash or diagnostic data through XO Gridmaker; any
  crash signals Google Play surfaces in Android Vitals are Play-side, not
  developer-collected.
- Device or other IDs — `deviceId` in the codebase is a server-set HTTP-only
  session cookie (random UUID), not an Android Advertising ID or hardware
  identifier; cookie session IDs do not count as Device IDs in Data Safety.
- Approximate location — IP-derived city/region attribution runs server-side
  only on web visits via MaxMind GeoLite2. Native app sessions do not pass
  through that path.

### Web-only data flows (NOT in Play Data Safety)

These are disclosed in the public Privacy Policy but are not part of the
Android Data Safety form because they do not occur in the native app:

- **Crash & error reports (Sentry, web only)** — `sentry.client.config.ts`
  skips init when `isNativeApp()` is true. Web users' browser errors are sent
  to Sentry; native app users' are not.
- **Approximate location (web only)** — derived server-side from IP via the
  local MaxMind GeoLite2 database; used for marketing attribution. Native
  sessions are not subject to this lookup.
- **Product-usage analytics (web only)** — page paths, UTM parameters,
  ad-platform click IDs, session timing. Per the privacy policy:
  *"Inside the iOS / Android app: product-usage and error reporting are
  turned off entirely."*

### Security practices

- Data encrypted in transit (HTTPS only)
- Data encrypted at rest
- Users can request deletion via in-app settings → Account → Delete account
- App follows Google Play Families Policy: No (app is not family-targeted)

---

## Target audience and content

**Target age**: 13+ (coaches, athletes 13+, parents)
**Appeals to children**: No

**Ads**: No
**In-app purchases**: Yes (subscriptions only — Coach, Team)

---

## Government apps / News apps / COVID-19 apps: N/A

---

## Release notes (500 chars max)

```
First release. Build, share, and call football plays from your phone.
Includes offline playbook download, screen-awake Game Mode, optional
GPS venue tagging, and native share sheet for team invites.
```
(228/500)

---

## Reviewer notes (Play Console "App content" → "Reviewer info")

**Demo account**:
```
Email: admin@xogridmaker.com
Password: [generate; rotate after approval]
```

**Notes**:
```
1. Sign in with demo account; example playbooks are pre-loaded.
2. Open a playbook → menu (⋮) → "Download for offline." Confirm via
   the toast. The "Offline" pill at the bottom-left opens the
   downloaded library.
3. Game Mode (sport icon in playbook header) requests location for
   optional venue tagging. Declining is supported.
4. Share → Copy link opens the Android share sheet on native.

Location is requested only inside Game Mode and is optional.
```

---

## Closed testing (Personal accounts only)

Google now requires Personal-account developers to:
1. Create a closed testing track
2. Recruit at least 12 testers (target 20)
3. Run for 14 days continuously before promoting to production

If signed up as Organization, this requirement is waived.

**Tester recruitment plan** (Personal-account fallback):
- Post in r/footballcoaches and r/CFB coaches threads
- Email existing xogridmaker.com beta-list signups
- Personal asks to ~5 coaches you know directly

---

## Submission checklist

- [ ] App bundle (.aab) signed with upload key
- [ ] Upload key backed up to password manager
- [ ] Screenshots uploaded for phone (minimum 2, max 8)
- [ ] Tablet screenshots uploaded if targeting tablets (recommended)
- [ ] Feature graphic uploaded (1024×500)
- [ ] App icon uploaded (512×512)
- [ ] Content rating questionnaire completed
- [ ] Data safety form completed and matches privacy policy
- [ ] Target audience set
- [ ] Privacy policy URL live and accessible
- [ ] If Personal account: closed testing track running ≥14 days
