-- Create table for managing beta feature access by email
create table public.beta_feature_allowlist (
  id bigserial primary key,
  feature text not null,
  email text not null,
  created_at timestamp with time zone not null default now(),
  created_by uuid,
  constraint valid_feature check (feature in (
    'coach_ai', 'game_mode', 'game_results', 'marketing_content',
    'team_calendar', 'play_comments', 'version_history'
  )),
  constraint unique_feature_email unique (feature, email),
  foreign key (created_by) references auth.users(id) on delete set null
);

-- Indexes for common queries
create index idx_beta_feature_allowlist_feature on public.beta_feature_allowlist(feature);
create index idx_beta_feature_allowlist_email on public.beta_feature_allowlist(email);

-- Enable RLS but allow service role access
alter table public.beta_feature_allowlist enable row level security;

create policy "service_role_all"
  on public.beta_feature_allowlist
  for all
  using (auth.role() = 'service_role');
