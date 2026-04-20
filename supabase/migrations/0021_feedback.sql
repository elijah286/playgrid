-- User feedback / ideas submitted from the floating widget.
-- Simple append-only log. Admins read; any signed-in user inserts their own.

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  message text not null check (char_length(message) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists feedback_created_at_idx
  on public.feedback (created_at desc);

create index if not exists feedback_user_id_idx
  on public.feedback (user_id);

alter table public.feedback enable row level security;

drop policy if exists "feedback insert own" on public.feedback;
create policy "feedback insert own"
  on public.feedback
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "feedback admin read" on public.feedback;
create policy "feedback admin read"
  on public.feedback
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );
