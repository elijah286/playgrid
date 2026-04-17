-- Site admin role on profiles + RLS for admins to manage users (metadata; auth users managed via Admin API)

alter table public.profiles
  add column if not exists role text not null default 'user'
    check (role in ('user', 'admin'));

create index if not exists profiles_role_idx on public.profiles (role);

create or replace function public.is_site_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$ language sql stable security definer set search_path = public;

-- Replace profile policies so admins can read/update all profiles (for user management)
drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;

create policy profiles_select on public.profiles
  for select using (id = auth.uid() or public.is_site_admin());

create policy profiles_update on public.profiles
  for update using (id = auth.uid() or public.is_site_admin());
