-- Admin tile reads a project: name, all domains and the current guest link.
-- The guest link key is also kept in plain text so admins can show it again (Arthur, 28.10.2026).
-- Guests are still checked against key_hash. annotation_projects has no privileges for anon or
-- authenticated and is not in a realtime publication; only annotation_admin_project() and the
-- service role read the plain text. Links created before this migration have none. Staff keys stay hashed only.
alter table public.annotation_projects add column link_key text;

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

create function public.annotation_admin_project(p_project_id text)
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

revoke all on function public.annotation_admin_project(text) from public, anon, authenticated;
grant execute on function public.annotation_admin_project(text) to anon;
