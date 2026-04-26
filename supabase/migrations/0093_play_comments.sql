-- Play Comments (beta)
--
-- Per-play discussion threads, with one level of replies and lightweight
-- reactions (likes for v1). Visibility is strictly playbook-members-only and
-- enforced by RLS via can_view_playbook. Posting requires view access; editing
-- and deleting are restricted to the author. Coach-side moderation hooks
-- (approval, hide) are present in the schema but unused in v1.
--
-- Per-playbook on/off toggle lets coaches disable discussion for a playbook
-- without disabling the global beta flag. Server actions must check both.

-- ─── Per-playbook toggle ─────────────────────────────────────────────────
alter table public.playbooks
  add column if not exists comments_enabled boolean not null default false;

-- ─── Comments ────────────────────────────────────────────────────────────
create table public.play_comments (
  id uuid primary key default gen_random_uuid(),
  play_id uuid not null references public.plays (id) on delete cascade,
  -- Optional: anchor to a specific version. v1 leaves null (play-level threads).
  play_version_id uuid references public.play_versions (id) on delete set null,
  -- One level of nesting. parent_id null → top-level; non-null → reply.
  parent_id uuid references public.play_comments (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 4000),
  -- Moderation hooks (unused in v1; reserved for coach pre-approval flow).
  approved_at timestamptz,
  approved_by uuid references public.profiles (id) on delete set null,
  hidden_at timestamptz,
  hidden_by uuid references public.profiles (id) on delete set null,
  -- Soft delete preserves audit trail; needed for minor-data incident response.
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

-- Replies cannot be replies-to-replies (flat threading).
create or replace function public.play_comments_enforce_flat_threading()
returns trigger as $$
begin
  if new.parent_id is not null then
    if exists (
      select 1 from public.play_comments p
      where p.id = new.parent_id and p.parent_id is not null
    ) then
      raise exception 'play_comments: replies must target a top-level comment';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger play_comments_flat_threading
  before insert or update of parent_id on public.play_comments
  for each row execute function public.play_comments_enforce_flat_threading();

create index play_comments_play_idx
  on public.play_comments (play_id, created_at)
  where deleted_at is null;
create index play_comments_parent_idx
  on public.play_comments (parent_id)
  where parent_id is not null and deleted_at is null;
create index play_comments_author_idx
  on public.play_comments (author_id);

alter table public.play_comments enable row level security;

-- Read: any playbook member.
create policy play_comments_select on public.play_comments
  for select using (
    exists (
      select 1 from public.plays p
      where p.id = play_id and public.can_view_playbook(p.playbook_id)
    )
  );

-- Insert: any playbook member, must be self-authored, and the playbook must
-- have comments turned on. Comments_enabled is checked here for defense-in-depth;
-- server actions should also gate on the global beta flag.
create policy play_comments_insert on public.play_comments
  for insert with check (
    author_id = auth.uid()
    and exists (
      select 1
      from public.plays p
      join public.playbooks pb on pb.id = p.playbook_id
      where p.id = play_id
        and pb.comments_enabled = true
        and public.can_view_playbook(p.playbook_id)
    )
  );

-- Update: only the author, only their own row, only on a playbook they can
-- still view. Coach moderation (approve/hide) goes through a server action
-- using the service role and is not expressed as an RLS policy.
create policy play_comments_update_own on public.play_comments
  for update using (
    author_id = auth.uid()
    and exists (
      select 1 from public.plays p
      where p.id = play_id and public.can_view_playbook(p.playbook_id)
    )
  )
  with check (author_id = auth.uid());

-- Delete: only the author. Soft-delete is preferred (set deleted_at) but a
-- hard delete by the author is allowed.
create policy play_comments_delete_own on public.play_comments
  for delete using (author_id = auth.uid());

-- ─── Reactions (likes for v1) ────────────────────────────────────────────
create type public.play_comment_reaction_kind as enum ('like');

create table public.play_comment_reactions (
  comment_id uuid not null references public.play_comments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.play_comment_reaction_kind not null default 'like',
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id, kind)
);

create index play_comment_reactions_user_idx
  on public.play_comment_reactions (user_id);

alter table public.play_comment_reactions enable row level security;

-- Read: anyone who can read the underlying comment.
create policy play_comment_reactions_select on public.play_comment_reactions
  for select using (
    exists (
      select 1
      from public.play_comments c
      join public.plays p on p.id = c.play_id
      where c.id = comment_id and public.can_view_playbook(p.playbook_id)
    )
  );

-- Insert: self only, and the comment must be visible.
create policy play_comment_reactions_insert on public.play_comment_reactions
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.play_comments c
      join public.plays p on p.id = c.play_id
      where c.id = comment_id and public.can_view_playbook(p.playbook_id)
    )
  );

-- Delete: self only.
create policy play_comment_reactions_delete on public.play_comment_reactions
  for delete using (user_id = auth.uid());
