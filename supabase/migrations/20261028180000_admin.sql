-- Admins: staff members flagged in the database may use the admin tile in the overlay.
-- The flag is set only by the service role (scripts/annotation-admin.mjs admin --person <id>);
-- it is neither readable nor writable through the API. The browser learns it only through
-- annotation_admin_me(), which checks the key in the x-annotation-key header, independent of the host.
-- After the admin check, guest link and staff reuse the service-role functions. Projects have their own
-- rules (see annotation_admin_set_project) and share annotation_replace_domains with the script.

alter table public.annotation_people add column if not exists is_admin boolean not null default false;
alter table public.annotation_people drop constraint if exists annotation_people_admin_staff;
alter table public.annotation_people
  add constraint annotation_people_admin_staff check (not is_admin or project_id is null);

-- The current guest link is also kept in plain text so admins can show it again (Arthur, 28.10.2026).
-- Guests are still checked against key_hash. annotation_projects has no privileges for anon or
-- authenticated and is not in a realtime publication; only annotation_admin_project() and the
-- service role read the plain text. Links created before this migration have none. Staff keys stay hashed only.
alter table public.annotation_projects add column if not exists link_key text;

-- Is the key in the header that of an admin? False without, with an invalid or revoked key.
create or replace function public.annotation_admin_me()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.is_admin from public.annotation_people p where p.id = public.annotation_me()), false);
$$;

create or replace function public.annotation_require_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.annotation_admin_me() then
    raise exception 'admins only' using errcode = '42501';
  end if;
end;
$$;

-- Same as in the central schema, plus the plain text (create or replace keeps the privileges).
create or replace function public.annotation_new_project_key(p_project_id text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  update public.annotation_projects
  set key_hash = extensions.digest(v_key, 'sha256'), link_key = v_key, key_generation = key_generation + 1
  where id = p_project_id;

  if not found then
    raise exception 'unknown project' using errcode = 'P0002';
  end if;

  perform public.annotation_rotate_topics(p_project_id);
  return v_key;
end;
$$;

-- Revoking a staff member also removes the admin flag, so a later new-key does not bring an admin back.
create or replace function public.annotation_revoke_key(p_person_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.annotation_people set key_hash = null, is_admin = false where id = p_person_id and not is_guest;

  if not found then
    raise exception 'unknown staff member' using errcode = 'P0002';
  end if;

  perform public.annotation_rotate_topics(null);
end;
$$;

-- An admin may create a project with a new ID or change the project that the calling page (host)
-- already belongs to; there the page's own domain has to stay, or the tile would lose the project.
-- An ID of another project is refused, so it cannot be taken over by typing its ID. A new ID is a
-- plain insert: it waits for a concurrent insert of the same ID and then fails instead of overwriting.
-- The host comes from the page like in annotation_whoami. The admin script (service role,
-- annotation_set_project) may still change any project by ID.
create or replace function public.annotation_admin_set_project(p_host text, p_id text, p_name text, p_domains text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.annotation_require_admin();

  if coalesce(p_id, '') !~ '^[a-z0-9][a-z0-9-]{1,62}$' then
    raise exception 'Invalid ID: 2 to 63 lowercase letters, digits or hyphens, starting with a letter or digit.'
      using errcode = '23514';
  end if;

  if p_id = public.annotation_resolve_project(p_host, null) then
    if not exists (select 1 from unnest(p_domains) h where lower(btrim(h)) = lower(btrim(p_host))) then
      raise exception 'Keep % in the domains; it is the domain of this page.', lower(btrim(p_host))
        using errcode = '23514';
    end if;
    update public.annotation_projects set name = btrim(p_name) where id = p_id;
  else
    begin
      insert into public.annotation_projects (id, name) values (p_id, btrim(p_name));
    exception when unique_violation then
      raise exception 'ID already in use by another project' using errcode = '23505';
    end;
  end if;

  perform public.annotation_replace_domains(p_id, p_domains);
end;
$$;

create or replace function public.annotation_admin_new_project_key(p_project_id text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.annotation_require_admin();
  return public.annotation_new_project_key(p_project_id);
end;
$$;

create or replace function public.annotation_admin_add_staff(p_email text, p_first_name text, p_last_name text default null)
returns table (person_id uuid, key text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.annotation_require_admin();
  return query select s.person_id, s.key from public.annotation_add_staff(p_email, p_first_name, p_last_name) s;
end;
$$;

-- Admin tile reads a project: name, all domains and the current guest link.
create or replace function public.annotation_admin_project(p_project_id text)
returns table (id text, name text, domains text[], link_key text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.annotation_require_admin();
  return query
  select pr.id, pr.name,
    coalesce(
      (select array_agg(d.host order by d.host) from public.annotation_project_domains d where d.project_id = pr.id),
      array[]::text[]),
    pr.link_key
  from public.annotation_projects pr
  where pr.id = p_project_id;
end;
$$;

-- Service role only: make a staff member an admin.
create or replace function public.annotation_set_admin(p_person_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.annotation_people set is_admin = true where id = p_person_id and not is_guest;

  if not found then
    raise exception 'unknown staff member' using errcode = 'P0002';
  end if;
end;
$$;

-- Supabase grants EXECUTE to anon and authenticated by default; only the new functions here.
revoke all on function public.annotation_admin_me() from public, anon, authenticated;
revoke all on function public.annotation_require_admin() from public, anon, authenticated;
revoke all on function public.annotation_admin_set_project(text, text, text, text[]) from public, anon, authenticated;
revoke all on function public.annotation_admin_new_project_key(text) from public, anon, authenticated;
revoke all on function public.annotation_admin_add_staff(text, text, text) from public, anon, authenticated;
revoke all on function public.annotation_admin_project(text) from public, anon, authenticated;
revoke all on function public.annotation_set_admin(uuid) from public, anon, authenticated;

grant execute on function public.annotation_admin_me() to anon;
grant execute on function public.annotation_admin_set_project(text, text, text, text[]) to anon;
grant execute on function public.annotation_admin_new_project_key(text) to anon;
grant execute on function public.annotation_admin_add_staff(text, text, text) to anon;
grant execute on function public.annotation_admin_project(text) to anon;
grant execute on function public.annotation_set_admin(uuid) to service_role;
