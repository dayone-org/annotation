-- CSV import in the admin tile: many staff members in one call. Admins only, at most 200 rows.
-- Each row goes through annotation_add_staff, so the rules stay in one place; a row it refuses is
-- skipped with a reason instead of failing the whole import. p_dry_run classifies the rows without
-- creating anyone (preview). Returns one row per input row, in input order; key only for created rows.
create or replace function public.annotation_admin_add_staff_bulk(p_rows jsonb, p_dry_run boolean default false)
returns table (email text, name text, person_id uuid, key text, skipped text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  v_row jsonb;
  v_seen text[] := array[]::text[];
begin
  perform public.annotation_require_admin();

  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'Rows must be a list.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 200 then
    raise exception 'At most 200 rows per import.' using errcode = '22023';
  end if;

  for v_row in select r from jsonb_array_elements(p_rows) r loop
    email := lower(btrim(v_row ->> 'email'));
    name := concat_ws(' ', public.annotation_clean_name(v_row ->> 'first_name'),
      nullif(public.annotation_clean_name(v_row ->> 'last_name'), ''));
    person_id := null;
    key := null;
    skipped := null;

    if coalesce(email, '') !~ '^[^@[:space:]]+@dayone\.de$' then
      skipped := 'No @dayone.de address';
    elsif email = any (v_seen) then
      skipped := 'Duplicate in file';
    else
      v_seen := v_seen || email;
      begin
        select s.person_id, s.key into person_id, key
        from public.annotation_add_staff(email, v_row ->> 'first_name', v_row ->> 'last_name') s;
        if p_dry_run then
          -- Undo the insert: the preview creates nobody.
          raise exception 'dry run' using errcode = 'AN001';
        end if;
      exception
        when unique_violation then
          skipped := 'Already registered';
        when check_violation then
          skipped := 'Invalid name';
        when sqlstate 'AN001' then
          person_id := null;
          key := null;
      end;
    end if;

    return next;
  end loop;
end;
$$;

revoke all on function public.annotation_admin_add_staff_bulk(jsonb, boolean) from public, anon, authenticated;
grant execute on function public.annotation_admin_add_staff_bulk(jsonb, boolean) to anon;
