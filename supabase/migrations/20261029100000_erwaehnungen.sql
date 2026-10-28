-- Mentions and "For you".
-- Staff mention staff: the overlay creates a comment through annotation_add_comment() with the IDs of the
-- people it mentions; the database checks author and every mentioned person and refuses the whole
-- comment otherwise. Guests mention nobody and cannot be mentioned.
-- "For you" is a query, not stored notifications: mentions of me and replies by others in threads I
-- started, in every project my key may access (staff all, guests their own), without resolved threads.
-- Read state per person and thread: an entry is unread if its comment is newer than read_at. Marking
-- as read takes the time of the newest entry the overlay has loaded, so later entries stay unread.
-- Guests get "For you" only for their own project, without domain, and read no mentions.
-- Mention errors: SQLSTATE AN001 with a readable message.
-- Idempotent, so a database that already has it can run it again.

-- Both tables use a surrogate key: with a composite primary key of two foreign keys PostgREST treats them
-- as junction tables between comments and annotation_people, and the overlay's embed
-- author:annotation_people(...) fails as ambiguous (PGRST201).
create table if not exists public.annotation_mentions (
  id bigint generated always as identity primary key,
  comment_id uuid not null references public.comments (id) on delete cascade,
  person_id uuid not null references public.annotation_people (id) on delete cascade,
  unique (comment_id, person_id)
);

create index if not exists annotation_mentions_person_idx on public.annotation_mentions (person_id);

alter table public.annotation_mentions enable row level security;
revoke all on public.annotation_mentions from anon, authenticated;
-- Readable for the overlay's comment query (embedded per comment); written only by annotation_add_comment().
grant select on public.annotation_mentions to anon;

-- Staff only (guests see no highlighting). Staff read the comments of every project
-- (annotation_my_projects), so no check per comment is needed. The sub-select is built once per query.
drop policy if exists mentions_select on public.annotation_mentions;
create policy mentions_select on public.annotation_mentions
  for select to anon
  using (
    exists (select 1 from public.annotation_people me where me.id = (select public.annotation_me()) and not me.is_guest)
  );

create table if not exists public.annotation_reads (
  id bigint generated always as identity primary key,
  person_id uuid not null references public.annotation_people (id) on delete cascade,
  thread_id uuid not null references public.comments (id) on delete cascade,
  read_at timestamptz not null default now(),
  unique (person_id, thread_id)
);

-- Deleting a thread cascades here; without an index on thread_id that scans the whole table.
create index if not exists annotation_reads_thread_idx on public.annotation_reads (thread_id);

alter table public.annotation_reads enable row level security;
revoke all on public.annotation_reads from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Staff who can be mentioned: not a guest and with a current key.
-- ---------------------------------------------------------------------------
-- For the mention picker: ID and name of all staff, only for a staff key. Guests and invalid keys get nothing.
create or replace function public.annotation_staff_directory()
returns table (person_id uuid, display_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name
  from public.annotation_people p
  where not p.is_guest
    and p.key_hash is not null
    and exists (select 1 from public.annotation_people me where me.id = public.annotation_me() and not me.is_guest)
  order by p.display_name, p.id;
$$;

-- Create a comment or reply, optionally with mentions. Author, access and parent are checked by the
-- comments trigger as for a direct insert; mentions are checked here. Any error leaves nothing behind.
-- Returns the new row, so PostgREST can embed author and mentions like in the overlay's comment query.
create or replace function public.annotation_add_comment(
  p_project_id text,
  p_page_path text,
  p_text text,
  p_selector text default null,
  p_rect jsonb default null,
  p_parent_id uuid default null,
  p_mentions uuid[] default '{}'
)
returns setof public.comments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.comments;
  v_ids uuid[] := array(select distinct m from unnest(coalesce(p_mentions, '{}')) m);
begin
  -- The trigger sets author and time and refuses without access (42501) or with an invalid parent (23503).
  insert into public.comments (project_id, page_path, selector, rect, text, parent_id)
  values (p_project_id, p_page_path, p_selector, p_rect, p_text, p_parent_id)
  returning * into v_row;

  if cardinality(v_ids) > 0 then
    if not exists (select 1 from public.annotation_people p where p.id = v_row.author_id and not p.is_guest) then
      raise exception 'Guests cannot mention anyone.' using errcode = 'AN001';
    end if;
    if cardinality(v_ids) > 10 then
      raise exception 'At most 10 people can be mentioned in one comment.' using errcode = 'AN001';
    end if;
    if exists (
      select 1 from unnest(v_ids) m
      where m is null or not exists (
        select 1 from public.annotation_people p where p.id = m and not p.is_guest and p.key_hash is not null)
    ) then
      raise exception 'Only staff members can be mentioned.' using errcode = 'AN001';
    end if;

    insert into public.annotation_mentions (comment_id, person_id)
    select v_row.id, m from unnest(v_ids) m;
  end if;

  return next v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- For you
-- ---------------------------------------------------------------------------
-- Entries of the key's person, newest first. A reply that also mentions me is one entry (mention).
-- My own comments never create entries. project_domain: first domain in alphabetical order (null without,
-- and always null for guests, who never jump to another project). text_start: the first 140 characters of
-- the comment that created the entry.
create or replace function public.annotation_for_you()
returns table (
  project_id text,
  project_name text,
  project_domain text,
  page_path text,
  thread_id uuid,
  comment_id uuid,
  kind text,
  actor_name text,
  text_start text,
  created_at timestamptz,
  is_read boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select p.id, p.is_guest, public.annotation_my_projects() as projects
    from public.annotation_people p
    where p.id = public.annotation_me()
  ),
  events as (
    select distinct on (e.comment_id) e.comment_id, e.kind
    from (
      select m.comment_id, 'mention' as kind
      from public.annotation_mentions m, me
      where m.person_id = me.id
      union all
      select r.id, 'reply'
      from public.comments t
      join public.comments r on r.parent_id = t.id
      cross join me
      where t.author_id = me.id and t.parent_id is null
    ) e
    order by e.comment_id, e.kind  -- 'mention' before 'reply'
  )
  select c.project_id, pr.name,
    case when not me.is_guest then
      (select min(d.host) from public.annotation_project_domains d where d.project_id = c.project_id) end,
    t.page_path, t.id, c.id, e.kind, a.display_name, left(c.text, 140), c.created_at,
    exists (
      select 1 from public.annotation_reads rd
      where rd.person_id = me.id and rd.thread_id = t.id and rd.read_at >= c.created_at)
  from events e
  cross join me
  join public.comments c on c.id = e.comment_id
  join public.comments t on t.id = coalesce(c.parent_id, c.id)
  join public.annotation_projects pr on pr.id = c.project_id
  join public.annotation_people a on a.id = c.author_id
  where c.author_id <> me.id
    and c.project_id = any (me.projects)
    and not t.resolved
  order by c.created_at desc, c.id;
$$;

-- Opening a thread: its entries up to p_until (created_at of the newest comment the overlay has loaded
-- in it) are read for me; later ones stay unread, also from a transaction still open. Never in the future,
-- never backwards. Threads I may not access are ignored.
create or replace function public.annotation_mark_read(p_thread_id uuid, p_until timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.annotation_me();
begin
  if v_me is null then
    raise exception 'invalid key' using errcode = '28000';
  end if;
  if p_until is null then
    raise exception 'p_until is required' using errcode = '22004';
  end if;

  insert into public.annotation_reads as r (person_id, thread_id, read_at)
  select v_me, t.id, least(p_until, now())
  from public.comments t
  where t.id = p_thread_id
    and t.parent_id is null
    and t.project_id = any (public.annotation_my_projects())
  on conflict (person_id, thread_id) do update set read_at = greatest(r.read_at, excluded.read_at);
end;
$$;

-- "Mark all as read": my unread entries up to p_until (created_at of the newest loaded entry), same rules.
create or replace function public.annotation_mark_all_read(p_until timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.annotation_me();
begin
  if v_me is null then
    raise exception 'invalid key' using errcode = '28000';
  end if;
  if p_until is null then
    raise exception 'p_until is required' using errcode = '22004';
  end if;

  insert into public.annotation_reads as r (person_id, thread_id, read_at)
  select distinct v_me, f.thread_id, least(p_until, now())
  from public.annotation_for_you() f
  where not f.is_read
  on conflict (person_id, thread_id) do update set read_at = greatest(r.read_at, excluded.read_at);
end;
$$;

-- Supabase grants EXECUTE to anon and authenticated by default; only the new functions here.
revoke all on function public.annotation_staff_directory() from public, anon, authenticated;
revoke all on function public.annotation_add_comment(text, text, text, text, jsonb, uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.annotation_for_you() from public, anon, authenticated;
revoke all on function public.annotation_mark_read(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.annotation_mark_all_read(timestamptz) from public, anon, authenticated;

grant execute on function public.annotation_staff_directory() to anon;
grant execute on function public.annotation_add_comment(text, text, text, text, jsonb, uuid, uuid[]) to anon;
grant execute on function public.annotation_for_you() to anon;
grant execute on function public.annotation_mark_read(uuid, timestamptz) to anon;
grant execute on function public.annotation_mark_all_read(timestamptz) to anon;

-- ---------------------------------------------------------------------------
-- Handoff: one-time code for a jump from "For you" into another project
-- ---------------------------------------------------------------------------
-- The key lives in the browser per domain. Clicking an entry of another project asks for a code
-- (256 bits, valid 2 minutes, staff only, bound to person and target project) and passes it in the
-- link; the target page redeems it once and gets the key back. The plain key is never stored: the row
-- holds the hash of the code and the key encrypted with the code, so only whoever holds the code
-- (the link) can decrypt it, and the code itself exists only as its hash.
create table if not exists public.annotation_handoffs (
  code_hash bytea primary key,
  person_id uuid not null references public.annotation_people (id) on delete cascade,
  project_id text not null references public.annotation_projects (id) on delete cascade,
  key_cipher bytea not null,
  expires_at timestamptz not null
);

alter table public.annotation_handoffs enable row level security;
revoke all on public.annotation_handoffs from anon, authenticated;

-- For the key in the header (staff only): a code for p_project_id. Expired codes are removed.
create or replace function public.annotation_handoff_create(p_project_id text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.annotation_me();
  v_code text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  if v_me is null then
    raise exception 'invalid key' using errcode = '28000';
  end if;
  if exists (select 1 from public.annotation_people p where p.id = v_me and p.is_guest) then
    raise exception 'Only staff members can jump to another project.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.annotation_projects pr where pr.id = p_project_id) then
    raise exception 'unknown project' using errcode = '22023';
  end if;

  delete from public.annotation_handoffs h where h.expires_at <= now();
  insert into public.annotation_handoffs (code_hash, person_id, project_id, key_cipher, expires_at)
  values (
    extensions.digest(v_code, 'sha256'), v_me, p_project_id,
    extensions.pgp_sym_encrypt(
      current_setting('request.headers', true)::json ->> 'x-annotation-key', v_code, 'cipher-algo=aes256'),
    now() + interval '2 minutes');
  return v_code;
end;
$$;

-- For the target page, without a key: the key of the code's person, if the code is current and the page
-- (host as for whoami) belongs to its project, and the key is still that person's. Otherwise null.
-- A code is gone after the first attempt that finds it, also a failed one; expired codes are removed.
create or replace function public.annotation_handoff_redeem(p_code text, p_host text, p_project_id text default null)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.annotation_handoffs;
  v_key text;
begin
  delete from public.annotation_handoffs h where h.expires_at <= now();
  delete from public.annotation_handoffs h where h.code_hash = extensions.digest(p_code, 'sha256')
  returning * into v_row;
  if not found or v_row.project_id is distinct from public.annotation_resolve_project(p_host, p_project_id) then
    return null;
  end if;

  v_key := extensions.pgp_sym_decrypt(v_row.key_cipher, p_code);
  if not exists (
    select 1 from public.annotation_people p
    where p.id = v_row.person_id and p.key_hash = extensions.digest(v_key, 'sha256')
  ) then
    return null;
  end if;
  return v_key;
end;
$$;

revoke all on function public.annotation_handoff_create(text) from public, anon, authenticated;
revoke all on function public.annotation_handoff_redeem(text, text, text) from public, anon, authenticated;
grant execute on function public.annotation_handoff_create(text) to anon;
grant execute on function public.annotation_handoff_redeem(text, text, text) to anon;
