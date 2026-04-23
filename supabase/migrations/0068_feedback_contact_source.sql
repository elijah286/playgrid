-- Let the feedback log also carry submissions from the public contact
-- form. Those come from anonymous visitors, so user_id becomes nullable
-- and we add name/email columns to capture the sender. A `source`
-- discriminator lets the admin UI distinguish widget vs contact.

alter table public.feedback
  alter column user_id drop not null;

alter table public.feedback
  add column if not exists name text,
  add column if not exists email text,
  add column if not exists source text not null default 'widget'
    check (source in ('widget', 'contact'));

-- Anonymous contact-form rows: let the service role (server route) write
-- them without any auth context. The existing "admin read" policy still
-- gates reads; the existing "feedback insert own" policy still covers
-- signed-in widget inserts.
drop policy if exists "feedback insert contact anon" on public.feedback;
create policy "feedback insert contact anon"
  on public.feedback
  for insert
  to anon, authenticated
  with check (
    source = 'contact'
    and user_id is null
    and name is not null
    and email is not null
  );
