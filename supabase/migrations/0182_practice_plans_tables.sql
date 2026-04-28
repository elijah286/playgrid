-- Practice Plans: data model.
--
-- A practice plan is a reusable template owned by a playbook. It contains
-- ordered time blocks. Each block can have 1-3 lanes (parallel activities,
-- e.g., "skill" + "line"). Each lane optionally embeds a play-editor canvas
-- diagram (drill illustration with cones, ladders, etc.).
--
-- Storage mirrors the plays/play_versions revision pattern: practice_plans
-- holds metadata + a pointer to the current version; practice_plan_versions
-- is the append-only document history with the structured timeline as JSONB.

-- ── practice_plans ────────────────────────────────────────────────────
create table public.practice_plans (
  id                  uuid        primary key default gen_random_uuid(),
  playbook_id         uuid        not null references public.playbooks(id) on delete cascade,
  title               text        not null default 'Untitled practice plan',
  description         text        not null default '',
  current_version_id  uuid,
  created_by          uuid        references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  retired_at          timestamptz
);

create index practice_plans_playbook_idx
  on public.practice_plans (playbook_id)
  where retired_at is null;

drop trigger if exists practice_plans_set_updated_at on public.practice_plans;
create trigger practice_plans_set_updated_at
  before update on public.practice_plans
  for each row execute function public.set_updated_at();

comment on table public.practice_plans is
  'Practice plan templates scoped to a playbook. Beta-gated behind practice_plans feature.';

-- ── practice_plan_versions ────────────────────────────────────────────
-- The document JSONB shape is defined in
-- src/domain/practice-plan/types.ts (PracticePlanDocument).
create table public.practice_plan_versions (
  id                  uuid        primary key default gen_random_uuid(),
  practice_plan_id    uuid        not null references public.practice_plans(id) on delete cascade,
  schema_version      int         not null default 1,
  document            jsonb       not null,
  label               text,
  note                text,
  author_type         text        not null default 'human' check (author_type in ('human','ai')),
  author_prompt       text,
  created_by          uuid        references auth.users(id) on delete set null,
  created_at          timestamptz not null default now()
);

create index practice_plan_versions_plan_idx
  on public.practice_plan_versions (practice_plan_id, created_at desc);

alter table public.practice_plans
  add constraint practice_plans_current_version_fk
  foreign key (current_version_id)
  references public.practice_plan_versions(id)
  on delete set null;

-- ── RLS ───────────────────────────────────────────────────────────────
alter table public.practice_plans          enable row level security;
alter table public.practice_plan_versions  enable row level security;

-- Practice plans inherit visibility from their playbook.
create policy practice_plans_read
  on public.practice_plans for select
  using (public.can_view_playbook(playbook_id));

create policy practice_plans_write
  on public.practice_plans for all
  using      (public.can_edit_playbook(playbook_id))
  with check (public.can_edit_playbook(playbook_id));

create policy practice_plan_versions_read
  on public.practice_plan_versions for select
  using (
    exists (
      select 1 from public.practice_plans p
      where p.id = practice_plan_versions.practice_plan_id
        and public.can_view_playbook(p.playbook_id)
    )
  );

create policy practice_plan_versions_insert
  on public.practice_plan_versions for insert
  with check (
    exists (
      select 1 from public.practice_plans p
      where p.id = practice_plan_versions.practice_plan_id
        and public.can_edit_playbook(p.playbook_id)
    )
  );
