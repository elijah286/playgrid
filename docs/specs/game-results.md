# Game Results — v1 Spec

Status: **Draft, not started.** Gated behind beta flag `game_results` (off for everyone).

## Goal

Give coaches a per-playbook view of what happened in past games run via Game Mode: a chronological play-by-play and a per-play success summary. Forms the data foundation for future cross-game analytics and Coach AI RAG.

## Non-goals (v1)

- Cross-game / season-level aggregation
- Editing or deleting logged plays after the game ends
- Defensive context (coverage, front, personnel)
- Down-and-distance, field position, hash (capturable later if Game Mode adds optional fields)
- Sharing game results outside the coaching staff
- Video attachment

## Access

- Tab lives inside a single playbook, to the right of **Staff**.
- Visible only to **owner + editors** (coaches). Players (viewers) never see it.
- Gated behind beta flag `game_results` — gate the same way `game_mode` is gated in `src/app/(dashboard)/playbooks/[playbookId]/page.tsx`.

## Architecture context (game-mode rewrite)

Since this spec was first drafted, game-mode was rewritten as a multi-coach realtime live session:

- `game_sessions.status` ∈ `'active' | 'ended'` — Game Results only shows `'ended'`. Active sessions belong to Game Mode.
- `game_sessions.kind` ∈ `'game' | 'scrimmage'` — both shown in Results, with a kind toggle (All / Games / Scrimmages).
- `game_sessions.opponent`, `score_us`, `score_them` are written at session end by `endGameSessionAction`.
- `game_score_events` (added 0078) — per-event signed score deltas with optional `play_id` attribution. Used to render the live scoreboard and the Timeline (interleave score events between plays).
- `game_plays` is still the canonical called-plays log. `play_version_id` is still populated; we additionally write a frozen `snapshot` (see below) because version rows can be mutated.

## Data model

### Snapshot column on `game_plays`

`play_versions` rows are *almost* immutable but not strictly — `renamePlayAction` mutates `document.metadata.coachName` in place, and past migrations have backfilled fields. We can't rely on `play_version_id` as a frozen snapshot.

**Add a snapshot column written once at call time, never updated:**

```sql
ALTER TABLE game_plays
  ADD COLUMN snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;
```

Shape:

```json
{
  "snapshotVersion": 1,
  "play": { /* full PlayDocument as it existed at called_at; self-contained */ },
  "playName": "Power Right",
  "groupName": "Run Game"
}
```

`PlayDocument` already embeds the field, players, routes, and animation — no separate formation snapshot needed.

Keep existing `play_id` and `play_version_id` columns as **soft references** for "jump to this play in the playbook." Handle gracefully if the play was later deleted or renamed — the snapshot is the source of truth for rendering.

### Game-mode write path

When a play is logged in Game Mode (`saveGameSessionAction` in `src/app/actions/game-sessions.ts`), populate `snapshot` from the current `play_versions.document` plus the formation doc plus the play's `coachName` and group label. Once written, never update.

### Immutability

`game_plays` rows are write-once after the game ends. v1 has no edit/delete UI. (We may add a "delete game" admin escape hatch later, but not in v1.)

## UX

### Tab landing — game list

- One row per `game_sessions` row for this playbook **where `status = 'ended'`**, most recent first.
- Kind toggle at the top: **All** (default) / **Games** / **Scrimmages**.
- Columns: date, kind badge, opponent, our score – their score, # plays called, overall success %.
- "Success %" = `count(thumb='up') / count(*)` across that game's `game_plays`.
- Click a row → game detail.

### Empty state

When the playbook has no game sessions:

> No games yet. Run a game from Game Mode to see results here.
>
> [Open Game Mode] (CTA, links to `/playbooks/[id]/game`)

### Game detail page

Header: opponent, date, final score, total plays, overall success %.

Toggle between two views:

#### 1. Timeline (default)

Chronological feed interleaving **plays called** and **score events**, ordered by `called_at` / `created_at`. Two row kinds:

**Play call row:**
- Time (or quarter, if Game Mode adds it later)
- Mini play diagram rendered from `snapshot.play`
- Play name (from `snapshot.playName`)
- Thumb up / thumb down indicator
- Tag if present (yards, first_down, score, loss, flag, incomplete, fumble)

**Score event row:**
- Time
- Side + signed delta (e.g. "+6 us", "−2 them")
- Attribution (which coach tapped, via `created_by`)
- Linked play (if `play_id` present, link to the call row above)

#### 2. By Play

Grouped: one row per unique play that was called in this game.

- Play name + mini diagram (use the most recent snapshot in this game)
- `calls: 8 · success: 6 · 75%`
- Sortable by call count or success rate (toggle)

Different versions of the same play within a single game are still grouped under one play (use `play_id`). Show a small badge if multiple snapshots existed during the game (rare).

## Playbook duplication

- New owner-only setting on the playbook: **"Allow duplicating game results"** (default: off).
- When the playbook is duplicated:
  - If the setting is **off** → game data never copies (no prompt).
  - If the setting is **on** → prompt the duplicating user: "Copy game results too?" with default No.
- Implementation: extend `duplicatePlaybookAction` in `src/app/actions/playbooks.ts` and `copyPlaybookContents` in `src/lib/data/playbook-copy.ts`.

## Build order

1. Schema: add `game_plays.snapshot` column (migration).
2. Game Mode write path: populate `snapshot` on every call. (Backfill prior `game_plays` rows from current `play_versions.document` as a best-effort one-time migration — flag those rows as `snapshotVersion: 0` so we know they're approximations.)
3. Beta-flag plumbing: surface `game_results` availability to the playbook layout.
4. Tab + empty state.
5. Game list view.
6. Game detail — Timeline.
7. Game detail — By Play.
8. Duplication setting + prompt.

## Future (explicitly deferred)

- Cross-game / season aggregation tab at the playbook level
- Filtering by opponent, date range, situation
- Down-and-distance and field-position capture in Game Mode
- Drive grouping (inferred from `called_at` gaps or explicit markers)
- Coach AI RAG over the snapshot corpus
- Top-level "Games" view that spans playbooks
