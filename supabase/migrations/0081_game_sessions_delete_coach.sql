-- Allow any playbook coach to delete a game session. Cascades clear
-- game_plays and game_score_events. Needed for the Games tab delete
-- affordance and also lets discardGameSessionAction succeed for solo
-- coaches whose "active" session is still their own work.

drop policy if exists game_sessions_delete_coach on public.game_sessions;
create policy game_sessions_delete_coach on public.game_sessions
  for delete using (public.can_edit_playbook(playbook_id));
