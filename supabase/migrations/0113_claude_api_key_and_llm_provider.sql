-- Add Claude API key + LLM provider toggle to site_settings.
--
-- llm_provider selects which vendor Coach AI uses for chat/completion.
-- Embeddings always use OpenAI (Anthropic does not offer an embeddings API),
-- so the OpenAI key is still required even when provider='claude'.

alter table public.site_settings
  add column if not exists claude_api_key text,
  add column if not exists llm_provider   text not null default 'claude'
    check (llm_provider in ('openai','claude'));

comment on column public.site_settings.claude_api_key is
  'Anthropic Claude API key. Used for Coach AI chat/completion when llm_provider=claude.';
comment on column public.site_settings.llm_provider is
  'Active LLM provider for Coach AI chat: openai | claude. Embeddings always use OpenAI regardless.';
