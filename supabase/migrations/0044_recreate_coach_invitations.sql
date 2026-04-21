-- Remote DB is missing public.coach_invitations despite migration 0029 being
-- marked applied (remote schema pull confirms the table is absent). Re-apply
-- the DDL idempotently so the site-admin invitations page works again.

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('user', 'admin', 'coach'));

create table if not exists public.coach_invitations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  note text,
  recipient_email text,
  expires_at timestamptz,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  redeemed_at timestamptz,
  redeemed_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  last_emailed_at timestamptz,
  check (code = upper(code) and char_length(code) between 6 and 64)
);

create index if not exists coach_invitations_code_idx
  on public.coach_invitations (code);

create index if not exists coach_invitations_created_at_idx
  on public.coach_invitations (created_at desc);

alter table public.coach_invitations enable row level security;

drop policy if exists "coach_invitations admin all" on public.coach_invitations;
create policy "coach_invitations admin all"
  on public.coach_invitations
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Reinstall handle_new_user so invite_code in auth metadata still elevates to coach.
create or replace function public.handle_new_user()
returns trigger as $$
declare
  v_code text;
  v_redeemed_id uuid;
  v_role text := 'user';
begin
  v_code := nullif(upper(trim(new.raw_user_meta_data->>'invite_code')), '');

  if v_code is not null then
    update public.coach_invitations
      set redeemed_at = now(),
          redeemed_by = new.id
      where code = v_code
        and redeemed_at is null
        and revoked_at is null
        and (expires_at is null or expires_at > now())
      returning id into v_redeemed_id;
    if v_redeemed_id is not null then
      v_role := 'coach';
    end if;
  end if;

  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    v_role
  )
  on conflict (id) do update
    set role = case
      when public.profiles.role = 'user' and excluded.role <> 'user'
        then excluded.role
      else public.profiles.role
    end;

  return new;
end;
$$ language plpgsql security definer set search_path = public;
