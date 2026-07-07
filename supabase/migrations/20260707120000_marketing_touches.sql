-- Unified marketing-touch log + the team-invite campaign's kill switch.
--
-- Every one-shot lifecycle/marketing campaign (team-invite nudge, referral
-- launch, re-activation, …) writes ONE row here per user, so the admin
-- Marketing section has a single measurable source. Recurring campaigns
-- (digest, reengagement) keep their own bespoke tables; the dashboard unions
-- them in read-only for a complete picture.
--
-- Additive; no destructive DDL.

create table if not exists public.marketing_email_sends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Stable campaign key, e.g. 'team_invite_nudge', 'referral_launch'.
  campaign text not null,
  -- A/B arm. 'treatment' = got the email; 'holdout' = eligible but deliberately
  -- NOT emailed (the control group, so lift is measurable); 'control' reserved
  -- for non-holdout controls.
  variant text not null default 'treatment'
    check (variant in ('treatment', 'control', 'holdout')),
  -- 'sent' | 'failed' (delivery error) | 'holdout' (control, not sent) | 'skipped'.
  status text not null default 'sent'
    check (status in ('sent', 'failed', 'holdout', 'skipped')),
  to_email text,
  error_message text,
  meta jsonb,
  sent_at timestamptz not null default now(),
  -- One touch per user per one-shot campaign — makes double-processing
  -- structurally impossible and marks holdout users so they aren't retried.
  unique (user_id, campaign)
);

create index if not exists marketing_email_sends_campaign_idx
  on public.marketing_email_sends (campaign);
create index if not exists marketing_email_sends_sent_at_idx
  on public.marketing_email_sends (sent_at);

alter table public.marketing_email_sends enable row level security;

-- Admin-only read (drives the Marketing dashboard). Writes are service-role only.
drop policy if exists "marketing_email_sends admin read" on public.marketing_email_sends;
create policy "marketing_email_sends admin read"
  on public.marketing_email_sends for select
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Kill switch for the auto-triggered team-invite email cron (off by default).
alter table public.site_settings
  add column if not exists invite_team_email_enabled boolean not null default false;

-- Backfill the referral launch email (the 201 already sent) into the unified
-- log so it shows in the Marketing dashboard alongside new campaigns.
insert into public.marketing_email_sends (user_id, campaign, variant, status, to_email, sent_at)
select r.user_id, 'referral_launch', 'treatment',
       case when r.status = 'failed' then 'failed' else 'sent' end,
       r.to_email, r.sent_at
from public.referral_announcement_sends r
on conflict (user_id, campaign) do nothing;
