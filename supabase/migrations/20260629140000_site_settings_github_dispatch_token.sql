-- GitHub token used to dispatch the "Functional tests" workflow on demand
-- (Site Admin → Functional Testing → "Run Coach Cal tests"). The Coach Cal
-- scenarios run only in GitHub Actions, so the app triggers them via the GitHub
-- API; this is the token it authenticates with (needs actions:write on the
-- repo). Stored in the service-role-only site_settings singleton alongside the
-- other admin secrets (openai/anthropic admin keys, Stripe, Google Maps). A
-- GITHUB_DISPATCH_TOKEN env var still works as a fallback when this is null.
alter table public.site_settings
  add column if not exists github_dispatch_token text;

comment on column public.site_settings.github_dispatch_token is
  'GitHub PAT (classic: repo+workflow, or fine-grained: Actions:write) used to dispatch the functional-tests workflow on demand. Service-role read only; never returned to the client.';
