-- Access checks once per query instead of once per row, and readable admin errors.
-- Reading comments checked the key once per row (annotation_person_for per row): about 0.9 s for
-- 5000 comments. The policies now ask once per query which projects the key may access.
-- Same access as before: staff all projects, guests their own, nobody without a valid key.
-- Idempotent, so a database that already has it can run it again.

create or replace function public.annotation_my_projects()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(pr.id), '{}')
  from public.annotation_people p
  join public.annotation_projects pr on p.project_id is null or pr.id = p.project_id
  where p.id = public.annotation_me();
$$;

revoke all on function public.annotation_my_projects() from public, anon, authenticated;
grant execute on function public.annotation_my_projects() to anon;

-- The rule "staff all projects, guests their own" lives only in annotation_my_projects.
-- create or replace keeps the privileges.
create or replace function public.annotation_person_for(p_project_id text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select public.annotation_me() where p_project_id = any (public.annotation_my_projects());
$$;

-- The sub-selects make Postgres evaluate the functions once per query (InitPlan), not per row.
drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments
  for select to anon
  using (project_id = any ((select public.annotation_my_projects())::text[]));

drop policy if exists comments_update on public.comments;
create policy comments_update on public.comments
  for update to anon
  using (project_id = any ((select public.annotation_my_projects())::text[]))
  with check (project_id = any ((select public.annotation_my_projects())::text[]));

-- Delete own comments only; the foreign key rejects threads with replies (on delete restrict).
drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments
  for delete to anon
  using (
    author_id = (select public.annotation_me())
    and project_id = any ((select public.annotation_my_projects())::text[])
  );

-- Visible: yourself and authors of comments you may read (the RLS of comments applies). The author
-- list is built once per query; the correlated exists ran per row when the overlay embeds the author.
drop policy if exists people_select on public.annotation_people;
create policy people_select on public.annotation_people
  for select to anon
  using (id = (select public.annotation_me()) or id in (select c.author_id from public.comments c));

-- ---------------------------------------------------------------------------
-- Admin: readable errors instead of constraint texts, which name the constraint or the whole row.
-- ---------------------------------------------------------------------------
-- Replace the domains of a project. Duplicates in one call count once; a domain of another project
-- is refused with its host.
create or replace function public.annotation_replace_domains(p_project_id text, p_domains text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hosts text[] := array(select distinct lower(btrim(h)) from unnest(p_domains) h where btrim(h) <> '');
  v_host text;
begin
  select h into v_host from unnest(v_hosts) h where h !~ '^[a-z0-9.-]+(:[0-9]{1,5})?$' limit 1;
  if v_host is not null then
    raise exception 'Invalid domain: %. Use the host with an optional port, e.g. example.com or localhost:3000.', v_host
      using errcode = '23514';
  end if;

  delete from public.annotation_project_domains where project_id = p_project_id;
  begin
    insert into public.annotation_project_domains (host, project_id)
    select h, p_project_id from unnest(v_hosts) h;
  exception when unique_violation then
    select d.host into v_host from public.annotation_project_domains d
    where d.host = any (v_hosts) and d.project_id <> p_project_id
    limit 1;
    raise exception 'Domain % already belongs to another project; remove it there first.', coalesce(v_host, '')
      using errcode = '23505';
  end;
end;
$$;

revoke all on function public.annotation_replace_domains(text, text[]) from public, anon, authenticated;

create or replace function public.annotation_set_project(p_id text, p_name text, p_domains text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.annotation_projects (id, name) values (p_id, btrim(p_name))
  on conflict (id) do update set name = excluded.name;

  perform public.annotation_replace_domains(p_id, p_domains);
end;
$$;

create or replace function public.annotation_add_staff(p_email text, p_first_name text, p_last_name text default null)
returns table (person_id uuid, key text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_id uuid;
  v_email text := lower(btrim(p_email));
  v_first text := public.annotation_clean_name(p_first_name);
  v_last text := nullif(public.annotation_clean_name(p_last_name), '');
  v_key text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  if coalesce(v_email, '') !~ '^[^@[:space:]]+@dayone\.de$' then
    raise exception 'Only @dayone.de e-mail addresses.' using errcode = '23514';
  end if;
  if coalesce(v_first, '') = '' or not public.annotation_name_ok(concat_ws(' ', v_first, v_last)) then
    raise exception 'Name not allowed: first and last name together may have at most 48 characters and need at least two letters or digits.'
      using errcode = '23514';
  end if;

  begin
    insert into public.annotation_people (email, first_name, last_name, display_name, key_hash)
    values (v_email, v_first, v_last, concat_ws(' ', v_first, v_last), extensions.digest(v_key, 'sha256'))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'E-mail % is already registered.', v_email using errcode = '23505';
  end;

  return query select v_id, v_key;
end;
$$;
