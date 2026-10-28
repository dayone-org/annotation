-- Admin tile: only a key of an admin staff member may use the admin functions; the flag is neither
-- readable nor writable through the API. Run like PostgREST (role anon, key in the x-annotation-key header).
begin;
create extension if not exists pgtap with schema extensions;
select plan(131);

create function pg_temp.as_key(p_key text) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.headers',
    case when p_key is null then '{}' else json_build_object('x-annotation-key', p_key)::text end, true);
  set local role anon;
end $$;

create function pg_temp.details(p_sql text) returns text language plpgsql as $$
declare v text;
begin
  execute p_sql;
  return 'no error';
exception when others then
  get stacked diagnostics v = pg_exception_detail;
  return coalesce(nullif(v, ''), '');
end $$;
grant execute on function pg_temp.details(text) to anon;

insert into public.annotation_projects (id, name, key_hash, key_generation) values
  ('adm-eins', 'Adm Eins', extensions.digest('pk-adm', 'sha256'), 1);
insert into public.annotation_project_domains (host, project_id) values ('adm-eins.test', 'adm-eins');

-- Ada: admin. Max: staff without the flag. Rita: admin whose key is revoked below.
insert into public.annotation_people (id, email, first_name, display_name, key_hash, is_admin) values
  ('30000000-0000-4000-8000-000000000001', 'ada.adm@dayone.de', 'Ada', 'Ada Ärger', extensions.digest('k-ada', 'sha256'), true),
  ('30000000-0000-4000-8000-000000000002', 'max.adm@dayone.de', 'Max', 'Max', extensions.digest('k-max-adm', 'sha256'), false),
  ('30000000-0000-4000-8000-000000000003', 'rita.adm@dayone.de', 'Rita', 'Rita', extensions.digest('k-rita', 'sha256'), true);

create temp table keys (name text primary key, k text);
grant select, insert on keys to anon, service_role;

select pg_temp.as_key(null);
insert into keys values ('guest', public.annotation_join('pk-adm', 'Gesa Gast'));

reset role;
set local role service_role;
select public.annotation_revoke_key('30000000-0000-4000-8000-000000000003');

-- ---------------------------------------------------------------- Everyone but an admin is refused
create function pg_temp.refused(p_who text) returns setof text language plpgsql as $$
begin
  return next ok(not public.annotation_admin_me(), p_who || ': admin_me false');
  return next throws_ok($q$select public.annotation_admin_set_project('dieb.test', 'adm-dieb', 'Dieb', array['dieb.test'])$q$,
    '42501', 'admins only', p_who || ': set_project refused');
  return next throws_ok($q$select public.annotation_admin_new_project_key('adm-eins')$q$,
    '42501', 'admins only', p_who || ': new_project_key refused');
  return next throws_ok($q$select * from public.annotation_admin_add_staff('dieb@dayone.de', 'Dieb')$q$,
    '42501', 'admins only', p_who || ': add_staff refused');
  return next throws_ok($q$select * from public.annotation_admin_add_staff_bulk('[{"email": "dieb@dayone.de", "first_name": "Dieb"}]')$q$,
    '42501', 'admins only', p_who || ': add_staff_bulk refused');
  return next throws_ok($q$select * from public.annotation_admin_project('adm-eins')$q$,
    '42501', 'admins only', p_who || ': admin_project refused');
  return next throws_ok($q$select link_key from public.annotation_projects$q$,
    '42501', null, p_who || ': guest link not readable from the table');
end $$;
grant execute on function pg_temp.refused(text) to anon;

select pg_temp.as_key(null);
select * from pg_temp.refused('no key');
select pg_temp.as_key('k-falsch');
select * from pg_temp.refused('wrong key');
select pg_temp.as_key((select k from keys where name = 'guest'));
select * from pg_temp.refused('guest');
select pg_temp.as_key('k-max-adm');
select * from pg_temp.refused('staff without flag');
select pg_temp.as_key('k-rita');
select * from pg_temp.refused('admin with revoked key');

reset role;
select results_eq($$select count(*)::int from public.annotation_projects where id = 'adm-dieb'$$, $$values (0)$$,
  'refused: no project created');
select results_eq($$select key_generation from public.annotation_projects where id = 'adm-eins'$$, $$values (1)$$,
  'refused: project link unchanged');
select results_eq($$select count(*)::int from public.annotation_people where email = 'dieb@dayone.de'$$, $$values (0)$$,
  'refused: no staff member created');

-- ---------------------------------------------------------------- Admin
select pg_temp.as_key('k-ada');
select ok(public.annotation_admin_me(), 'admin: admin_me true');
select is_empty($$select * from public.annotation_whoami('adm-neu.test')$$, 'admin: unregistered domain has no project yet');
select lives_ok($$select public.annotation_admin_set_project('adm-neu.test', 'adm-neu', 'Adm Neu', array['ADM-neu.test', 'adm-neu.test:5194'])$$,
  'admin: creates a project');
select results_eq($$select id, name, domains, link_key from public.annotation_admin_project('adm-neu')$$,
  $$values ('adm-neu'::text, 'Adm Neu'::text, array['adm-neu.test', 'adm-neu.test:5194'], null::text)$$,
  'admin: reads name and all domains, no link yet');
select is_empty($$select * from public.annotation_admin_project('adm-gibts-nicht')$$, 'admin: unknown project is empty');
select results_eq($$select project_id, display_name from public.annotation_whoami('adm-neu.test:5194')$$,
  $$values ('adm-neu'::text, 'Ada Ärger'::text)$$, 'admin: overlay finds the new project by domain');
select throws_ok($$select public.annotation_admin_set_project('adm-neu.test:5194', 'adm-neu', 'Adm Neu Zwei', array['adm-neu.test'])$$,
  '23514', 'Keep adm-neu.test:5194 in the domains; it is the domain of this page.',
  'admin: the page''s own domain cannot be removed from its project');
select lives_ok($$select public.annotation_admin_set_project('adm-neu.test', 'adm-neu', 'Adm Neu Zwei', array['adm-neu.test'])$$,
  'admin: changes name and domains of the page''s own project');
select is_empty($$select * from public.annotation_whoami('adm-neu.test:5194')$$, 'admin: removed domain no longer resolves');

-- Taking over another project by its ID: refused from its own page only.
select throws_ok($$select public.annotation_admin_set_project('adm-neu.test', 'adm-eins', 'Gekapert', array['adm-neu.test'])$$,
  '23505', 'ID already in use by another project', 'admin: ID of another project refused on a page of a different project');
select throws_ok($$select public.annotation_admin_set_project('niemand.test', 'adm-eins', 'Gekapert', array['niemand.test'])$$,
  '23505', 'ID already in use by another project', 'admin: ID of another project refused on a page without project');
select throws_ok($$select public.annotation_admin_set_project('', 'adm-eins', 'Gekapert', array['niemand.test'])$$,
  '23505', 'ID already in use by another project', 'admin: ID of another project refused without host');
select throws_ok($$select public.annotation_admin_set_project('adm-eins.test', 'adm-neu', 'Gekapert', array['adm-eins.test'])$$,
  '23505', 'ID already in use by another project', 'admin: the host of one project is no pretext to change another');
select results_eq($$select id, name, domains from public.annotation_admin_project('adm-eins') union all
    select id, name, domains from public.annotation_admin_project('adm-neu')$$,
  $$values ('adm-eins'::text, 'Adm Eins'::text, array['adm-eins.test']), ('adm-neu', 'Adm Neu Zwei', array['adm-neu.test'])$$,
  'admin: refused takeovers change nothing');
select is_empty($$select * from public.annotation_whoami('niemand.test')$$, 'admin: a refused ID adds none of its domains');
select lives_ok($$select public.annotation_admin_set_project(' ADM-eins.test ', 'adm-eins', 'Adm Eins', array['adm-eins.test'])$$,
  'admin: own project found by host regardless of case and spaces');
select lives_ok($$select public.annotation_admin_set_project('adm-eins.test', 'adm-drei', 'Adm Drei', array['adm-drei.test'])$$,
  'admin: new ID can be created on a page that has a project');
select hasnt_function('public', 'annotation_admin_set_project', array['text', 'text', 'text[]'],
  'admin: the old set_project without host is gone');
select throws_ok($$select public.annotation_admin_set_project('adm-dup.test', 'adm-dup', 'Dup', array['adm-eins.test'])$$,
  '23505', 'Domain adm-eins.test already belongs to another project; remove it there first.',
  'admin: domain of another project rejected, the error names the domain');
select is(pg_temp.details($$select public.annotation_admin_set_project('adm-dup.test', 'adm-dup', 'Dup', array['adm-eins.test'])$$), '',
  'admin: domain collision without row details');
select lives_ok($$select public.annotation_admin_set_project('adm-zwei.test', 'adm-zwei', 'Adm Zwei', array['adm-zwei.test', 'ADM-zwei.test'])$$,
  'admin: the same domain twice in one call counts once');
select results_eq($$select domains from public.annotation_admin_project('adm-zwei')$$, $$values (array['adm-zwei.test'])$$,
  'admin: duplicate domain stored once');
select throws_ok($$select public.annotation_admin_set_project('adm-x.test', 'Marketing Site', 'X', array['adm-x.test'])$$,
  '23514', 'Invalid ID: 2 to 63 lowercase letters, digits or hyphens, starting with a letter or digit.', 'admin: invalid ID refused, readable');
select throws_ok($$select public.annotation_admin_set_project('adm-x.test', 'adm-x', 'X', array['https://adm-x.test'])$$,
  '23514', 'Invalid domain: https://adm-x.test. Use the host with an optional port, e.g. example.com or localhost:3000.',
  'admin: invalid domain refused, readable');
select is(pg_temp.details($$select public.annotation_admin_set_project('adm-x.test', 'adm-x', 'X', array['https://adm-x.test'])$$), '',
  'admin: invalid domain without row details');
select is_empty($$select * from public.annotation_admin_project('adm-x')$$, 'admin: refused calls create no project');
select is_empty($$select * from public.annotation_admin_project(null)$$,
  'admin: project probe without a project is empty, not refused (tile on pages without a project)');

select is((select link_key from public.annotation_admin_project('adm-eins')), null,
  'admin: link from before the plain text has none');
insert into keys values ('neu-link', public.annotation_admin_new_project_key('adm-eins'));
select is((select link_key from public.annotation_admin_project('adm-eins')), (select k from keys where name = 'neu-link'),
  'admin: reads the current guest link');
select is((select length(k) from keys where name = 'neu-link'), 64, 'admin: new project link (256 bit)');
select ok(public.annotation_project_key_ok((select k from keys where name = 'neu-link'), 'adm-eins.test'),
  'admin: new project link valid');
select ok(not public.annotation_project_key_ok('pk-adm', 'adm-eins.test'), 'admin: old project link invalid');
select throws_ok($$select public.annotation_admin_new_project_key('adm-gibts-nicht')$$, 'P0002', 'unknown project',
  'admin: link for an unknown project rejected');

insert into keys select 'staff', key from public.annotation_admin_add_staff(' Neu.Adm@DAYONE.de ', 'Nele', 'Nürnberg');
select is((select length(k) from keys where name = 'staff'), 64, 'admin: staff key (256 bit)');
select throws_ok($$select * from public.annotation_admin_add_staff('fremd@example.com', 'Fred')$$, '23514', null,
  'admin: DAYONE e-mail only');

-- ---------------------------------------------------------------- CSV import (bulk)
reset role;
create temp table bulk_rows (r jsonb);
create temp table bulk_out (n bigint, email text, name text, person_id uuid, key text, skipped text);
grant select on bulk_rows to anon;
grant select, insert on bulk_out to anon;
-- Mixed rows: valid with spaces and capitals, foreign domain, duplicate, existing, one-letter name,
-- valid with umlauts and without last name, a row that is no object.
insert into bulk_rows values ('[
  {"email": " Bulk.Eins@DAYONE.de ", "first_name": "Jürgen", "last_name": "Groß"},
  {"email": "fremd@example.com", "first_name": "Fred"},
  {"email": "bulk.eins@dayone.de", "first_name": "Jürgen", "last_name": "Zwei"},
  {"email": "neu.adm@dayone.de", "first_name": "Nele"},
  {"email": "bulk.zwei@dayone.de", "first_name": "X"},
  {"email": "bulk.drei@dayone.de", "first_name": "Märta", "last_name": ""},
  "x"
]');
select pg_temp.as_key('k-ada');
select throws_ok($$select * from public.annotation_admin_add_staff_bulk(
    (select jsonb_agg(jsonb_build_object('email', 'b' || i || '@dayone.de', 'first_name', 'Bea')) from generate_series(1, 201) i))$$,
  '22023', 'At most 200 rows per import.', 'bulk: more than 200 rows refused');
select results_eq($$select count(*)::int, count(*) filter (where skipped is null)::int from public.annotation_admin_add_staff_bulk(
    (select jsonb_agg(jsonb_build_object('email', 'b' || i || '@dayone.de', 'first_name', 'Bea')) from generate_series(1, 200) i), true)$$,
  $$values (200, 200)$$, 'bulk: 200 rows accepted');
select throws_ok($$select * from public.annotation_admin_add_staff_bulk('{"email": "x@dayone.de"}')$$,
  '22023', 'Rows must be a list.', 'bulk: no list refused');

insert into bulk_out select o.n, o.email, o.name, o.person_id, o.key, o.skipped
  from public.annotation_admin_add_staff_bulk((select r from bulk_rows), true)
  with ordinality o(email, name, person_id, key, skipped, n);
select results_eq($$select email, name, person_id is null, key is null, skipped from bulk_out order by n$$,
  $$values ('bulk.eins@dayone.de'::text, 'Jürgen Groß'::text, true, true, null::text),
           ('fremd@example.com', 'Fred', true, true, 'No @dayone.de address'),
           ('bulk.eins@dayone.de', 'Jürgen Zwei', true, true, 'Duplicate in file'),
           ('neu.adm@dayone.de', 'Nele', true, true, 'Already registered'),
           ('bulk.zwei@dayone.de', 'X', true, true, 'Invalid name'),
           ('bulk.drei@dayone.de', 'Märta', true, true, null),
           (null, '', true, true, 'No @dayone.de address')$$,
  'bulk preview: a status per row, in file order, no keys');
reset role;
select results_eq($$select count(*)::int from public.annotation_people where email like 'bulk.%' or email like 'b%@dayone.de' and first_name = 'Bea'$$,
  $$values (0)$$, 'bulk preview: creates nobody');
delete from bulk_out;

select pg_temp.as_key('k-ada');
insert into bulk_out select o.n, o.email, o.name, o.person_id, o.key, o.skipped
  from public.annotation_admin_add_staff_bulk((select r from bulk_rows))
  with ordinality o(email, name, person_id, key, skipped, n);
select results_eq($$select email, name, person_id is null, length(key), skipped from bulk_out order by n$$,
  $$values ('bulk.eins@dayone.de'::text, 'Jürgen Groß'::text, false, 64, null::text),
           ('fremd@example.com', 'Fred', true, null, 'No @dayone.de address'),
           ('bulk.eins@dayone.de', 'Jürgen Zwei', true, null, 'Duplicate in file'),
           ('neu.adm@dayone.de', 'Nele', true, null, 'Already registered'),
           ('bulk.zwei@dayone.de', 'X', true, null, 'Invalid name'),
           ('bulk.drei@dayone.de', 'Märta', false, 64, null),
           (null, '', true, null, 'No @dayone.de address')$$,
  'bulk import: keys only for the valid rows, the rest skipped with a reason');
reset role;
select results_eq($$select p.email, p.first_name, p.last_name, p.display_name, p.is_admin, p.key_hash = extensions.digest(o.key, 'sha256')
    from public.annotation_people p join bulk_out o on o.person_id = p.id order by p.email$$,
  $$values ('bulk.drei@dayone.de'::text, 'Märta'::text, null::text, 'Märta'::text, false, true),
           ('bulk.eins@dayone.de', 'Jürgen', 'Groß', 'Jürgen Groß', false, true)$$,
  'bulk import: the two staff members stored with their key, no admins');
select results_eq($$select count(*)::int from public.annotation_people where email like 'bulk.%'$$, $$values (2)$$,
  'bulk import: nobody else created');
select results_eq($$select count(*)::int from public.annotation_people where email = 'neu.adm@dayone.de' and display_name = 'Nele Nürnberg'$$,
  $$values (1)$$, 'bulk import: the existing staff member is unchanged');
select pg_temp.as_key((select key from bulk_out where email = 'bulk.eins@dayone.de' and key is not null));
select results_eq($$select display_name, is_guest from public.annotation_whoami('adm-eins.test')$$,
  $$values ('Jürgen Groß'::text, false)$$, 'bulk import: the new key signs in');
reset role;
select function_privs_are('public', 'annotation_admin_add_staff_bulk', array['jsonb', 'boolean'], 'authenticated', array[]::text[],
  'admin_add_staff_bulk: not for authenticated');

select pg_temp.as_key((select k from keys where name = 'guest'));
select is_empty($$select * from public.annotation_whoami('adm-eins.test')$$, 'admin: guest of the old link locked out');

select pg_temp.as_key((select k from keys where name = 'staff'));
select results_eq($$select display_name, is_guest from public.annotation_whoami('adm-eins.test')$$,
  $$values ('Nele Nürnberg'::text, false)$$, 'admin: new staff member recognised by key');
select ok(not public.annotation_admin_me(), 'admin: new staff member is not an admin');

reset role;
select results_eq($$select name from public.annotation_projects where id = 'adm-neu'$$, $$values ('Adm Neu Zwei'::text)$$,
  'admin: project name stored');
select results_eq($$select email, is_admin from public.annotation_people where email like 'neu.adm@%'$$,
  $$values ('neu.adm@dayone.de'::text, false)$$, 'admin: staff member stored without flag');

-- ---------------------------------------------------------------- The flag: not readable or writable through the API
select pg_temp.as_key('k-ada');
select throws_ok($$select is_admin from public.annotation_people$$, '42501', null, 'flag: not readable, even for an admin');
select throws_ok($$update public.annotation_people set is_admin = true$$, '42501', null, 'flag: not writable');
select throws_ok($$select public.annotation_set_admin('30000000-0000-4000-8000-000000000002')$$, '42501', null,
  'flag: set_admin not callable by anon');
select pg_temp.as_key('k-max-adm');
select throws_ok($$update public.annotation_people set is_admin = true where id = '30000000-0000-4000-8000-000000000002'$$,
  '42501', null, 'flag: staff cannot make themselves admin');
select throws_ok($$select public.annotation_set_admin('30000000-0000-4000-8000-000000000002')$$, '42501', null,
  'flag: staff cannot call set_admin');
select throws_ok($$select public.annotation_set_project('adm-dieb', 'Dieb', array['dieb.test'])$$, '42501', null,
  'flag: service function still closed to anon');
select ok(not public.annotation_admin_me(), 'flag: Max still no admin');

reset role;
select column_privs_are('public', 'annotation_people', 'is_admin', 'anon', array[]::text[], 'people.is_admin: anon without privileges');
select column_privs_are('public', 'annotation_people', 'is_admin', 'authenticated', array[]::text[], 'people.is_admin: authenticated without privileges');
select function_privs_are('public', 'annotation_set_admin', array['uuid', 'boolean'], 'anon', array[]::text[], 'set_admin: not for anon');
select function_privs_are('public', 'annotation_set_admin', array['uuid', 'boolean'], 'authenticated', array[]::text[], 'set_admin: not for authenticated');
select function_privs_are('public', 'annotation_admin_set_project', array['text', 'text', 'text', 'text[]'], 'authenticated', array[]::text[],
  'admin_set_project: not for authenticated');
select function_privs_are('public', 'annotation_admin_add_staff', array['text', 'text', 'text'], 'authenticated', array[]::text[],
  'admin_add_staff: not for authenticated');
select function_privs_are('public', 'annotation_admin_me', array[]::text[], 'authenticated', array[]::text[],
  'admin_me: not for authenticated');
select function_privs_are('public', 'annotation_admin_new_project_key', array['text'], 'authenticated', array[]::text[],
  'admin_new_project_key: not for authenticated');
select function_privs_are('public', 'annotation_require_admin', array[]::text[], 'anon', array[]::text[],
  'require_admin: not for anon');

select column_privs_are('public', 'annotation_projects', 'link_key', 'anon', array[]::text[], 'projects.link_key: anon without privileges');
select column_privs_are('public', 'annotation_projects', 'link_key', 'authenticated', array[]::text[],
  'projects.link_key: authenticated without privileges');
select function_privs_are('public', 'annotation_admin_project', array['text'], 'authenticated', array[]::text[],
  'admin_project: not for authenticated');
select is_empty($$select 1 from pg_publication_tables where schemaname = 'public' and tablename = 'annotation_projects'$$,
  'projects: not in a realtime publication');
-- Only these two functions touch the plain text; a new one has to be checked and added here.
select is((select array_agg(proname::text order by proname) from pg_proc
  where pronamespace = 'public'::regnamespace and prosrc like '%link_key%'),
  array['annotation_admin_project', 'annotation_new_project_key'], 'link_key: read only by the admin function');

-- ---------------------------------------------------------------- Script (service role): link is stored too
set local role service_role;
insert into keys values ('script-link', public.annotation_new_project_key('adm-eins'));
reset role;
select pg_temp.as_key('k-ada');
select is((select link_key from public.annotation_admin_project('adm-eins')), (select k from keys where name = 'script-link'),
  'script: admin sees the link from the script');
select ok(not public.annotation_project_key_ok((select k from keys where name = 'neu-link'), 'adm-eins.test'),
  'script: the link shown before is locked');
reset role;

-- ---------------------------------------------------------------- Script (service role): any project by ID, as before
set local role service_role;
select lives_ok($$select public.annotation_set_project('adm-drei', 'Adm Drei Skript', array['adm-drei.test'])$$,
  'script: service role still changes a project by ID');
reset role;
select results_eq($$select name from public.annotation_projects where id = 'adm-drei'$$, $$values ('Adm Drei Skript'::text)$$,
  'script: name changed');

-- ---------------------------------------------------------------- Revoke removes the admin flag
select results_eq($$select is_admin, key_hash is null from public.annotation_people where email = 'rita.adm@dayone.de'$$,
  $$values (false, true)$$, 'revoke: admin flag removed with the key');
set local role service_role;
insert into keys values ('rita-neu', public.annotation_new_key('30000000-0000-4000-8000-000000000003'));
reset role;
select pg_temp.as_key((select k from keys where name = 'rita-neu'));
select ok(not public.annotation_admin_me(), 'revoke: a new key after revoke is no admin key');
select ok(exists (select 1 from public.annotation_whoami('adm-eins.test')), 'revoke: the new key still works as staff');
reset role;

-- ---------------------------------------------------------------- Service role sets the flag
set local role service_role;
select lives_ok($$select public.annotation_set_admin('30000000-0000-4000-8000-000000000002')$$, 'service: set_admin');
select throws_ok($$select public.annotation_set_admin((select id from public.annotation_people where is_guest limit 1))$$,
  'P0002', 'unknown staff member', 'service: a guest cannot become admin');
reset role;
select throws_ok($$update public.annotation_people set is_admin = true where is_guest$$, '23514', null,
  'constraint: guests are never admins');
select pg_temp.as_key('k-max-adm');
select ok(public.annotation_admin_me(), 'service: Max is admin now');

-- ---------------------------------------------------------------- Service role takes the flag away, the key stays
set local role service_role;
select lives_ok($$select public.annotation_set_admin('30000000-0000-4000-8000-000000000002', false)$$, 'service: set_admin off');
reset role;
select pg_temp.as_key('k-max-adm');
select ok(not public.annotation_admin_me(), 'off: Max is no admin any more');
select results_eq($$select person_id from public.annotation_whoami('adm-eins.test')$$,
  $$values ('30000000-0000-4000-8000-000000000002'::uuid)$$, 'off: the key of Max still works');
select throws_ok($$select public.annotation_set_admin('30000000-0000-4000-8000-000000000002', true)$$, '42501', null,
  'off: Max cannot switch the flag back on');

-- ---------------------------------------------------------------- Staff list (service role only)
select throws_ok($$select * from public.annotation_staff_list()$$, '42501', null, 'staff_list: not callable by anon');
reset role;
select function_privs_are('public', 'annotation_staff_list', array[]::text[], 'anon', array[]::text[], 'staff_list: not for anon');
select function_privs_are('public', 'annotation_staff_list', array[]::text[], 'authenticated', array[]::text[],
  'staff_list: not for authenticated');
select function_privs_are('public', 'annotation_staff_list', array[]::text[], 'service_role', array['EXECUTE'],
  'staff_list: for service_role');
update public.annotation_people set key_hash = null where email = 'neu.adm@dayone.de';
set local role service_role;
select results_eq(
  $$select email, first_name, last_name, is_admin, has_key from public.annotation_staff_list() where email like '%.adm@dayone.de'$$,
  $$values ('ada.adm@dayone.de'::text, 'Ada'::text, null::text, true, true),
           ('max.adm@dayone.de', 'Max', null, false, true),
           ('neu.adm@dayone.de', 'Nele', 'Nürnberg', false, false),
           ('rita.adm@dayone.de', 'Rita', null, false, true)$$,
  'staff_list: e-mail, name, admin and key per staff member, no guests');
select is((select count(*) from public.annotation_staff_list() s join public.annotation_people p on p.id = s.person_id where p.is_guest), 0::bigint,
  'staff_list: no guests');
reset role;

select * from finish();
rollback;
