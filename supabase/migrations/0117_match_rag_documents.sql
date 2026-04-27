-- Vector similarity search over rag_documents with metadata pre-filter.
--
-- security invoker so RLS policies on rag_documents apply: callers only
-- see global rows + playbook rows they can_view.
--
-- Filters are nullable: pass null to skip a filter dimension. Caller is
-- expected to filter scope client-side via p_scope, p_playbook_id (which
-- restricts playbook-scope rows to a specific playbook).

create or replace function public.match_rag_documents(
  p_query_embedding   vector(1536),
  p_match_count       int     default 8,
  p_scope             text    default null,    -- 'global' | 'playbook' | null = both
  p_playbook_id       uuid    default null,    -- when scope includes 'playbook'
  p_sport_variant     text    default null,
  p_game_level        text    default null,
  p_sanctioning_body  text    default null,
  p_age_division      text    default null
)
returns table (
  id              uuid,
  scope           text,
  scope_id        uuid,
  topic           text,
  subtopic        text,
  title           text,
  content         text,
  sport_variant   text,
  game_level      text,
  sanctioning_body text,
  age_division    text,
  source          text,
  source_url      text,
  authoritative   boolean,
  needs_review    boolean,
  similarity      float
)
language sql
stable
security invoker
as $$
  select
    d.id,
    d.scope,
    d.scope_id,
    d.topic,
    d.subtopic,
    d.title,
    d.content,
    d.sport_variant,
    d.game_level,
    d.sanctioning_body,
    d.age_division,
    d.source,
    d.source_url,
    d.authoritative,
    d.needs_review,
    1 - (d.embedding <=> p_query_embedding) as similarity
  from public.rag_documents d
  where d.embedding is not null
    and d.retired_at is null
    and (p_scope is null or d.scope = p_scope)
    and (
      d.scope = 'global'
      or (d.scope = 'playbook' and (p_playbook_id is null or d.scope_id = p_playbook_id))
    )
    and (p_sport_variant    is null or d.sport_variant    is null or d.sport_variant    = p_sport_variant)
    and (p_game_level       is null or d.game_level       is null or d.game_level       = p_game_level)
    and (p_sanctioning_body is null or d.sanctioning_body is null or d.sanctioning_body = p_sanctioning_body)
    and (p_age_division     is null or d.age_division     is null or d.age_division     = p_age_division)
  order by d.embedding <=> p_query_embedding
  limit greatest(1, least(coalesce(p_match_count, 8), 50));
$$;

comment on function public.match_rag_documents is
  'Vector search over rag_documents with metadata pre-filter. Security invoker — RLS applies.';
