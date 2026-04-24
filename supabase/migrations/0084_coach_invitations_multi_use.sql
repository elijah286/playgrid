-- Allow coach invitations to be redeemed multiple times, like gift codes.
-- max_uses caps total redemptions; used_count tracks how many have happened.
-- Existing rows default to a 1-use limit so behavior is unchanged.

alter table public.coach_invitations
  add column if not exists max_uses integer not null default 1
  check (max_uses > 0);

alter table public.coach_invitations
  add column if not exists used_count integer not null default 0
  check (used_count >= 0);

-- Backfill used_count from existing redeemed_at so already-redeemed rows
-- show as fully consumed.
update public.coach_invitations
set used_count = 1
where redeemed_at is not null and used_count = 0;

alter table public.coach_invitations
  drop constraint if exists coach_invitations_used_count_le_max;
alter table public.coach_invitations
  add constraint coach_invitations_used_count_le_max
  check (used_count <= max_uses);

-- Reinstall handle_new_user so each redemption increments used_count and
-- only closes the invite (redeemed_at) once it's fully consumed.
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
      set used_count = used_count + 1,
          redeemed_at = case
            when used_count + 1 >= max_uses then now()
            else redeemed_at
          end,
          redeemed_by = case
            when used_count + 1 >= max_uses then new.id
            else redeemed_by
          end
      where code = v_code
        and used_count < max_uses
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
