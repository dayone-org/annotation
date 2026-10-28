-- Admin tile: an admin may create a project with a new ID or change the project that the calling page
-- (host) already belongs to. An ID of another project is refused, so it cannot be taken over by typing
-- its ID. The host comes from the page like in annotation_whoami; the database maps it to the project.
-- The admin script (service role, annotation_set_project) keeps its behaviour.
drop function public.annotation_admin_set_project(text, text, text[]);

create function public.annotation_admin_set_project(p_host text, p_id text, p_name text, p_domains text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.annotation_require_admin();

  if exists (select 1 from public.annotation_projects pr where pr.id = p_id)
    and p_id is distinct from public.annotation_resolve_project(p_host, null) then
    raise exception 'ID already in use by another project' using errcode = '42501';
  end if;

  perform public.annotation_set_project(p_id, p_name, p_domains);
end;
$$;

revoke all on function public.annotation_admin_set_project(text, text, text, text[]) from public, anon, authenticated;
grant execute on function public.annotation_admin_set_project(text, text, text, text[]) to anon;

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
