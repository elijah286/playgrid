-- Allow signed-in users to insert their own profile row (repairs orphans + supports client upsert)
create policy profiles_insert_own on public.profiles
  for insert with check (id = auth.uid());
