drop extension if exists "pg_net";

create type "public"."playbook_role" as enum ('owner', 'editor', 'viewer');


  create table "public"."playbook_members" (
    "playbook_id" uuid not null,
    "user_id" uuid not null,
    "role" public.playbook_role not null default 'viewer'::public.playbook_role,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."playbook_members" enable row level security;

alter table "public"."playbooks" add column "color" text;

alter table "public"."playbooks" add column "logo_url" text;

CREATE UNIQUE INDEX playbook_members_pkey ON public.playbook_members USING btree (playbook_id, user_id);

CREATE INDEX playbook_members_user_idx ON public.playbook_members USING btree (user_id);

alter table "public"."playbook_members" add constraint "playbook_members_pkey" PRIMARY KEY using index "playbook_members_pkey";

alter table "public"."playbook_members" add constraint "playbook_members_playbook_id_fkey" FOREIGN KEY (playbook_id) REFERENCES public.playbooks(id) ON DELETE CASCADE not valid;

alter table "public"."playbook_members" validate constraint "playbook_members_playbook_id_fkey";

alter table "public"."playbook_members" add constraint "playbook_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."playbook_members" validate constraint "playbook_members_user_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.can_edit_playbook(pb uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    exists (
      select 1
      from public.playbooks p
      join public.teams t on t.id = p.team_id
      where p.id = pb and public.is_org_owner(t.org_id)
    )
    or exists (
      select 1
      from public.playbook_members m
      where m.playbook_id = pb and m.user_id = auth.uid()
        and m.role in ('owner', 'editor')
    );
$function$
;

CREATE OR REPLACE FUNCTION public.can_view_playbook(pb uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    exists (
      select 1
      from public.playbooks p
      join public.teams t on t.id = p.team_id
      where p.id = pb and public.is_org_owner(t.org_id)
    )
    or exists (
      select 1
      from public.playbook_members m
      where m.playbook_id = pb and m.user_id = auth.uid()
    );
$function$
;

grant delete on table "public"."playbook_members" to "anon";

grant insert on table "public"."playbook_members" to "anon";

grant references on table "public"."playbook_members" to "anon";

grant select on table "public"."playbook_members" to "anon";

grant trigger on table "public"."playbook_members" to "anon";

grant truncate on table "public"."playbook_members" to "anon";

grant update on table "public"."playbook_members" to "anon";

grant delete on table "public"."playbook_members" to "authenticated";

grant insert on table "public"."playbook_members" to "authenticated";

grant references on table "public"."playbook_members" to "authenticated";

grant select on table "public"."playbook_members" to "authenticated";

grant trigger on table "public"."playbook_members" to "authenticated";

grant truncate on table "public"."playbook_members" to "authenticated";

grant update on table "public"."playbook_members" to "authenticated";

grant delete on table "public"."playbook_members" to "service_role";

grant insert on table "public"."playbook_members" to "service_role";

grant references on table "public"."playbook_members" to "service_role";

grant select on table "public"."playbook_members" to "service_role";

grant trigger on table "public"."playbook_members" to "service_role";

grant truncate on table "public"."playbook_members" to "service_role";

grant update on table "public"."playbook_members" to "service_role";


  create policy "play_versions_member_select"
  on "public"."play_versions"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.plays p
  WHERE ((p.id = play_versions.play_id) AND public.can_view_playbook(p.playbook_id)))));



  create policy "play_versions_member_write"
  on "public"."play_versions"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.plays p
  WHERE ((p.id = play_versions.play_id) AND public.can_edit_playbook(p.playbook_id)))))
with check ((EXISTS ( SELECT 1
   FROM public.plays p
  WHERE ((p.id = play_versions.play_id) AND public.can_edit_playbook(p.playbook_id)))));



  create policy "pm_delete"
  on "public"."playbook_members"
  as permissive
  for delete
  to public
using (((user_id = auth.uid()) OR public.can_edit_playbook(playbook_id)));



  create policy "pm_insert"
  on "public"."playbook_members"
  as permissive
  for insert
  to public
with check (public.can_edit_playbook(playbook_id));



  create policy "pm_select_self"
  on "public"."playbook_members"
  as permissive
  for select
  to public
using (((user_id = auth.uid()) OR public.can_edit_playbook(playbook_id)));



  create policy "pm_update"
  on "public"."playbook_members"
  as permissive
  for update
  to public
using (public.can_edit_playbook(playbook_id))
with check (public.can_edit_playbook(playbook_id));



  create policy "playbooks_member_select"
  on "public"."playbooks"
  as permissive
  for select
  to public
using (public.can_view_playbook(id));



  create policy "playbooks_member_update"
  on "public"."playbooks"
  as permissive
  for update
  to public
using (public.can_edit_playbook(id))
with check (public.can_edit_playbook(id));



  create policy "plays_member_select"
  on "public"."plays"
  as permissive
  for select
  to public
using (public.can_view_playbook(playbook_id));



  create policy "plays_member_write"
  on "public"."plays"
  as permissive
  for all
  to public
using (public.can_edit_playbook(playbook_id))
with check (public.can_edit_playbook(playbook_id));



  create policy "playbook_logos_auth_insert"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check ((bucket_id = 'playbook-logos'::text));



  create policy "playbook_logos_auth_update"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using ((bucket_id = 'playbook-logos'::text));



  create policy "playbook_logos_public_read"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'playbook-logos'::text));



