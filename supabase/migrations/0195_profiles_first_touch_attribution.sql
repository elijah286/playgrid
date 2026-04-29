-- First-touch attribution snapshot per user. Set once at signup from the
-- pg_first_touch cookie; never overwritten. Industry-standard 30-day window
-- is enforced application-side (cookie max-age), not in SQL.

alter table public.profiles
  add column if not exists first_touch_at timestamptz,
  add column if not exists first_utm_source text,
  add column if not exists first_utm_medium text,
  add column if not exists first_utm_campaign text,
  add column if not exists first_utm_content text,
  add column if not exists first_utm_term text,
  add column if not exists first_referrer text,
  add column if not exists first_landing_path text,
  add column if not exists first_country text,
  add column if not exists first_region text,
  add column if not exists first_city text,
  add column if not exists first_fbclid text,
  add column if not exists first_gclid text,
  add column if not exists first_gbraid text,
  add column if not exists first_wbraid text,
  add column if not exists first_ttclid text,
  add column if not exists first_li_fat_id text,
  add column if not exists first_twclid text,
  add column if not exists first_msclkid text;

-- Used by the Campaigns performance view to roll signups up by campaign.
create index if not exists profiles_first_utm_campaign_idx
  on public.profiles (first_utm_campaign)
  where first_utm_campaign is not null;
