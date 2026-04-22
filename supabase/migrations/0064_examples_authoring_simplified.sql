-- Second take on the examples authoring surface. Replaces the UUID-based
-- "examples user" + cookie-based "maker mode" model with a much simpler
-- per-playbook flag that any site admin can flip on a playbook they own.
--
-- Data model after this migration:
--   * playbooks.is_example           — admin marked this playbook as an
--                                      example. Shows an inline banner
--                                      and unlocks the Publish action.
--   * playbooks.is_public_example    — marked AND published. Shows on
--                                      /examples when the global gate
--                                      is on. Already existed in 0063.
--                                      Now subordinate to is_example.
--   * playbooks.example_author_label — free-text author label shown on
--                                      /examples cards (e.g. "Coach
--                                      Jane" or "You!"). Nullable.
--   * site_settings.examples_page_enabled — global kill switch for the
--                                      whole /examples route and any
--                                      "Browse examples" CTAs.
--
-- The act-as RLS grant + helper functions from 0063 are dropped — they
-- were only needed because "maker mode" had admins impersonating
-- another account. With the new model, admins flip flags on their own
-- playbooks through the normal membership-based policies.

alter table public.playbooks
  add column if not exists is_example boolean not null default false;

alter table public.playbooks
  add column if not exists example_author_label text;

alter table public.site_settings
  add column if not exists examples_page_enabled boolean not null default false;

-- Any row that was already flagged as public (under the old model) is
-- implicitly an example too. Without this the old /examples publish
-- toggles would look "broken" the moment we deploy the new UI.
update public.playbooks set is_example = true where is_public_example = true;

-- Drop the admin-examples RLS policies created in 0063. They granted
-- admins access to another user's content via the "is examples author"
-- check, which is no longer a concept.
drop policy if exists playbooks_admin_examples_select on public.playbooks;
drop policy if exists playbooks_admin_examples_update on public.playbooks;
drop policy if exists playbooks_admin_examples_delete on public.playbooks;
drop policy if exists plays_admin_examples_select on public.plays;
drop policy if exists plays_admin_examples_write on public.plays;
drop policy if exists play_versions_admin_examples_select on public.play_versions;
drop policy if exists play_versions_admin_examples_write on public.play_versions;
drop policy if exists pm_admin_examples_select on public.playbook_members;
drop policy if exists pm_admin_examples_all on public.playbook_members;

drop function if exists public.is_examples_authoring_playbook(uuid);
drop function if exists public.is_admin();

-- Old UUID-based author config is no longer used anywhere.
alter table public.site_settings drop column if exists examples_user_id;
