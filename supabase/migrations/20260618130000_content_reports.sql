-- Content reporting (App Store Guideline 1.2): a mechanism for users to report
-- objectionable content and abusive behavior, routed to an admin review queue.
-- Covers the cross-user surfaces: playbook chat messages, shared plays, Coach
-- Cal AI responses, and profiles. Mirrors the coach_ai_refusals pattern
-- (0156): locked-down table + admin-only reads + a security-definer RPC for the
-- write so the insert shape is controlled.

create table public.content_reports (
  id uuid primary key default gen_random_uuid(),
  -- Nullable + ON DELETE SET NULL so a report survives the reporter deleting
  -- their account, and so anonymous viewers of a public shared play can report.
  reporter_id uuid references auth.users(id) on delete set null,
  content_type text not null check (
    content_type in ('playbook_message', 'shared_play', 'profile', 'cal_response', 'other')
  ),
  -- Free-form pointer to the reported thing: message id, share token, user id,
  -- or a Cal turn reference. Kept as text since the referent type varies.
  content_ref text,
  playbook_id uuid references public.playbooks(id) on delete set null,
  reason text not null,
  details text,
  -- Snapshot of the offending content at report time (truncated). Lets admins
  -- review even if the author later edits/deletes it.
  reported_text text,
  status text not null default 'open' check (
    status in ('open', 'reviewed', 'actioned', 'dismissed')
  ),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null
);

create index content_reports_created_at_idx
  on public.content_reports (created_at desc);

create index content_reports_open_idx
  on public.content_reports (created_at desc)
  where status = 'open';

alter table public.content_reports enable row level security;

-- Only admins can read / mutate the queue. Writes go through the RPC below.
create policy "admins read content reports"
  on public.content_reports for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "admins update content reports"
  on public.content_reports for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "admins delete content reports"
  on public.content_reports for delete
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- File a report. Security-definer so it can insert past the locked-down RLS;
-- reporter_id is taken from auth.uid() (NULL for anonymous viewers of a public
-- shared play). Returns the new report id. Inputs are length-capped here so a
-- client can't store unbounded blobs.
create or replace function public.file_content_report(
  p_content_type text,
  p_content_ref text,
  p_playbook_id uuid,
  p_reason text,
  p_details text,
  p_reported_text text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;

  insert into public.content_reports (
    reporter_id, content_type, content_ref, playbook_id, reason, details, reported_text
  ) values (
    auth.uid(),
    p_content_type,
    nullif(left(coalesce(p_content_ref, ''), 400), ''),
    p_playbook_id,
    left(p_reason, 200),
    nullif(left(coalesce(p_details, ''), 2000), ''),
    nullif(left(coalesce(p_reported_text, ''), 4000), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- Anyone (incl. anonymous viewers of a public shared play) may file a report.
grant execute on function public.file_content_report(text, text, uuid, text, text, text)
  to anon, authenticated;
