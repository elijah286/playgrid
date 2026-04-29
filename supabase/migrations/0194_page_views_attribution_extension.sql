-- Extend page_views with the rest of the standard UTM set, the landing path,
-- and per-platform click IDs. These let us reconcile traffic against ad
-- platforms later (Meta CAPI, Google enhanced conversions, etc.) without
-- changing schema again.

alter table public.page_views
  add column if not exists utm_content text,
  add column if not exists utm_term text,
  add column if not exists landing_path text,
  add column if not exists fbclid text,
  add column if not exists gclid text,
  add column if not exists gbraid text,
  add column if not exists wbraid text,
  add column if not exists ttclid text,
  add column if not exists li_fat_id text,
  add column if not exists twclid text,
  add column if not exists msclkid text;

-- Reporting indices for the Campaigns performance view (next phase).
create index if not exists page_views_utm_campaign_idx
  on public.page_views (utm_campaign)
  where utm_campaign is not null;

create index if not exists page_views_utm_source_idx
  on public.page_views (utm_source)
  where utm_source is not null;
