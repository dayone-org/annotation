-- Admin tile: a new ID is a plain insert. Before, the existence check could not see a project another
-- connection had created but not yet committed; the upsert in annotation_set_project then waited for that
-- commit and overwrote the project. A plain insert waits as well, then fails on the primary key.
-- The page's own project is an update. The admin script (service role, annotation_set_project) is unchanged.
create or replace function public.annotation_admin_set_project(p_host text, p_id text, p_name text, p_domains text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.annotation_require_admin();

  if p_id = public.annotation_resolve_project(p_host, null) then
    update public.annotation_projects set name = btrim(p_name) where id = p_id;
  else
    begin
      insert into public.annotation_projects (id, name) values (p_id, btrim(p_name));
    exception when unique_violation then
      raise exception 'ID already in use by another project' using errcode = '42501';
    end;
  end if;

  delete from public.annotation_project_domains where project_id = p_id;
  insert into public.annotation_project_domains (host, project_id)
  select lower(btrim(h)), p_id from unnest(p_domains) h;
end;
$$;
