-- Site-admin "system notices" — a private feed of operational events that
-- show up in the admin inbox: new signups, paid subscription starts/cancels,
-- and per-user activity milestones (e.g. a coach's 10th play). Notices are
-- visible only to users with profiles.role = 'admin'.

-- 1) Table
create table if not exists public.system_notices (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in (
    'user_signup',
    'subscription_purchased',
    'subscription_canceled',
    'play_milestone'
  )),
  severity text not null default 'info' check (severity in ('info', 'warn', 'critical')),
  user_id uuid references auth.users (id) on delete set null,
  user_display_name text,
  user_email text,
  body text not null,
  href text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists system_notices_created_at_idx
  on public.system_notices (created_at desc);
create index if not exists system_notices_kind_idx
  on public.system_notices (kind);

alter table public.system_notices enable row level security;

drop policy if exists system_notices_select_admin on public.system_notices;
create policy system_notices_select_admin
  on public.system_notices for select
  using (public.is_site_admin());

-- No insert/update/delete policies — writes happen via SECURITY DEFINER
-- triggers and service-role inserts; nothing in the user-facing app can
-- forge a notice.

-- 2) Trigger: new user → 'user_signup' notice. Fires after handle_new_user
--    has populated profiles, so display_name is whatever that trigger
--    resolved (real name when metadata is present, email otherwise).
create or replace function public.system_notice_after_profile_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  select u.email into v_email from auth.users u where u.id = new.id;

  insert into public.system_notices(kind, severity, user_id, user_display_name, user_email, body, href, detail)
  values (
    'user_signup',
    'info',
    new.id,
    new.display_name,
    v_email,
    coalesce(nullif(trim(new.display_name), ''), v_email, 'A new user') || ' signed up',
    '/admin/users',
    jsonb_build_object('user_id', new.id)
  );

  return new;
end;
$$;

drop trigger if exists trg_system_notice_profile_insert on public.profiles;
create trigger trg_system_notice_profile_insert
  after insert on public.profiles
  for each row execute function public.system_notice_after_profile_insert();

-- 3) Trigger: subscription insert/update → 'subscription_purchased' or
--    'subscription_canceled' notice. We treat:
--      - any transition INTO an active/trialing paid tier as a purchase;
--      - cancel_at_period_end flipping false → true OR status moving from
--        active/trialing to canceled/incomplete_expired/unpaid as a cancel.
create or replace function public.system_notice_after_subscription_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_name text;
  v_tier_label text;
  v_was_active_paid boolean;
  v_is_active_paid boolean;
  v_was_canceling boolean;
  v_is_canceling boolean;
begin
  -- Only emit notices for paid tiers; free-tier rows are noise.
  v_is_active_paid :=
    new.status in ('active', 'trialing')
    and new.tier in ('coach', 'coach_ai');

  if tg_op = 'UPDATE' then
    v_was_active_paid :=
      old.status in ('active', 'trialing')
      and old.tier in ('coach', 'coach_ai');
    v_was_canceling := coalesce(old.cancel_at_period_end, false);
  else
    v_was_active_paid := false;
    v_was_canceling := false;
  end if;

  v_is_canceling := coalesce(new.cancel_at_period_end, false);

  -- Resolve user info once.
  select p.display_name into v_name from public.profiles p where p.id = new.user_id;
  select u.email into v_email from auth.users u where u.id = new.user_id;

  v_tier_label := case new.tier
    when 'coach' then 'Team Coach'
    when 'coach_ai' then 'Coach Pro'
    else new.tier::text
  end;

  -- Purchase: just transitioned into an active/trialing paid tier.
  if v_is_active_paid and not v_was_active_paid then
    insert into public.system_notices(kind, severity, user_id, user_display_name, user_email, body, href, detail)
    values (
      'subscription_purchased',
      'info',
      new.user_id,
      v_name,
      v_email,
      'purchased ' || v_tier_label,
      '/admin/users',
      jsonb_build_object(
        'user_id', new.user_id,
        'tier', new.tier,
        'tier_label', v_tier_label,
        'billing_interval', new.billing_interval,
        'stripe_subscription_id', new.stripe_subscription_id
      )
    );
  end if;

  -- Cancellation: explicit cancel-at-period-end click, or status moved out
  -- of active/trialing while the row was previously a paid active sub.
  if (
    (v_is_canceling and not v_was_canceling)
    or (
      tg_op = 'UPDATE'
      and v_was_active_paid
      and new.status in ('canceled', 'incomplete_expired', 'unpaid')
    )
  ) then
    -- Use OLD.tier when available so a row that's already been wound down
    -- to free still labels with the cancelled tier.
    declare
      v_cancel_tier_label text := case
        when tg_op = 'UPDATE' and old.tier in ('coach', 'coach_ai') then
          case old.tier when 'coach' then 'Team Coach' when 'coach_ai' then 'Coach Pro' end
        else v_tier_label
      end;
    begin
      insert into public.system_notices(kind, severity, user_id, user_display_name, user_email, body, href, detail)
      values (
        'subscription_canceled',
        'warn',
        new.user_id,
        v_name,
        v_email,
        'canceled ' || v_cancel_tier_label,
        '/admin/users',
        jsonb_build_object(
          'user_id', new.user_id,
          'tier', coalesce(old.tier::text, new.tier::text),
          'tier_label', v_cancel_tier_label,
          'status', new.status,
          'cancel_at_period_end', v_is_canceling,
          'stripe_subscription_id', new.stripe_subscription_id
        )
      );
    end;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_system_notice_subscription_change on public.subscriptions;
create trigger trg_system_notice_subscription_change
  after insert or update on public.subscriptions
  for each row execute function public.system_notice_after_subscription_change();

-- 4) Trigger: play creation milestone (10th play) → 'play_milestone' notice.
--    Fires on play_versions.kind='create' inserts so all six createPlay
--    paths in src/app/actions/plays.ts are covered automatically.
--
--    Counting the user's lifetime authored plays via play_versions is
--    chosen over plays.created_by because plays don't carry a creator
--    column directly — the version row is the source of truth for "who
--    authored this play first". Race condition between two simultaneous
--    creations putting count at exactly 10 each → both fire; acceptable
--    noise for an internal feed.
-- Partial index keeps the milestone count query fast: only the first
-- version per play (kind='create') is needed, and the trigger filters
-- by created_by.
create index if not exists play_versions_creator_create_idx
  on public.play_versions (created_by)
  where kind = 'create';

create or replace function public.system_notice_after_play_version_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_email text;
  v_name text;
begin
  if new.kind <> 'create' then return new; end if;
  if new.created_by is null then return new; end if;

  select count(*) into v_count
    from public.play_versions
    where created_by = new.created_by and kind = 'create';

  -- Only fire on the 10th play. Easy to extend to additional milestones
  -- (25, 50, 100) by adding to the IN list here.
  if v_count not in (10) then return new; end if;

  select p.display_name into v_name from public.profiles p where p.id = new.created_by;
  select u.email into v_email from auth.users u where u.id = new.created_by;

  insert into public.system_notices(kind, severity, user_id, user_display_name, user_email, body, href, detail)
  values (
    'play_milestone',
    'info',
    new.created_by,
    v_name,
    v_email,
    'created their ' ||
      case
        when v_count % 100 between 11 and 13 then v_count::text || 'th'
        when v_count % 10 = 1 then v_count::text || 'st'
        when v_count % 10 = 2 then v_count::text || 'nd'
        when v_count % 10 = 3 then v_count::text || 'rd'
        else v_count::text || 'th'
      end || ' play',
    '/admin/users',
    jsonb_build_object('user_id', new.created_by, 'count', v_count, 'play_id', new.play_id)
  );

  return new;
end;
$$;

drop trigger if exists trg_system_notice_play_version_insert on public.play_versions;
create trigger trg_system_notice_play_version_insert
  after insert on public.play_versions
  for each row execute function public.system_notice_after_play_version_insert();
