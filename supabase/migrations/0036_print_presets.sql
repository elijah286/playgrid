-- User-scoped saved print presets. Stores a named PlaybookPrintRunConfig
-- JSON blob so coaches can jump between named configurations ("small
-- wristbands", "big playcard", etc.) without re-setting every toggle.
-- Presets are not scoped to a specific playbook — they travel with the
-- user across their playbooks.

create table if not exists public.print_presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  config jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create index if not exists print_presets_user_id_idx
  on public.print_presets (user_id, updated_at desc);

alter table public.print_presets enable row level security;

drop policy if exists "print_presets self read" on public.print_presets;
create policy "print_presets self read"
  on public.print_presets
  for select
  using (auth.uid() = user_id);

drop policy if exists "print_presets self write" on public.print_presets;
create policy "print_presets self write"
  on public.print_presets
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
