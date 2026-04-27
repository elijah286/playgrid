# Coach AI Global RAG — Seed Plan

Resumable plan for seeding the global Coach AI knowledge base across every
major youth football variant. Tick boxes as migrations land.

**Resume rule:** if interrupted, read this file, then run
`select sport_variant, count(*) from rag_documents where source='seed' group by 1`
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

### 1. NFL Flag 5v5
- [x] Rules v1 (0116, 18 chunks — kept for history)
- [ ] Rules v2 expansion (0118, ~40 chunks)
- [x] Penalties (0119, 30 chunks)
- [x] Common plays (0120, 23 chunks)
- [x] Defensive schemes (0121, 17 chunks)
- [ ] Strategy & tactics (0122)
- [ ] Coaching techniques (0123)

### 2. Flag 7v7
- [x] Rules v1 (0096, 28 chunks)
- [ ] Rules v2 expansion
- [ ] Penalties
- [ ] Common plays
- [ ] Defensive schemes
- [ ] Strategy & tactics
- [ ] Coaching techniques

### 3. Flag 4v4
- [x] Rules v1 (0103, 30 chunks)
- [ ] Penalties
- [ ] Common plays
- [ ] Defensive schemes
- [ ] Strategy & tactics
- [ ] Coaching techniques

### 4. Pop Warner (tackle)
- [x] Rules v1 (0097)
- [ ] Rules v2 expansion
- [ ] Penalties
- [ ] Common plays
- [ ] Defensive schemes
- [ ] Strategy & tactics
- [ ] Coaching techniques

### 5. AYF (American Youth Football, tackle)
- [x] Rules v1 (0098)
- [ ] Rules v2 expansion
- [ ] Penalties
- [ ] Common plays
- [ ] Defensive schemes
- [ ] Strategy & tactics
- [ ] Coaching techniques

### 6. NFHS (high school 11-man tackle)
- [x] Rules v1 (0099)
- [ ] Rules v2 expansion
- [ ] Penalties
- [ ] Common plays
- [ ] Defensive schemes
- [ ] Strategy & tactics
- [ ] Coaching techniques

### 7. 6-man tackle
- [x] Rules v1 (0100)
- [ ] Rules v2 expansion
- [ ] Penalties
- [ ] Common plays
- [ ] Defensive schemes
- [ ] Strategy & tactics
- [ ] Coaching techniques

### 8. 8-man tackle
- [x] Rules v1 (0101)
- [ ] Rules v2 expansion
- [ ] Penalties
- [ ] Common plays
- [ ] Defensive schemes
- [ ] Strategy & tactics
- [ ] Coaching techniques

### 9. Extreme flag (9v9 hybrid)
- [x] Rules v1 (0102)
- [ ] Penalties
- [ ] Common plays
- [ ] Defensive schemes
- [ ] Strategy & tactics
- [ ] Coaching techniques
