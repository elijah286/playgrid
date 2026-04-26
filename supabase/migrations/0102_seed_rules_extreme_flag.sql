-- Seed Coach AI knowledge base with Extreme Flag football rules.
--
-- "Extreme Flag" refers to the Austin-area league described as a flag/tackle
-- hybrid. Specific rules for this league are NOT widely published online and
-- the seed below is intentionally minimal — a placeholder + notes — rather
-- than fabricated specifics.
--
-- The site admin should use the admin chat training mode to fill in the
-- actual rules from the league's published rulebook.
--
-- All rows authoritative=false / needs_review=true. Most rows are explicit
-- placeholders saying "needs admin input" rather than guessed content.

insert into public.rag_documents (
  scope, scope_id,
  topic, subtopic, title, content,
  sport_variant, sanctioning_body, game_level,
  source, source_note,
  authoritative, needs_review
) values

('global', null,
 'rules', 'overview',
 'Extreme Flag — Overview (placeholder)',
 'Extreme Flag is a flag/tackle-hybrid league described by users as based in the Austin, TX area. Detailed rules are not yet seeded — this placeholder exists so the system knows the variant exists and can prompt the site admin to provide rules via the admin chat training mode. Until then, the LLM should tell users that Extreme Flag rules need to be loaded by the site admin and ask the user to share their league''s rulebook if available.',
 'extreme_flag', null, 'mixed', 'seed',
 'PLACEHOLDER. Site admin must load actual rules from the Austin Extreme Flag league rulebook before the LLM can answer rule questions for this variant.',
 false, true),

('global', null,
 'rules', 'placeholder_field',
 'Extreme Flag — Field (placeholder)',
 'Field dimensions for Extreme Flag are not yet seeded. Site admin should provide field length, width, end zone size, and any zone markings (no-run zones, line to gain) from the league rulebook.',
 'extreme_flag', null, 'mixed', 'seed',
 'PLACEHOLDER. Awaiting admin input.',
 false, true),

('global', null,
 'rules', 'placeholder_players',
 'Extreme Flag — Players on field (placeholder)',
 'Number of players per side for Extreme Flag is not yet seeded. Site admin should provide players per side and any position requirements.',
 'extreme_flag', null, 'mixed', 'seed',
 'PLACEHOLDER. Awaiting admin input.',
 false, true),

('global', null,
 'rules', 'placeholder_contact',
 'Extreme Flag — Contact rules (placeholder)',
 'Contact rules are the defining feature of a flag/tackle hybrid and must be loaded by the site admin. Specific items needed: is blocking allowed, is tackling allowed, is the ball carrier downed by a flag pull or by being brought to the ground, are pads required, and what defensive contact is permitted.',
 'extreme_flag', null, 'mixed', 'seed',
 'PLACEHOLDER. Awaiting admin input. This is the most important placeholder to fill.',
 false, true),

('global', null,
 'rules', 'placeholder_scoring',
 'Extreme Flag — Scoring (placeholder)',
 'Scoring values for Extreme Flag are not yet seeded. Site admin should provide TD value, PAT options and values, FG (if any), and safety value.',
 'extreme_flag', null, 'mixed', 'seed',
 'PLACEHOLDER. Awaiting admin input.',
 false, true),

('global', null,
 'rules', 'placeholder_game_length',
 'Extreme Flag — Game length (placeholder)',
 'Game length for Extreme Flag is not yet seeded. Site admin should provide quarter/half length, halftime length, clock-stopping rules, mercy rule (if any), and overtime format.',
 'extreme_flag', null, 'mixed', 'seed',
 'PLACEHOLDER. Awaiting admin input.',
 false, true);

insert into public.rag_document_revisions (
  document_id, revision_number,
  title, content, source, source_note,
  authoritative, needs_review,
  change_kind, change_summary, changed_by
)
select
  d.id, 1,
  d.title, d.content, d.source, d.source_note,
  d.authoritative, d.needs_review,
  'create', 'Initial seed — placeholder rows pending admin input', null
from public.rag_documents d
where d.sport_variant = 'extreme_flag'
  and d.source = 'seed'
  and not exists (
    select 1 from public.rag_document_revisions r where r.document_id = d.id
  );
