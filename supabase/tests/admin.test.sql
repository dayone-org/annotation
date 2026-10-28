-- Admin tile: only a key of an admin staff member may use the admin functions; the flag is neither
-- readable nor writable through the API. Run like PostgREST (role anon, key in the x-annotation-key header).
begin;
create extension if not exists pgtap with schema extensions;
select plan(80);

create function pg_temp.als(p_key text) returns void language plpgsql as $$
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
  return 'kein Fehler';
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

create temp table schluessel (name text primary key, k text);
grant select, insert on schluessel to anon, service_role;

select pg_temp.als(null);
insert into schluessel values ('gast', public.annotation_join('pk-adm', 'Gesa Gast'));

reset role;
set local role service_role;
select public.annotation_revoke_key('30000000-0000-4000-8000-000000000003');

-- ---------------------------------------------------------------- Everyone but an admin is refused
create function pg_temp.verweigert(p_wer text) returns setof text language plpgsql as $$
begin
  return next ok(not public.annotation_admin_me(), p_wer || ': admin_me false');
  return next throws_ok($q$select public.annotation_admin_set_project('adm-dieb', 'Dieb', array['dieb.test'])$q$,
    '42501', 'admins only', p_wer || ': set_project refused');
  return next throws_ok($q$select public.annotation_admin_new_project_key('adm-eins')$q$,
    '42501', 'admins only', p_wer || ': new_project_key refused');
  return next throws_ok($q$select * from public.annotation_admin_add_staff('dieb@dayone.de', 'Dieb')$q$,
    '42501', 'admins only', p_wer || ': add_staff refused');
  return next throws_ok($q$select * from public.annotation_admin_project('adm-eins')$q$,
    '42501', 'admins only', p_wer || ': admin_project refused');
  return next throws_ok($q$select link_key from public.annotation_projects$q$,
    '42501', null, p_wer || ': guest link not readable from the table');
end $$;
grant execute on function pg_temp.verweigert(text) to anon;

select pg_temp.als(null);
select * from pg_temp.verweigert('no key');
select pg_temp.als('k-falsch');
select * from pg_temp.verweigert('wrong key');
select pg_temp.als((select k from schluessel where name = 'gast'));
select * from pg_temp.verweigert('guest');
select pg_temp.als('k-max-adm');
select * from pg_temp.verweigert('staff without flag');
select pg_temp.als('k-rita');
select * from pg_temp.verweigert('admin with revoked key');

reset role;
select results_eq($$select count(*)::int from public.annotation_projects where id = 'adm-dieb'$$, $$values (0)$$,
  'refused: no project created');
select results_eq($$select key_generation from public.annotation_projects where id = 'adm-eins'$$, $$values (1)$$,
  'refused: project link unchanged');
select results_eq($$select count(*)::int from public.annotation_people where email = 'dieb@dayone.de'$$, $$values (0)$$,
  'refused: no staff member created');

-- ---------------------------------------------------------------- Admin
select pg_temp.als('k-ada');
select ok(public.annotation_admin_me(), 'admin: admin_me true');
select is_empty($$select * from public.annotation_whoami('adm-neu.test')$$, 'admin: unregistered domain has no project yet');
select lives_ok($$select public.annotation_admin_set_project('adm-neu', 'Adm Neu', array['ADM-neu.test', 'adm-neu.test:5194'])$$,
  'admin: creates a project');
select results_eq($$select id, name, domains, link_key from public.annotation_admin_project('adm-neu')$$,
  $$values ('adm-neu'::text, 'Adm Neu'::text, array['adm-neu.test', 'adm-neu.test:5194'], null::text)$$,
  'admin: reads name and all domains, no link yet');
select is_empty($$select * from public.annotation_admin_project('adm-gibts-nicht')$$, 'admin: unknown project is empty');
select results_eq($$select project_id, display_name from public.annotation_whoami('adm-neu.test:5194')$$,
  $$values ('adm-neu'::text, 'Ada Ärger'::text)$$, 'admin: overlay finds the new project by domain');
select lives_ok($$select public.annotation_admin_set_project('adm-neu', 'Adm Neu Zwei', array['adm-neu.test'])$$,
  'admin: changes name and domains');
select is_empty($$select * from public.annotation_whoami('adm-neu.test:5194')$$, 'admin: removed domain no longer resolves');
select throws_ok($$select public.annotation_admin_set_project('adm-dup', 'Dup', array['adm-eins.test'])$$,
  '23505', null, 'admin: domain of another project rejected');
select ok(pg_temp.details($$select public.annotation_admin_set_project('adm-dup', 'Dup', array['adm-eins.test'])$$)
  like '%(host)=(adm-eins.test)%', 'admin: error names the domain');

select is((select link_key from public.annotation_admin_project('adm-eins')), null,
  'admin: link from before the plain text has none');
insert into schluessel values ('neu-link', public.annotation_admin_new_project_key('adm-eins'));
select is((select link_key from public.annotation_admin_project('adm-eins')), (select k from schluessel where name = 'neu-link'),
  'admin: reads the current guest link');
select is((select length(k) from schluessel where name = 'neu-link'), 64, 'admin: new project link (256 bit)');
select ok(public.annotation_project_key_ok((select k from schluessel where name = 'neu-link'), 'adm-eins.test'),
  'admin: new project link valid');
select ok(not public.annotation_project_key_ok('pk-adm', 'adm-eins.test'), 'admin: old project link invalid');
select throws_ok($$select public.annotation_admin_new_project_key('adm-gibts-nicht')$$, 'P0002', 'unknown project',
  'admin: link for an unknown project rejected');

insert into schluessel select 'staff', key from public.annotation_admin_add_staff(' Neu.Adm@DAYONE.de ', 'Nele', 'Nürnberg');
select is((select length(k) from schluessel where name = 'staff'), 64, 'admin: staff key (256 bit)');
select throws_ok($$select * from public.annotation_admin_add_staff('fremd@example.com', 'Fred')$$, '23514', null,
  'admin: DAYONE e-mail only');

select pg_temp.als((select k from schluessel where name = 'gast'));
select is_empty($$select * from public.annotation_whoami('adm-eins.test')$$, 'admin: guest of the old link locked out');

select pg_temp.als((select k from schluessel where name = 'staff'));
select results_eq($$select display_name, is_guest from public.annotation_whoami('adm-eins.test')$$,
  $$values ('Nele Nürnberg'::text, false)$$, 'admin: new staff member recognised by key');
select ok(not public.annotation_admin_me(), 'admin: new staff member is not an admin');

reset role;
select results_eq($$select name from public.annotation_projects where id = 'adm-neu'$$, $$values ('Adm Neu Zwei'::text)$$,
  'admin: project name stored');
select results_eq($$select email, is_admin from public.annotation_people where email like 'neu.adm@%'$$,
  $$values ('neu.adm@dayone.de'::text, false)$$, 'admin: staff member stored without flag');

-- ---------------------------------------------------------------- The flag: not readable or writable through the API
select pg_temp.als('k-ada');
select throws_ok($$select is_admin from public.annotation_people$$, '42501', null, 'flag: not readable, even for an admin');
select throws_ok($$update public.annotation_people set is_admin = true$$, '42501', null, 'flag: not writable');
select throws_ok($$select public.annotation_set_admin('30000000-0000-4000-8000-000000000002')$$, '42501', null,
  'flag: set_admin not callable by anon');
select pg_temp.als('k-max-adm');
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
select function_privs_are('public', 'annotation_set_admin', array['uuid'], 'anon', array[]::text[], 'set_admin: not for anon');
select function_privs_are('public', 'annotation_set_admin', array['uuid'], 'authenticated', array[]::text[], 'set_admin: not for authenticated');
select function_privs_are('public', 'annotation_admin_set_project', array['text', 'text', 'text[]'], 'authenticated', array[]::text[],
  'admin_set_project: not for authenticated');
select function_privs_are('public', 'annotation_admin_add_staff', array['text', 'text', 'text'], 'authenticated', array[]::text[],
  'admin_add_staff: not for authenticated');

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
insert into schluessel values ('script-link', public.annotation_new_project_key('adm-eins'));
reset role;
select pg_temp.als('k-ada');
select is((select link_key from public.annotation_admin_project('adm-eins')), (select k from schluessel where name = 'script-link'),
  'script: admin sees the link from the script');
select ok(not public.annotation_project_key_ok((select k from schluessel where name = 'neu-link'), 'adm-eins.test'),
  'script: the link shown before is locked');
reset role;

-- ---------------------------------------------------------------- Service role sets the flag
set local role service_role;
select lives_ok($$select public.annotation_set_admin('30000000-0000-4000-8000-000000000002')$$, 'service: set_admin');
select throws_ok($$select public.annotation_set_admin((select id from public.annotation_people where is_guest limit 1))$$,
  'P0002', 'unknown staff member', 'service: a guest cannot become admin');
reset role;
select throws_ok($$update public.annotation_people set is_admin = true where is_guest$$, '23514', null,
  'constraint: guests are never admins');
select pg_temp.als('k-max-adm');
select ok(public.annotation_admin_me(), 'service: Max is admin now');

select * from finish();
rollback;
