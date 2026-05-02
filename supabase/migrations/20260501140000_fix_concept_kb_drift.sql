-- Fix concept KB chunks that drifted from the typed concept catalog.
--
-- Production failures these address:
--
--   1. Curl-Flat: KB said "Outside WR runs a 12-yard curl" but the
--      catalog (CONCEPT_CATALOG.CURL_FLAT) requires curl at 4-7 yds.
--      Cal cited the KB and authored a 10-12yd curl; coach surfaced it
--      2026-05-02 as "this isn't a curl-flat, it's a curl + flat".
--
--   2. Smash: KB said corner at "10-12 yards" but the catalog
--      (CONCEPT_CATALOG.SMASH) requires corner at 12-18 yds. An 11-yd
--      corner passed the KB but the catalog's assertConcept rejected it
--      at chat time, producing confusing critique-and-re-emit loops.
--
-- Both updates pull the KB into agreement with the catalog (catalog is
-- the source of truth per AGENTS.md Rule 6 — KB direction of truth).

update public.rag_documents
set content = 'Outside WR runs a SHORT curl (~5 yds — settling at the soft spot just past the LBs), slot/RB runs a flat at 0-3 yds. High-low on the flat/curl defender. He sinks into the curl = hit flat; he widens to flat = hit curl. The curl MUST be short (4-7 yds) for this concept to work — a 10+yd curl puts the receiver behind the curl/flat defender''s drop and the read collapses. Reliable third-and-medium concept against any coverage with a defender in the curl-flat zone.',
    needs_review = false
where scope = 'global'
  and topic = 'scheme'
  and subtopic = 'concept_curl_flat';

update public.rag_documents
set content = 'Outside receiver runs a 5-yard hitch (low), inside receiver runs a corner route at 12-15 yards (high). High-low on the cornerback. CB jumps the hitch = throw the corner; CB sinks under the corner = throw the hitch. The corner MUST be at 12+ yds (catalog requires 12-18) — a shorter corner won''t clear the safety help over the top. Beats Cover 2 and any soft-corner technique.',
    needs_review = false
where scope = 'global'
  and topic = 'scheme'
  and subtopic = 'concept_smash';
