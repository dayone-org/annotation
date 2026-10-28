-- Admins: staff members flagged in the database may use the admin tile in the overlay.
-- The flag is set only by the service role (scripts/annotation-admin.mjs admin --person <id>);
-- it is neither readable nor writable through the API. The browser learns it only through
-- annotation_admin_me(), which checks the key in the x-annotation-key header, independent of the host.
-- The admin RPCs reuse the service-role functions after the admin check.

alter table public.annotation_people
  add column is_admin boolean not null default false,
  add constraint annotation_people_admin_staff check (not is_admin or project_id is null);

-- Is the key in the header that of an admin? False without, with an invalid or revoked key.
create function public.annotation_admin_me()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.is_admin from public.annotation_people p where p.id = public.annotation_me()), false);
$$;

create function public.annotation_require_admin()
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

create function public.annotation_admin_set_project(p_id text, p_name text, p_domains text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.annotation_require_admin();
  perform public.annotation_set_project(p_id, p_name, p_domains);
end;
$$;

create function public.annotation_admin_new_project_key(p_project_id text)
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

create function public.annotation_admin_add_staff(p_email text, p_first_name text, p_last_name text default null)
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

-- Service role only: make a staff member an admin.
create function public.annotation_set_admin(p_person_id uuid)
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
revoke all on function public.annotation_admin_set_project(text, text, text[]) from public, anon, authenticated;
revoke all on function public.annotation_admin_new_project_key(text) from public, anon, authenticated;
revoke all on function public.annotation_admin_add_staff(text, text, text) from public, anon, authenticated;
revoke all on function public.annotation_set_admin(uuid) from public, anon, authenticated;

grant execute on function public.annotation_admin_me() to anon;
grant execute on function public.annotation_admin_set_project(text, text, text[]) to anon;
grant execute on function public.annotation_admin_new_project_key(text) to anon;
grant execute on function public.annotation_admin_add_staff(text, text, text) to anon;
grant execute on function public.annotation_set_admin(uuid) to service_role;
