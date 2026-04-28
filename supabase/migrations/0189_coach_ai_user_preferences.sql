-- Coach AI user preferences — durable per-coach settings that follow the
-- user across all their playbooks and devices.
--
-- Use case: a coach says "always label my safety as U" — that should
-- persist everywhere, not be re-stated each session. The KB stores
-- coaching content; this table stores per-coach SETTINGS that change how
-- Cal renders + responds.
--
-- Key/value schema (not structured columns) because the value space is
-- open-ended: defender label aliases, preferred coverages, default
-- formation conventions, whatever the coach asks for. Cal interprets
-- the value at draw time.
--
-- Examples of (key, value):
--   defender_label_FS         "U"           — rename FS → U everywhere
--   defender_label_SS         "U2"
--   preferred_coverage        "Cover 3"     — default when coach doesn't specify
--   default_safety_depth_yds  "10"          — override the variant default
--   slot_label                "F"           — coach calls slot F not S
--
-- Scope: user-level by default. Coaches can also scope a pref to a
-- specific playbook (playbook_id non-null) when a setting only applies
-- to one team. Lookup precedence: playbook-specific overrides user-level
-- which overrides the variant default.

create table if not exists public.coach_ai_user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- null = applies to all playbooks the coach owns; non-null = only that playbook.
  playbook_id uuid references public.playbooks(id) on delete cascade,
  -- Snake-case key. Stable identifiers that Cal recognizes — see prompt
  -- and tool docs for the supported set.
  pref_key text not null,
  -- Free-form text. Cal interprets at draw / answer time.
  pref_value text not null,
  -- Optional human-readable note explaining the preference (shown in
  -- "your preferences" listings, useful when reviewing later).
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A coach has at most one value per (key, playbook scope). Same key with
  -- null and non-null playbook_id is allowed (user-level + playbook-level
  -- overrides coexist). Use a partial unique index because PG treats null
  -- as distinct in unique constraints.
  constraint coach_ai_user_preferences_user_key_playbook_uniq
    unique (user_id, pref_key, playbook_id)
);

create index if not exists coach_ai_user_preferences_user_idx
  on public.coach_ai_user_preferences (user_id);

create index if not exists coach_ai_user_preferences_user_playbook_idx
  on public.coach_ai_user_preferences (user_id, playbook_id);

-- updated_at trigger
create or replace function public.touch_coach_ai_user_preferences_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists coach_ai_user_preferences_touch_updated_at on public.coach_ai_user_preferences;
create trigger coach_ai_user_preferences_touch_updated_at
  before update on public.coach_ai_user_preferences
  for each row execute function public.touch_coach_ai_user_preferences_updated_at();

alter table public.coach_ai_user_preferences enable row level security;

-- Each coach reads / writes their own row. No admin override here — these
-- are personal settings.
create policy "coach reads own prefs"
  on public.coach_ai_user_preferences for select
  using (user_id = auth.uid());

create policy "coach inserts own prefs"
  on public.coach_ai_user_preferences for insert
  with check (user_id = auth.uid());

create policy "coach updates own prefs"
  on public.coach_ai_user_preferences for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "coach deletes own prefs"
  on public.coach_ai_user_preferences for delete
  using (user_id = auth.uid());

comment on table public.coach_ai_user_preferences is
  'Per-coach Coach AI preferences (label aliases, default coverages, etc.). User-level by default; playbook_id non-null for team-specific overrides.';
comment on column public.coach_ai_user_preferences.pref_key is
  'Stable snake_case key. See src/lib/coach-ai/preferences.ts for the supported set.';
comment on column public.coach_ai_user_preferences.pref_value is
  'Free-form text value. Cal interprets at draw/answer time based on the key.';
