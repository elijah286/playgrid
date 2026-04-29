-- MaxMind GeoLite2 license key + DB-refresh metadata. Lookup library
-- (@maxmind/geoip2-node) reads the .mmdb file from disk; we download it
-- on first lookup using the stored license key and cache to /tmp on
-- Railway. last_downloaded_at lets the admin UI show staleness.

alter table public.site_settings
  add column if not exists maxmind_license_key text,
  add column if not exists maxmind_db_downloaded_at timestamptz;
