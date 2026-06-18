-- Tell a genuine re-auth apart from a kicked session that's still navigating.
--
-- Background: user_sessions caps concurrent sessions per device class. When a
-- sign-in pushes a class over its cap, the least-recently-active row is
-- revoked (revoked_reason='cap_kicked'). The schema always INTENDED a revoked
-- row to be reused on that device's next sign-in — see 0090_user_sessions.sql:
-- "signing out and back in on the same device reuses the row (... revoked_at
-- is cleared on re-auth)". But touchUserSession never implemented that: it
-- returned `revoked` unconditionally whenever it found a revoked row for the
-- (user, device) pair. Net effect: once a device's row was revoked, every
-- future sign-in on that device — even the newest one, which by policy should
-- WIN — was immediately bounced to /login?reason=signed_out_elsewhere. The
-- device the coach just signed in on got kicked instead of the older peers.
--
-- The fix needs a server-side signal to distinguish a *new* sign-in (which
-- should reclaim the slot and evict the real LRU peer) from the *same* kicked
-- session merely navigating (which should stay signed out). The Supabase
-- access-token `session_id` claim is exactly that: stable across token
-- refreshes within one sign-in, fresh on every new sign-in. We persist it
-- here so touchUserSession can compare the row's stored session id against the
-- request's current one.
--
-- Additive + nullable: no backfill. Legacy rows (NULL here) self-heal — they
-- get a session id on their next touch, and a NULL never matches a real
-- session id, so a re-auth on a legacy revoked row reclaims it (the desired
-- "let the latest sign-in win" behavior).
alter table public.user_sessions
  add column if not exists auth_session_id text;

comment on column public.user_sessions.auth_session_id is
  'Supabase auth session_id (JWT claim) of the sign-in currently occupying this device row. Refreshed on every touch. touchUserSession reclaims a revoked row when the request''s session_id differs from this (a genuine re-auth), and keeps it revoked when they match (the kicked session still navigating).';
