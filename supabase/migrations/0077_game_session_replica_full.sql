-- Supabase realtime UPDATE payloads only include the primary key plus
-- *changed* columns by default (REPLICA IDENTITY DEFAULT). That made the
-- client drop session state (caller_user_id, current_play_id, etc.) on
-- unrelated writes like heartbeats, flipping coaches into a broken
-- spectator view. REPLICA IDENTITY FULL ships every column on every
-- update so the client can trust the payload.

alter table public.game_sessions replica identity full;
alter table public.game_plays replica identity full;
alter table public.game_session_participants replica identity full;
