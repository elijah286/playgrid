-- Add INSERT policies for thumbs up/down feedback tables

create policy "Users can insert their own positive feedback" on public.coach_ai_positive_feedback
  for insert with check (auth.uid() = user_id);

create policy "Users can insert their own negative feedback" on public.coach_ai_negative_feedback
  for insert with check (auth.uid() = user_id);
