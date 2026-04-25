-- Per-seat collaborator pricing for Team Coach.
--
-- A "seat" is consumed by a non-owner active membership on a playbook
-- whose owner is on Coach+ AND whose collaborator's own entitlement is
-- below Coach (i.e. they're getting the paid features only via the
-- owner's plan). Coach+ collaborators are free seats — they pay their
-- own way, so they shouldn't burn the inviter's seats.
--
-- Each Team Coach gets `included_seats` for free (default 3); beyond
-- that, the owner buys per-seat add-ons via Stripe. `purchased_seats`
-- here mirrors the quantity on the seat line item of their subscription.
--
-- This migration only stores the data and exposes a count function.
-- Invite-time enforcement, Stripe sync, and "Add seat" UI live in
-- application code.

create table public.owner_seat_grants (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  included_seats int not null default 3 check (included_seats >= 0),
  purchased_seats int not null default 0 check (purchased_seats >= 0),
  -- The Stripe subscription_item_id for the per-seat line. Null until
  -- the first seat is bought. Kept on this row so the webhook can
  -- match incoming subscription updates back to an owner without a
  -- separate join.
  stripe_subscription_item_id text,
  updated_at timestamptz not null default now()
);

create or replace function public.touch_owner_seat_grants_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger owner_seat_grants_touch_updated_at
  before update on public.owner_seat_grants
  for each row execute function public.touch_owner_seat_grants_updated_at();

alter table public.owner_seat_grants enable row level security;

-- Owners can read their own row (for the seat usage UI).
create policy owner_seat_grants_select_self on public.owner_seat_grants
  for select using (owner_id = auth.uid());

-- All writes flow through the service role (Stripe webhook, admin actions).

-- Function: count distinct collaborators currently consuming seats for
-- a given owner. Marked stable + security definer so the invite guard
-- can call it without RLS visibility into other users' entitlements.
create or replace function public.seats_used(p_owner_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(distinct m.user_id)::int
  from public.playbook_members m
  left join public.user_entitlements e on e.user_id = m.user_id
  where m.user_id <> p_owner_id
    and m.role <> 'owner'
    and m.status = 'active'
    and (e.tier is null or e.tier = 'free')
    and exists (
      select 1
      from public.playbook_members owner_m
      where owner_m.playbook_id = m.playbook_id
        and owner_m.user_id = p_owner_id
        and owner_m.role = 'owner'
        and owner_m.status = 'active'
    )
$$;

grant execute on function public.seats_used(uuid) to authenticated;
