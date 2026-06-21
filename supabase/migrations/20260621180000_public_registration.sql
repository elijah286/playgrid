-- Public parent registration intake (Track B, slice B).
--
-- Additive + gated. Anonymous parents submit through a server action that runs
-- with the service role (validating registration is open in code), so no
-- anon RLS write policy is introduced. Applicant details land in a jsonb column
-- (no account/player_profile required for an anonymous submission); the operator
-- review queue resolves them into real records later.

alter table public.player_registrations
  add column if not exists applicant jsonb not null default '{}'::jsonb;

create table public.league_registration_purchases (
  id               uuid        primary key default gen_random_uuid(),
  registration_id  uuid        not null references public.player_registrations(id) on delete cascade,
  store_item_id    uuid        references public.league_store_items(id) on delete set null,
  -- Snapshot name/price at purchase time so later catalog edits don't rewrite
  -- what the family actually agreed to buy.
  item_name        text        not null,
  unit_price_cents integer     not null default 0,
  quantity         integer     not null default 1,
  created_at       timestamptz not null default now()
);

create index league_registration_purchases_reg_idx
  on public.league_registration_purchases (registration_id);

alter table public.league_registration_purchases enable row level security;

-- League admins can read purchases for their league's registrations; writes are
-- server-role only (the public submit action). No anon policy.
create policy league_registration_purchases_select_admin on public.league_registration_purchases
  for select using (
    exists (
      select 1
      from public.player_registrations pr
      where pr.id = registration_id
        and (public.is_league_admin(pr.league_id) or public.is_site_admin())
    )
  );
