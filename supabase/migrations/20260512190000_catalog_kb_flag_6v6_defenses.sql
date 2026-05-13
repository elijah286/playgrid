-- Companion to 0200_catalog_kb_seed.sql for the flag_6v6 variant launch.
--
-- 0200_catalog_kb_seed.sql is regenerated in full by scripts/build-catalog-kb.ts,
-- but supabase tracks migrations by version — re-applying 0200 against a
-- DB that's already recorded it is a no-op. This dated companion picks up
-- the four new flag_6v6 defensive-alignment chunks added in the same
-- commit and lands them on the live DB.
--
-- Idempotent: DELETE every catalog-derived flag_6v6 row first so a future
-- 0200 regen (on a fresh DB reset) doesn't double-insert when this also
-- runs in sequence.

delete from public.rag_documents
where source = 'catalog' and sport_variant = 'flag_6v6';

insert into public.rag_documents (
  scope, scope_id, topic, subtopic, title, content,
  sport_variant, sanctioning_body, source, source_note,
  authoritative, needs_review
) values
  ('global', null, 'scheme_defense', 'defense_6v6_man_cover_0_flag_6v6', 'Defense: 6v6 Man — Cover 0', '6v6 Cover 0 — every defender in pure man, no deep help. Edge rusher disrupts the QB; used to bait an aggressive throw or on critical down/distance.
Personnel: 6 defenders.
Coverage mode: man.
Assignment-based — defenders track receivers.', 'flag_6v6', null, 'catalog', 'Generated from src/domain/play/defensiveAlignments.ts (6v6 Man / Cover 0 / flag_6v6).', true, false),
  ('global', null, 'scheme_defense', 'defense_6v6_man_cover_1_flag_6v6', 'Defense: 6v6 Man — Cover 1', '6v6 man-free — four defenders in man on the four skill receivers, one free safety deep, edge rusher off the line.
Personnel: 6 defenders.
Coverage mode: man.
Zones: Deep middle (FS).', 'flag_6v6', null, 'catalog', 'Generated from src/domain/play/defensiveAlignments.ts (6v6 Man / Cover 1 / flag_6v6).', true, false),
  ('global', null, 'scheme_defense', 'defense_6v6_zone_cover_2_flag_6v6', 'Defense: 6v6 Zone — Cover 2', '6v6 Cover 2 — two safeties split the deep halves, three underneath in zones (two flats + a middle hook), edge rusher off the line.
Personnel: 6 defenders.
Coverage mode: zone.
Zones: Flat L, Hook M, Flat R, Deep 1/2 L, Deep 1/2 R.', 'flag_6v6', null, 'catalog', 'Generated from src/domain/play/defensiveAlignments.ts (6v6 Zone / Cover 2 / flag_6v6).', true, false),
  ('global', null, 'scheme_defense', 'defense_6v6_zone_cover_3_flag_6v6', 'Defense: 6v6 Zone — Cover 3', '6v6 zone shell — 3 deep (two corners + free safety), 2 underneath (flat/hook on each side), edge rusher off the line.
Personnel: 6 defenders.
Coverage mode: zone.
Zones: Flat L, Flat R, Deep 1/3 L, Deep 1/3 M, Deep 1/3 R.', 'flag_6v6', null, 'catalog', 'Generated from src/domain/play/defensiveAlignments.ts (6v6 Zone / Cover 3 / flag_6v6).', true, false)
;
