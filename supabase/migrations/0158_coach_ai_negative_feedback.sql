create table public.coach_ai_negative_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  response_text text not null,
  user_message text not null,
  created_at timestamp with time zone not null default now()
);

alter table public.coach_ai_negative_feedback enable row level security;

create policy "Users can view their own negative feedback" on public.coach_ai_negative_feedback
  for select using (auth.uid() = user_id);

create policy "Admins can view all negative feedback" on public.coach_ai_negative_feedback
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
    )
  );

create index coach_ai_negative_feedback_user_id_idx on public.coach_ai_negative_feedback(user_id);
create index coach_ai_negative_feedback_created_at_idx on public.coach_ai_negative_feedback(created_at desc);
