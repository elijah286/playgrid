-- Extend print_presets so site admins can promote a saved configuration into
-- a "system preset" that every coach sees, alongside their own user-scoped
-- presets. System presets carry a description (shown as a tooltip) and a
-- thumbnail URL captured from the live preview at the moment of promotion.
--
-- Schema changes:
--   * user_id becomes nullable (system presets are owner-less).
--   * is_system flag distinguishes system from user presets.
--   * description and thumbnail_url present only for system presets in
--     practice, but allowed for user rows too — keeps the type uniform.
--
-- RLS:
--   * Everyone (signed in) can read system presets.
--   * Coaches can read/write their own user presets, as before.
--   * Only profiles.role = 'admin' can write system presets.

alter table public.print_presets
  alter column user_id drop not null,
  add column if not exists is_system boolean not null default false,
  add column if not exists description text,
  add column if not exists thumbnail_url text,
  add column if not exists product text;

-- The original unique(user_id, name) lets a single user reuse the same
-- preset name; allow system presets to coexist with user presets that
-- share the same name. System rows have user_id = NULL so the existing
-- constraint still holds; add a separate constraint for system uniqueness.
do $$ begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'print_presets_system_name_unique'
  ) then
    create unique index print_presets_system_name_unique
      on public.print_presets (name)
      where is_system;
  end if;
end $$;

-- A system preset must have user_id = NULL; a user preset must have user_id set.
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'print_presets_owner_consistency'
  ) then
    alter table public.print_presets
      add constraint print_presets_owner_consistency
      check (
        (is_system = true and user_id is null)
        or (is_system = false and user_id is not null)
      );
  end if;
end $$;

-- Replace the existing self-only read policy with one that also exposes
-- system presets to every signed-in user.
drop policy if exists "print_presets self read" on public.print_presets;
drop policy if exists "print_presets read" on public.print_presets;
create policy "print_presets read"
  on public.print_presets
  for select
  using (
    (is_system = true)
    or (auth.uid() = user_id)
  );

-- Self-write policy stays scoped to the user's own (non-system) rows.
drop policy if exists "print_presets self write" on public.print_presets;
create policy "print_presets self write"
  on public.print_presets
  for all
  using (auth.uid() = user_id and is_system = false)
  with check (auth.uid() = user_id and is_system = false);

-- Admin-only write policy for system presets. Mirrors the existing admin
-- detection used elsewhere (profiles.role = 'admin').
drop policy if exists "print_presets admin system write" on public.print_presets;
create policy "print_presets admin system write"
  on public.print_presets
  for all
  using (
    is_system = true
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    is_system = true
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Storage bucket for system-preset thumbnails. Public-read so the print
-- page can render <img src=...> without a signed URL; only admins can
-- upload (matching the system-preset write policy).
insert into storage.buckets (id, name, public)
values ('print-preset-thumbnails', 'print-preset-thumbnails', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "print preset thumbs public read" on storage.objects;
create policy "print preset thumbs public read"
  on storage.objects
  for select
  using (bucket_id = 'print-preset-thumbnails');

drop policy if exists "print preset thumbs admin write" on storage.objects;
create policy "print preset thumbs admin write"
  on storage.objects
  for all
  using (
    bucket_id = 'print-preset-thumbnails'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    bucket_id = 'print-preset-thumbnails'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );
