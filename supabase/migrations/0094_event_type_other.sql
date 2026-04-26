-- Add an 'other' value to playbook_event_type so coaches can schedule
-- non-football events (team party, booster meeting, film session, …)
-- with a custom title.

alter type public.playbook_event_type add value if not exists 'other';
