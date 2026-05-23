-- Coach AI KB — dedupe flag formation entries.
--
-- Companion to 20260523120000_seed_flag_formation_library.sql.
--
-- The seed migration assumed flag variants had only the entries listed in
-- 0199_seed_formation_gaps.sql (flag_5v5: trips; flag_7v7: spread + trips;
-- flag_6v6: nothing). In fact, an earlier seed pass (2026-04-27) had already
-- inserted shorter, less detailed entries for bunch/empty/stack in flag_5v5
-- and bunch/doubles/empty/stack/trips in flag_7v7. Inserting again without
-- ON CONFLICT created duplicate rows that Cal would retrieve in pairs.
--
-- Resolution: keep the NEWER rows (the 20260523120000 migration's content,
-- which is more comprehensive — multi-sentence prose with pairings, defense
-- responses, and variation notes), drop the older 1-sentence entries.
--
-- The IDs below were captured by querying for duplicates after the seed
-- migration ran; they target the OLDER entry in each (variant, subtopic)
-- pair. Revisions are cleaned up via FK cascade (or via an explicit DELETE
-- if no FK exists — covered by the second statement).

-- Delete revisions for the older duplicate rows first (no FK cascade
-- assumption — the revisions table doesn't reference rag_documents in
-- the prior migrations' schema definitions).
delete from public.rag_document_revisions
where document_id in (
  '3a52bb43-38c2-4fb8-b791-fcc94eedcf10', -- flag_5v5 formation_bunch (2026-04-27)
  '63d47603-54ce-4076-ad91-ea37c7201c72', -- flag_5v5 formation_empty (2026-04-27)
  'f700a5af-d8dd-4a59-86bb-b10f74034f34', -- flag_5v5 formation_stack (2026-04-27)
  'f63a8867-21da-4320-86c9-26c11b636dd3', -- flag_7v7 formation_bunch (2026-04-27)
  '25450e89-077b-43f5-84dc-7030e25b2c09', -- flag_7v7 formation_doubles (2026-04-27)
  '2b063648-f4b8-48ac-871d-85bd05ea2142', -- flag_7v7 formation_empty (2026-04-27)
  '1c1a330c-4ea8-44fe-ad38-9396af55c0bb', -- flag_7v7 formation_stack (2026-04-27)
  '120f9a4c-afcb-4962-8192-3ed60171cdb9'  -- flag_7v7 formation_trips (2026-04-27)
);

-- Delete the older duplicate rag_documents.
delete from public.rag_documents
where id in (
  '3a52bb43-38c2-4fb8-b791-fcc94eedcf10',
  '63d47603-54ce-4076-ad91-ea37c7201c72',
  'f700a5af-d8dd-4a59-86bb-b10f74034f34',
  'f63a8867-21da-4320-86c9-26c11b636dd3',
  '25450e89-077b-43f5-84dc-7030e25b2c09',
  '2b063648-f4b8-48ac-871d-85bd05ea2142',
  '1c1a330c-4ea8-44fe-ad38-9396af55c0bb',
  '120f9a4c-afcb-4962-8192-3ed60171cdb9'
);
