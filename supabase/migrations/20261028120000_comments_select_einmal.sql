-- Reading comments checked the key once per row (annotation_person_for per row): about 0.9 s for
-- 5000 comments. The policy now asks once per query which projects the key may access.
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

-- The sub-select makes Postgres evaluate the function once per query (InitPlan), not per row.
drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments
  for select to anon
  using (project_id = any ((select public.annotation_my_projects())::text[]));
