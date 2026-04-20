-- Per-playbook game-rule settings (rushing/handoffs/blocking/max players).
-- Stored as jsonb so we can evolve the schema without migrations.

alter table public.playbooks
  add column if not exists settings jsonb not null default '{}'::jsonb;
