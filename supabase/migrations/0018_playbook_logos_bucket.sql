-- Public bucket for playbook / team logos. Read is public (so <img src> works
-- without signed URLs); writes are restricted to authenticated users via RLS,
-- but the app uploads via the service-role client in a server action so this
-- policy is a belt-and-suspenders guard.

insert into storage.buckets (id, name, public)
values ('playbook-logos', 'playbook-logos', true)
on conflict (id) do update set public = excluded.public;

-- Allow anyone to read (public bucket).
drop policy if exists "playbook_logos_public_read" on storage.objects;
create policy "playbook_logos_public_read"
  on storage.objects for select
  using (bucket_id = 'playbook-logos');

-- Allow authenticated users to upload into this bucket (app writes via
-- service-role, but this also permits direct client uploads if we add them).
drop policy if exists "playbook_logos_auth_insert" on storage.objects;
create policy "playbook_logos_auth_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'playbook-logos');

drop policy if exists "playbook_logos_auth_update" on storage.objects;
create policy "playbook_logos_auth_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'playbook-logos');
