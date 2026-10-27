-- Central DAYONE annotation schema: one database for all projects.
-- Access by key, without Supabase Auth: the browser sends its key with every request
-- in the x-annotation-key header (role anon); RLS checks person and project access.
--   Projects: name and domains (host incl. port); the overlay finds its project by location.host.
--   Staff: DAYONE e-mail, first name, optional last name; a personal key for all projects,
--     name fixed by the list.
--   Guests: one link per project (project key). On first visit only a name; this creates the
--     browser's own key. A new project link disables the old one and every guest who joined through it.
-- Only the SHA-256 of each key is stored. Administration: scripts/annotation-admin.mjs (service role).

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Names: remove invisible characters (control characters, tabs, line breaks, zero-width, bidi),
-- treat no-break spaces as spaces, normalise to NFC, trim.
-- Valid: at most 48 characters (code points, combining marks count), at least 2 letters or digits.
-- ---------------------------------------------------------------------------
create function public.annotation_clean_name(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(
    regexp_replace(normalize(p_name, NFC), '[\u0000-\u001F\u007F-\u009F\u00AD\u180E\u200B-\u200F\u2028-\u202F\u2060-\u206F\uFEFF]', '', 'g'),
    '[\u00A0\u2000-\u200A\u3000]', ' ', 'g'));
$$;

create function public.annotation_name_ok(p_name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select char_length(p_name) <= 48
    and p_name ~ '[[:alnum:]].*[[:alnum:]]'
    and p_name = public.annotation_clean_name(p_name);
$$;

-- ---------------------------------------------------------------------------
-- Projects and domains: not visible through the API.
-- ---------------------------------------------------------------------------
create table public.annotation_projects (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  -- Project link for guests; every renewal increments key_generation and locks out all earlier guests.
  key_hash bytea unique,
  key_generation integer not null default 0,
  -- Secret realtime topic: only people with valid access learn it; re-rolled on every revocation.
  realtime_topic uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now()
);

alter table public.annotation_projects enable row level security;
revoke all on public.annotation_projects from anon, authenticated;

create table public.annotation_project_domains (
  host text primary key check (host ~ '^[a-z0-9.-]+(:[0-9]{1,5})?$'),
  project_id text not null references public.annotation_projects (id) on delete cascade
);

alter table public.annotation_project_domains enable row level security;
revoke all on public.annotation_project_domains from anon, authenticated;

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------
create table public.annotation_people (
  id uuid primary key default gen_random_uuid(),
  -- null = staff (all projects), otherwise a guest in exactly this project.
  project_id text references public.annotation_projects (id) on delete cascade,
  -- Guests are valid only while the project link of their generation is current.
  key_generation integer,
  email text unique check (email = lower(btrim(email)) and email ~ '^[^@[:space:]]+@dayone\.de$'),
  first_name text check (char_length(first_name) between 1 and 48 and first_name = public.annotation_clean_name(first_name)),
  last_name text check (char_length(last_name) between 1 and 48 and last_name = public.annotation_clean_name(last_name)),
  display_name text not null check (public.annotation_name_ok(display_name)),
  is_guest boolean generated always as (project_id is not null) stored,
  key_hash bytea unique,
  created_at timestamptz not null default now(),
  constraint annotation_people_art check (
    (project_id is null and key_generation is null and email is not null and first_name is not null)
    or (project_id is not null and key_generation is not null and email is null and first_name is null and last_name is null)
  )
);

alter table public.annotation_people enable row level security;
revoke all on public.annotation_people from anon, authenticated;
-- Readable: id, name and guest flag only; never e-mail, project or key_hash.
grant select (id, display_name, is_guest) on public.annotation_people to anon;

-- ---------------------------------------------------------------------------
-- Comments: author_id is the person; annotation_people supplies the name when reading.
-- ---------------------------------------------------------------------------
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.annotation_projects (id),
  page_path text not null check (char_length(page_path) between 1 and 512),
  selector text check (char_length(selector) <= 2048),
  rect jsonb,
  text text not null check (char_length(text) between 1 and 10000),
  author_id uuid not null references public.annotation_people (id),
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  -- A thread with replies cannot be deleted, only resolved (also with a concurrent insert).
  parent_id uuid references public.comments (id) on delete restrict
);

create index comments_project_created_idx on public.comments (project_id, created_at);
create index comments_parent_idx on public.comments (parent_id);
create index comments_author_idx on public.comments (author_id);

alter table public.comments enable row level security;
-- TRUNCATE bypasses RLS, so privileges are explicit instead of the Supabase default (all).
revoke all on public.comments from anon, authenticated;
grant select, delete on public.comments to anon;
-- Author, status and timestamps are set by the server (trigger); the browser does not send them.
grant insert (id, project_id, page_path, selector, rect, text, parent_id) on public.comments to anon;
-- Anyone in the project may resolve, only the author may move (trigger); the database sets resolved_at.
grant update (rect, selector, resolved) on public.comments to anon;

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
-- Person for the key in the header; null without, with an invalid or revoked key
-- and for guests whose project link was renewed.
create function public.annotation_me()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.annotation_people p
  left join public.annotation_projects pr on pr.id = p.project_id
  where p.key_hash = extensions.digest(
      nullif(nullif(current_setting('request.headers', true), '')::json ->> 'x-annotation-key', ''),
      'sha256')
    and (p.project_id is null or p.key_generation = pr.key_generation);
$$;

-- Person, if they may access the (registered) project: staff everywhere, guests in their own.
create function public.annotation_person_for(p_project_id text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.annotation_people p
  where p.id = public.annotation_me()
    and exists (select 1 from public.annotation_projects pr where pr.id = p_project_id)
    and (p.project_id is null or p.project_id = p_project_id);
$$;

-- Project of the page: override from the overlay, otherwise by domain.
create function public.annotation_resolve_project(p_host text, p_project_id text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(btrim(p_project_id), ''),
    (select d.project_id from public.annotation_project_domains d where d.host = lower(btrim(p_host))));
$$;

-- For the overlay: who am I on this page? Empty without access (the overlay then stays invisible).
create function public.annotation_whoami(p_host text, p_project_id text default null)
returns table (project_id text, person_id uuid, display_name text, is_guest boolean, realtime_topic uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select pr.id, p.id, p.display_name, p.is_guest, pr.realtime_topic
  from public.annotation_projects pr
  join public.annotation_people p on p.id = public.annotation_person_for(pr.id)
  where pr.id = public.annotation_resolve_project(p_host, p_project_id);
$$;

-- Is the project link valid for this page's project? Only then does the overlay ask for a name.
create function public.annotation_project_key_ok(p_key text, p_host text, p_project_id text default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.annotation_projects pr
    where pr.key_hash = extensions.digest(p_key, 'sha256')
      and pr.id = public.annotation_resolve_project(p_host, p_project_id));
$$;

-- A guest joins with project link and name; returns the browser's own key once.
create function public.annotation_join(p_key text, p_display_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project public.annotation_projects;
  v_name text := public.annotation_clean_name(p_display_name);
  v_key text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  select * into v_project from public.annotation_projects pr where pr.key_hash = extensions.digest(p_key, 'sha256');
  if v_project.id is null then
    raise exception 'invalid project link' using errcode = '28000';
  end if;
  -- Own message instead of a check violation, whose details would contain the whole row.
  if not public.annotation_name_ok(v_name) then
    raise exception 'invalid name' using errcode = '23514';
  end if;

  insert into public.annotation_people (project_id, key_generation, display_name, key_hash)
  values (v_project.id, v_project.key_generation, v_name, extensions.digest(v_key, 'sha256'));
  return v_key;
end;
$$;

-- Renaming is for guests only; staff carry the name from the list.
create function public.annotation_rename(p_display_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.annotation_me();
  v_name text := public.annotation_clean_name(p_display_name);
begin
  if v_me is null then
    raise exception 'invalid key' using errcode = '28000';
  end if;
  if not exists (select 1 from public.annotation_people p where p.id = v_me and p.is_guest) then
    raise exception 'staff names are fixed' using errcode = '42501';
  end if;
  if not public.annotation_name_ok(v_name) then
    raise exception 'invalid name' using errcode = '23514';
  end if;

  update public.annotation_people set display_name = v_name where id = v_me;
end;
$$;

-- ---------------------------------------------------------------------------
-- Trigger
-- ---------------------------------------------------------------------------
-- Author, time and status are set by the server, not the browser.
create function public.annotation_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.author_id := public.annotation_person_for(new.project_id);

  if new.author_id is null then
    raise exception 'no access to this project' using errcode = '42501';
  end if;

  -- Replies only to threads in the same project, no replies to replies.
  if new.parent_id is not null and not exists (
    select 1
    from public.comments c
    where c.id = new.parent_id
      and c.project_id = new.project_id
      and c.parent_id is null
  ) then
    raise exception 'invalid parent' using errcode = '23503';
  end if;

  new.created_at := now();
  new.resolved := false;
  new.resolved_at := null;
  return new;
end;
$$;

create trigger annotation_before_insert
before insert on public.comments
for each row execute function public.annotation_before_insert();

-- Only the author may move; resolved_at follows the resolved status.
create function public.annotation_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.rect, new.selector) is distinct from (old.rect, old.selector)
    and old.author_id is distinct from public.annotation_person_for(old.project_id) then
    raise exception 'only the author can move this thread' using errcode = '42501';
  end if;

  new.resolved_at := case
    when not new.resolved then null
    when old.resolved then old.resolved_at
    else now()
  end;
  return new;
end;
$$;

create trigger annotation_before_update
before update on public.comments
for each row execute function public.annotation_before_update();

-- Realtime: postgres_changes cannot see the key. Instead an empty ping goes to the project's secret
-- topic; the overlay then reloads with its key.
create function public.annotation_ping(p_project_id text)
returns void
language sql
security definer
set search_path = ''
as $$
  select realtime.send('{}'::jsonb, 'changed', 'annotation:' || pr.realtime_topic::text, false)
  from public.annotation_projects pr
  where pr.id = p_project_id;
$$;

-- One ping per statement and project, not per row: "resolve all" over N threads sends one ping.
-- Transition tables allow only one event per trigger, hence three triggers.
create function public.annotation_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.annotation_ping(p.project_id) from (select distinct project_id from new_rows) p;
  elsif tg_op = 'UPDATE' then
    perform public.annotation_ping(p.project_id)
    from (select project_id from new_rows union select project_id from old_rows) p;
  else
    perform public.annotation_ping(p.project_id) from (select distinct project_id from old_rows) p;
  end if;
  return null;
end;
$$;

create trigger annotation_notify_insert
after insert on public.comments
referencing new table as new_rows
for each statement execute function public.annotation_notify();

create trigger annotation_notify_update
after update on public.comments
referencing old table as old_rows new table as new_rows
for each statement execute function public.annotation_notify();

create trigger annotation_notify_delete
after delete on public.comments
referencing old table as old_rows
for each statement execute function public.annotation_notify();

-- Rename: ping every project the person commented in, so old comments switch immediately.
create function public.annotation_notify_rename()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.annotation_ping(c.project_id)
  from (select distinct project_id from public.comments where author_id = new.id) c;
  return null;
end;
$$;

create trigger annotation_notify_rename
after update of display_name on public.annotation_people
for each row when (old.display_name is distinct from new.display_name)
execute function public.annotation_notify_rename();

-- Revocation: a last ping on the old topic (valid browsers fetch the new one), then re-roll.
create function public.annotation_rotate_topics(p_project_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.annotation_ping(pr.id)
  from public.annotation_projects pr
  where p_project_id is null or pr.id = p_project_id;

  update public.annotation_projects
  set realtime_topic = gen_random_uuid()
  where p_project_id is null or id = p_project_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin (service_role only, via scripts/annotation-admin.mjs). Keys: 256 bit, returned once.
-- ---------------------------------------------------------------------------
-- Create a project or replace its name and domains.
create function public.annotation_set_project(p_id text, p_name text, p_domains text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.annotation_projects (id, name) values (p_id, btrim(p_name))
  on conflict (id) do update set name = excluded.name;

  delete from public.annotation_project_domains where project_id = p_id;
  insert into public.annotation_project_domains (host, project_id)
  select lower(btrim(h)), p_id from unnest(p_domains) h;
end;
$$;

-- New project link: the old link and every guest who joined through it stop working immediately.
create function public.annotation_new_project_key(p_project_id text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  update public.annotation_projects
  set key_hash = extensions.digest(v_key, 'sha256'), key_generation = key_generation + 1
  where id = p_project_id;

  if not found then
    raise exception 'unknown project' using errcode = 'P0002';
  end if;

  perform public.annotation_rotate_topics(p_project_id);
  return v_key;
end;
$$;

-- New personal key for staff; the old one stops working immediately.
create function public.annotation_new_key(p_person_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  update public.annotation_people
  set key_hash = extensions.digest(v_key, 'sha256')
  where id = p_person_id and not is_guest;

  if not found then
    raise exception 'unknown staff member' using errcode = 'P0002';
  end if;

  perform public.annotation_rotate_topics(null);
  return v_key;
end;
$$;

create function public.annotation_add_staff(p_email text, p_first_name text, p_last_name text default null)
returns table (person_id uuid, key text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_id uuid;
  v_first text := public.annotation_clean_name(p_first_name);
  v_last text := nullif(public.annotation_clean_name(p_last_name), '');
  v_key text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  insert into public.annotation_people (email, first_name, last_name, display_name, key_hash)
  values (lower(btrim(p_email)), v_first, v_last, concat_ws(' ', v_first, v_last), extensions.digest(v_key, 'sha256'))
  returning id into v_id;

  return query select v_id, v_key;
end;
$$;

-- Revocation for staff: delete the key. Comments and name remain.
create function public.annotation_revoke_key(p_person_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.annotation_people set key_hash = null where id = p_person_id and not is_guest;

  if not found then
    raise exception 'unknown staff member' using errcode = 'P0002';
  end if;

  perform public.annotation_rotate_topics(null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges (Supabase grants EXECUTE to anon and authenticated by default).
-- ---------------------------------------------------------------------------
do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname like 'annotation\_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;

-- For policies, checks and generated columns evaluated as anon.
grant execute on function public.annotation_clean_name(text) to anon;
grant execute on function public.annotation_name_ok(text) to anon;
grant execute on function public.annotation_me() to anon;
grant execute on function public.annotation_person_for(text) to anon;
-- For the overlay.
grant execute on function public.annotation_whoami(text, text) to anon;
grant execute on function public.annotation_project_key_ok(text, text, text) to anon;
grant execute on function public.annotation_join(text, text) to anon;
grant execute on function public.annotation_rename(text) to anon;
-- For the admin script.
grant execute on function public.annotation_set_project(text, text, text[]) to service_role;
grant execute on function public.annotation_new_project_key(text) to service_role;
grant execute on function public.annotation_new_key(uuid) to service_role;
grant execute on function public.annotation_add_staff(text, text, text) to service_role;
grant execute on function public.annotation_revoke_key(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Policies (anon only; authenticated has no privileges)
-- ---------------------------------------------------------------------------
-- Visible: yourself and authors of comments you may read (the RLS of comments applies).
create policy people_select on public.annotation_people
  for select to anon
  using (
    id = public.annotation_me()
    or exists (select 1 from public.comments c where c.author_id = annotation_people.id)
  );

create policy comments_select on public.comments
  for select to anon
  using (public.annotation_person_for(project_id) is not null);

create policy comments_insert on public.comments
  for insert to anon
  with check (public.annotation_person_for(project_id) is not null);

create policy comments_update on public.comments
  for update to anon
  using (public.annotation_person_for(project_id) is not null)
  with check (public.annotation_person_for(project_id) is not null);

-- Delete own comments only; the foreign key rejects threads with replies (on delete restrict).
create policy comments_delete on public.comments
  for delete to anon
  using (author_id = public.annotation_person_for(project_id));
