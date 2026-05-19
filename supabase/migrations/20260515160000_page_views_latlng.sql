-- Add latitude/longitude to page_views so the admin Geography tab can plot
-- city dots on a Leaflet map. MaxMind GeoLite2 City already returns these
-- coordinates whenever it resolves a city, so this is the same data we
-- already store (country/region/city) expressed as a numeric centroid —
-- not new collection. lat/lng is suppressed for non-consenting EU visitors
-- the same way region/city is.

alter table public.page_views
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

-- Cities with non-null lat/lng are what the map plots; index speeds the
-- admin aggregation query that filters by created_at and groups by city.
create index if not exists page_views_latlng_idx
  on public.page_views (latitude, longitude)
  where latitude is not null and longitude is not null;
