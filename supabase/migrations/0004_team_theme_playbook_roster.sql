-- Team color palette (JSON) and per-playbook staff/player roster for covers and organization

alter table public.teams
  add column if not exists theme jsonb not null default '{
    "presetId": "default",
    "primary": "#134e2a",
    "accent": "#c2410c",
    "field": "#c8ecd4",
    "ink": "#07140f",
    "surface": "#dfeae2",
    "pageBg": "#fafafa"
  }'::jsonb;

alter table public.playbooks
  add column if not exists roster jsonb not null default '{"staff":[],"players":[]}'::jsonb;

comment on column public.teams.theme is 'Brand palette for PDF covers and print tinting.';
comment on column public.playbooks.roster is 'Named staff and players for this playbook (cover sheet).';
