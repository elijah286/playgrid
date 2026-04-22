-- Authoring infrastructure for the public /examples page.
--
-- Model:
--   * One "examples" user account (a normal auth user) owns the example
--     playbooks. The admin decides which user via site_settings.
--   * Admins toggle "example maker mode" in the UI. While in that mode their
--     server actions route through the service-role client and scope queries
--     to the examples user's id so they can list / create / edit example
--     playbooks using the normal editor.
--   * Per-playbook `is_public_example` flag decides what actually appears on
--     the public /examples page. Drafts owned by the examples user but not
--     published stay private.
--
-- Reads on /examples go through the service-role client, so no anon RLS
-- policies are required for public exposure.

alter table public.site_settings
  add column if not exists examples_user_id uuid;

alter table public.playbooks
  add column if not exists is_public_example boolean not null default false;

-- Speeds up the /examples listing query (publicly visible example playbooks).
create index if not exists playbooks_is_public_example_idx
  on public.playbooks (is_public_example)
  where is_public_example = true;
