-- RPC for a signed-in user to update only the positions column on their
-- own playbook_members row. Existing pm_update RLS restricts UPDATE to
-- editors/owners; this RPC narrowly grants self-service for positions
-- without widening RLS or letting a viewer escalate their role.

create or replace function public.set_my_positions(
  p_playbook_id uuid,
  p_positions text[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cleaned text[];
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;

  -- Dedupe, trim, drop empties, cap length/count.
  select coalesce(array_agg(distinct trim(p) order by trim(p)), '{}')
  into cleaned
  from unnest(coalesce(p_positions, '{}')) as p
  where trim(p) <> '' and length(trim(p)) <= 12;

  if array_length(cleaned, 1) > 8 then
    cleaned := cleaned[1:8];
  end if;

  update public.playbook_members
  set positions = cleaned,
      position = case when array_length(cleaned, 1) >= 1 then cleaned[1] else null end
  where playbook_id = p_playbook_id and user_id = uid;
end;
$$;

grant execute on function public.set_my_positions(uuid, text[]) to authenticated;
