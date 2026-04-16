-- Allow anyone to read a play version referenced by an active share link (public view by token)
create policy play_versions_public_share_read on public.play_versions
  for select using (
    exists (
      select 1 from public.share_links sl
      where sl.resource_type = 'play_version'
        and sl.resource_id = play_versions.id
        and (sl.expires_at is null or sl.expires_at > now())
    )
  );
