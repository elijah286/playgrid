-- Singleton site configuration (OpenAI API key, etc.). Access only via service role — RLS on with no policies.

create table if not exists public.site_settings (
  id text primary key,
  openai_api_key text,
  updated_at timestamptz not null default now()
);

insert into public.site_settings (id, openai_api_key)
values ('default', null)
on conflict (id) do nothing;

alter table public.site_settings enable row level security;
