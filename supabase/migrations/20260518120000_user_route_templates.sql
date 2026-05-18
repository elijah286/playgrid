-- Per-user custom route templates. Surfaced in the Quick Routes panel of the
-- play editor under a "Your routes" section, alongside the canonical system
-- catalog (src/domain/play/routeTemplates.ts). Saved via right-click on a
-- player carrying exactly one route → "Save as template".
--
-- Scope is intentionally per-user (NOT per-team / per-playbook): coaches
-- think of these as their personal shortcuts, like browser bookmarks. RLS
-- enforces this hard — no one else can read, edit, or delete another user's
-- templates.
--
-- Cal does NOT consume these templates. Per AGENTS.md Rule 5 + Rule 6, the
-- canonical catalog is the single source of geometric truth for AI
-- composition. User templates are purely editor convenience.

create table public.user_route_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 40),
  -- Relative offsets from the player's start position, matching the system
  -- catalog's coord system (positive x = outside / sideline, negative x =
  -- inside / toward middle). Stored in template-coords so directional
  -- flipping works the same way as system templates.
  points jsonb not null,
  -- Per-segment shape, length = points.length - 1. Values: "straight" | "curve" | "zigzag".
  shapes jsonb not null,
  -- Per-segment stroke pattern, length = points.length - 1. Values: "solid"
  -- | "dashed" | "dotted" | "motion". Nullable for older rows; missing →
  -- defaults to "solid" at render time.
  stroke_patterns jsonb,
  -- Captured RouteStyle: { stroke, strokeWidth, dash? }. When the user
  -- applies this template, the saved style is restored verbatim — different
  -- from system templates which adopt the editor's current active style.
  style jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index user_route_templates_user_id_idx
  on public.user_route_templates (user_id, created_at desc);

alter table public.user_route_templates enable row level security;

create policy "user_route_templates_select_own"
  on public.user_route_templates for select
  using (auth.uid() = user_id);

create policy "user_route_templates_insert_own"
  on public.user_route_templates for insert
  with check (auth.uid() = user_id);

create policy "user_route_templates_update_own"
  on public.user_route_templates for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "user_route_templates_delete_own"
  on public.user_route_templates for delete
  using (auth.uid() = user_id);

-- updated_at bumper
create or replace function public.user_route_templates_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger user_route_templates_touch_updated_at
  before update on public.user_route_templates
  for each row execute function public.user_route_templates_touch_updated_at();
