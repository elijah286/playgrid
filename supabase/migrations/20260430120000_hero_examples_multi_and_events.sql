-- Allow multiple hero playbooks + start tracking which ones convert.
--
-- Drop the unique-partial-index constraint that capped heroes at one — we
-- now want to flag any number of playbooks and pick one at random per
-- home-page render. The boolean column stays exactly the same; only the
-- single-selection guarantee goes away.
--
-- Add marketing_hero_events to log impressions (every render that picked
-- this hero) and clicks (every "Try this playbook" tap). Lets us compute
-- per-playbook CTR and pick winners over time. No PII; just playbook id,
-- event type, and timestamp.

drop index if exists public.playbooks_single_hero_marketing_example_idx;

create table if not exists public.marketing_hero_events (
  id bigint generated always as identity primary key,
  playbook_id uuid not null references public.playbooks(id) on delete cascade,
  event_type text not null check (event_type in ('impression', 'click')),
  created_at timestamptz not null default now()
);

create index if not exists marketing_hero_events_playbook_type_idx
  on public.marketing_hero_events (playbook_id, event_type, created_at desc);

-- Reads + writes go through the service-role client (server actions /
-- home-page loader), so anon RLS is irrelevant. Lock anon out by default.
alter table public.marketing_hero_events enable row level security;
