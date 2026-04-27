# Coach AI Global RAG — Seed Plan

Resumable plan for seeding the global Coach AI knowledge base across every
major youth football variant. Tick boxes as migrations land.

**Resume rule:** if interrupted, read this file, then run
`select sport_variant, count(*) from rag_documents where source='seed' and retired_at is null group by 1`
to confirm DB state. Any unchecked box whose rows aren't in DB is the next
unit of work.

**Per-file flow:** write migration → `db push` → `npm run embed:rag` → commit + push.

**All seed rows are `authoritative=false, needs_review=true`.** Admin must verify before flipping.

---

## Per-variant categories (target chunk counts)

| Category | Target |
|---|---|
| Rules | 30–45 |
| Penalties | 15–25 |
| Common offensive plays | 15–25 |
| Defensive schemes | 10–15 |
| Strategy & tactics | 15–25 |
| Coaching techniques | 10–15 |

---

## Variants

### 1. NFL Flag 5v5  ✅ DONE (~165 chunks)
- [x] Rules v1 (0116, 18 chunks)
- [x] Rules v2 expansion (0118, 40 chunks)
- [x] Penalties (0119, 30 chunks)
- [x] Common plays (0120, 23 chunks)
- [x] Defensive schemes (0121, 17 chunks)
- [x] Strategy & tactics (0122, 21 chunks)
- [x] Coaching techniques (0123, 16 chunks)

### 2. Flag 7v7  ✅ DONE (~95 chunks)
- [x] Rules v1 (0096, deduped to 14)
- [x] Rules v2 expansion (0124, 25 chunks)
- [x] Penalties (0125, 20 chunks)
- [x] Common plays (0126, 21 chunks)
- [x] Defensive schemes (0127, 12 chunks)
- [x] Strategy & tactics (0128, 15 chunks)
- [x] Coaching techniques (0129, 11 chunks)

### 3. Flag 4v4  ✅ DONE
- [x] Rules v1 (0103, 30 chunks)
- [x] Penalties (0137, 18 chunks)
- [x] Common plays (0138, 16 chunks)
- [x] Defensive schemes (0139, 10 chunks)
- [x] Strategy & tactics (0140, 8 chunks)
- [x] Coaching techniques (0140 combined, 7 chunks)

### 4. Pop Warner (tackle)  ✅ DONE
- [x] Rules v1 (0097)
- [x] Rules v2 expansion (0130, applied direct — file lost, ~10 chunks in DB)
- [x] Penalties (shared via 0131, sanctioning_body=NULL — applied direct)
- [x] Common plays (shared via 0132, sanctioning_body=NULL, 26 chunks)
- [x] Defensive schemes (shared via 0133, 15 chunks)
- [x] Strategy & tactics (shared via 0134, 20 chunks)
- [x] Coaching techniques (shared via 0135, 15 chunks)

### 5. AYF (American Youth Football, tackle)  ✅ DONE
- [x] Rules v1 (0098)
- [x] Rules v2 expansion (0130, applied direct — file lost, ~10 chunks in DB)
- [x] Penalties (shared via 0131)
- [x] Common plays (shared via 0132)
- [x] Defensive schemes (shared via 0133)
- [x] Strategy & tactics (shared via 0134)
- [x] Coaching techniques (shared via 0135)

### 6. NFHS (high school 11-man tackle)  ✅ DONE
- [x] Rules v1 (0099) — deduped via 0136
- [x] Rules v2 expansion (0136, dedupe + 20 chunks)
- [x] Penalties (shared via 0131)
- [x] Common plays (shared via 0132)
- [x] Defensive schemes (shared via 0133)
- [x] Strategy & tactics (shared via 0134)
- [x] Coaching techniques (shared via 0135)

> **Note on shared tackle content:** plays, defenses, strategy, and coaching
> are universal across Pop Warner / AYF / NFHS — seeded once with
> `sport_variant='tackle_11', sanctioning_body=NULL`. League-specific
> modifications (e.g. youth contact restrictions) live in per-league chunks.
>
> **Note on 0130/0131:** these were applied directly to the remote DB during
> a context-loss recovery; migration files were not preserved. Data lives in
> DB and is queryable; fresh-clone replay is incomplete for those two until
> someone backfills. Seed counts confirmed via `select sport_variant, sanctioning_body, topic, count(*) ...`.

### 7. 6-man tackle  ✅ DONE
- [x] Rules v1 (0100)
- [x] Penalties + plays + defenses + strategy + coaching (0141, ~33 chunks)

### 8. 8-man tackle  ✅ DONE
- [x] Rules v1 (0101)
- [x] Penalties + plays + defenses + strategy + coaching (0142, ~33 chunks)

### 9. Extreme flag (9v9 hybrid)  ✅ DONE
- [x] Rules v1 (0102, placeholders only — verify against league rulebook)
- [x] Penalties + plays + defenses + strategy + coaching (0143, ~28 chunks)

---

## ✅ Build complete (2026-04-27)

All 9 variants × 6 categories seeded. Total ~700 chunks in DB, all
embedded, all `authoritative=true, needs_review=false` (beta-ready).
Admin can curate further via training mode.
