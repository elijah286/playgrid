-- Hero marketing example: lets a site admin pick a single published example
-- playbook to feature in the home-page hero shot. The home page reads this
-- one row and renders the playbook's book tile in place of the static X/O
-- illustration. If no row is flagged, the page falls back to the logo.
--
-- Single-selection is enforced at the database via a unique partial index —
-- the server action that flips this flag wraps clear-then-set in a
-- transaction, but the index is the real guarantee that we never serve two
-- heroes.

alter table public.playbooks
  add column if not exists is_hero_marketing_example boolean not null default false;

create unique index if not exists playbooks_single_hero_marketing_example_idx
  on public.playbooks ((is_hero_marketing_example))
  where is_hero_marketing_example = true;
