# App Store Connect listing — XO Gridmaker

Field-by-field copy for the iOS App Store submission. Every field has a
character cap; counts shown as `(N/MAX)`. Paste each block directly into
App Store Connect.

---

## App Information

**Name** (30 chars max)
```
XO Gridmaker
```
(12/30)

**Subtitle** (30 chars max)
```
Football playbook designer
```
(26/30)

**Bundle ID**: `com.xogridmaker.app`

**Primary Category**: Sports
**Secondary Category**: Productivity

**Content Rights**: Does not contain, show, or access third-party content.

**Age Rating**: 4+ (no objectionable content)

---

## Pricing & Availability

**Price**: Free
**Availability**: All territories
**Pre-order**: No

**In-app purchases**: None.

XO Gridmaker is submitted under the **Multiplatform Services** model
(Guideline 3.1.3(b)). The iOS app is fully free: it does not contain
StoreKit products, subscription paywalls, or any UI that prompts the
user to upgrade. Paid functionality exists outside the App Store
ecosystem on the web product, but the iOS shell does not link to,
mention, or steer users toward those purchase methods.

If a user signs in on iOS with an account that already has a paid
entitlement (acquired on the web), the iOS shell reads that
entitlement from our server and unlocks the corresponding features
silently — no in-app upgrade flow is exposed either way.

---

## App Privacy ("nutrition label")

Use these answers when filling out App Privacy in App Store Connect.

### Data linked to user identity

| Data Type | Used For | Why |
|---|---|---|
| Email Address | App Functionality, Account Management | Account creation, login, team invites |
| Name | App Functionality | Display name on plays, invites |
| User Content (text, photos) | App Functionality | Playbook content (plays, formations, notes, team logos) |
| Coarse Location | App Functionality | Optional venue tagging on game sessions |
| Precise Location | App Functionality | Optional venue tagging on game sessions |
| Crash Data | App Functionality | Diagnose crashes |
| Performance Data | App Functionality | Diagnose performance issues |
| Other Diagnostic Data | App Functionality | Server-side error tracking |

### Data not collected
- Health & Fitness
- Financial Info
- Contacts
- Browsing History
- Search History
- Sensitive Info
- Purchases (no IAP; the app does not collect or transmit any
  purchase-related data)
- Audio Data
- Gameplay Content (in the Game Center sense — N/A)

### Tracking
**Does the app track users for advertising or analytics across other companies' apps/websites?** No.

---

## Description (4000 chars max)

```
XO Gridmaker is the playbook designer for football coaches who'd rather
spend their week on Xs and Os than wrestling with PowerPoint.

Build plays in seconds. Drag players, draw routes, swap formations,
animate the motion. Every change saves automatically and syncs to every
device on your team.

Built for the sideline:
• Download any playbook for offline use — no signal, no problem
• Game Mode keeps the screen awake and one-tap-calls plays
• Tag wins and losses against each play to learn what works
• Optional GPS venue tagging on every game

Built for your team:
• Invite assistant coaches and players via link, QR, or email
• Per-player wristband sheets you can print or wear
• Real-time sync across phones, tablets, and laptops
• Public example playbooks if you're just starting out

Built for the season:
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

## Promotional Text (170 chars max — editable without resubmitting)

```
Now with offline downloads — drop into any field with no signal and your
full playbook is waiting on your phone.
```
(135/170)

---

## Keywords (100 chars max, comma-separated)

```
football,playbook,coach,plays,routes,formations,7v7,flag,wristband,offense,defense,scheme,sideline
```
(99/100)

---

## Support URL
```
https://www.xogridmaker.com/contact
```

## Support email
```
admin@xogridmaker.com
```

## Marketing URL (optional)
```
https://www.xogridmaker.com
```

## Privacy Policy URL
```
https://www.xogridmaker.com/privacy
```

---

## Version Information

**What's New in This Version** (4000 chars max)
```
First release on the App Store.

XO Gridmaker is the playbook designer for football coaches — build
plays, share them with your team, and call them on the sideline.

This release includes:
• Offline playbook downloads for sideline use without signal
• Game Mode with screen-keep-awake and play-call tracking
• Optional GPS venue tagging on game sessions
• Native share sheet for invite links
```

---

## Review Notes (for the Apple reviewer)

**Demo account** (create one before submitting):
```
Email: admin@xogridmaker.com
Password: [generate; rotate after approval]
```

**Notes for the reviewer**:
```
XO Gridmaker is a playbook design tool for football coaches.

Business model: this is a free app submitted under Guideline 3.1.3(b)
(Multiplatform Services). The app contains no in-app purchases and no
upgrade flow — the iOS shell does not prompt for, link to, or mention
any external purchase path. Paid features exist on our web product
(xogridmaker.com), but the iOS app does not direct users there. If a
user signs in on iOS with an account that already has a paid
entitlement, the corresponding features unlock automatically; if they
sign in with a free account, the free Solo Coach plan is fully
functional and there is no upsell.

To exercise the native-only features:

1. Sign in with the demo account above. The home screen shows several
   example playbooks already loaded.
2. Open any playbook. Tap the menu (⋮) in the header and choose
   "Download for offline." A toast confirms when complete.
3. Tap the floating "Offline" pill at the bottom-left to open the
   downloaded playbooks library. Open one — you can browse plays and
   play their motion animation with no network.
4. From a playbook, tap "Game Mode" (Sport icon in the header on
   playbooks the demo account is enrolled in). The app will request
   location permission for optional venue tagging — declining is
   supported and the session works either way. The screen stays awake
   for the duration of the session.
5. From a playbook, tap "Share" → "Copy link." On native, this opens
   the iOS share sheet (iMessage, Mail, AirDrop) instead of the
   clipboard.

Location permission is requested only inside Game Mode and is purely
optional. Coaches who decline still get a fully working game session.
```

---

## Submission checklist

- [ ] Bundle version + marketing version bumped in Xcode
- [ ] App icon 1024×1024 attached in App Store Connect
- [ ] All five required screenshot sizes uploaded (see SCREENSHOTS.md)
- [ ] Privacy nutrition label filled per "App Privacy" section above
- [ ] Demo account credentials valid and tested from a fresh install
- [ ] Export compliance: "Uses standard encryption only (HTTPS)" → exempt
- [ ] Native shell audited for any UI that mentions subscriptions,
      upgrades, or external purchase methods (3.1.3(b) compliance)
