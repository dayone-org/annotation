-- Keys, projects, guests, RLS and triggers of the central schema, run like PostgREST
-- (role anon, key in the x-annotation-key header). Independent of the seed, all in one transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(114);

-- Switch browser: role anon, key in the header (null = no header).
create function pg_temp.als(p_key text) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.headers',
    case when p_key is null then '{}' else json_build_object('x-annotation-key', p_key)::text end, true);
  set local role anon;
end $$;

-- DETAIL of an error, as PostgREST returns it in "details".
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

-- Projects: test-eins (two domains), test-zwei. Known project keys, generation 1.
insert into public.annotation_projects (id, name, key_hash, key_generation) values
  ('test-eins', 'Test Eins', extensions.digest('pk-eins', 'sha256'), 1),
  ('test-zwei', 'Test Zwei', extensions.digest('pk-zwei', 'sha256'), 1);
insert into public.annotation_project_domains (host, project_id) values
  ('eins.test', 'test-eins'), ('eins.test:8443', 'test-eins'), ('zwei.test', 'test-zwei');

-- Staff: Mia, Max.
insert into public.annotation_people (id, email, first_name, last_name, display_name, key_hash) values
  ('20000000-0000-4000-8000-000000000001', 'mia@dayone.de', 'Mia', 'Muster', 'Mia Muster', extensions.digest('k-mia', 'sha256')),
  ('20000000-0000-4000-8000-000000000002', 'max@dayone.de', 'Max', null, 'Max', extensions.digest('k-max', 'sha256'));

create temp table gast (name text primary key, k text);
grant select, insert on gast to anon;

-- ---------------------------------------------------------------- Without key and with a wrong key
select pg_temp.als('k-mia');
insert into public.comments (id, project_id, page_path, text) values
  ('10000000-0000-4000-8000-000000000001', 'test-eins', '/start', 'Thread von Mia'),
  ('10000000-0000-4000-8000-000000000009', 'test-zwei', '/start', 'Thread in test-zwei');

select pg_temp.als(null);
select is_empty($$select id from public.comments$$, 'no key: reads no comments');
select is_empty($$select id from public.annotation_people$$, 'no key: sees no people');
select is_empty($$select * from public.annotation_whoami('eins.test')$$, 'no key: whoami empty, overlay stays invisible');
select throws_ok($$insert into public.comments (project_id, page_path, text) values ('test-eins', '/', 'x')$$,
  '42501', 'no access to this project', 'no key: insert rejected');
select throws_ok($$select public.annotation_rename('Dieb')$$, '28000', 'invalid key', 'no key: rename rejected');

select pg_temp.als('k-falsch');
select is_empty($$select id from public.comments$$, 'wrong key: reads no comments');
select is_empty($$select * from public.annotation_whoami('eins.test')$$, 'wrong key: whoami empty');
select throws_ok($$insert into public.comments (project_id, page_path, text) values ('test-eins', '/', 'x')$$,
  '42501', 'no access to this project', 'wrong key: insert rejected');
update public.comments set resolved = true;
delete from public.comments;
reset role;
select results_eq($$select count(*)::int, count(*) filter (where resolved)::int from public.comments where project_id like 'test-%'$$,
  $$values (2, 0)$$, 'wrong key: update and delete have no effect');

-- ---------------------------------------------------------------- Project by domain or override
select pg_temp.als('k-max');
select results_eq($$select project_id, person_id, display_name, is_guest from public.annotation_whoami('eins.test')$$,
  $$values ('test-eins'::text, '20000000-0000-4000-8000-000000000002'::uuid, 'Max'::text, false)$$, 'domain: eins.test belongs to test-eins');
select results_eq($$select project_id from public.annotation_whoami('EINS.Test:8443')$$,
  $$values ('test-eins'::text)$$, 'domain: second domain, case-insensitive');
select results_eq($$select project_id from public.annotation_whoami('eins.test', 'test-zwei')$$,
  $$values ('test-zwei'::text)$$, 'domain: projectId overrides the domain');
select is_empty($$select * from public.annotation_whoami('unbekannt.test')$$, 'domain: unknown domain has no project');
select is_empty($$select * from public.annotation_whoami('eins.test', 'nicht-angelegt')$$, 'project: unregistered project has no access');
select throws_ok($$insert into public.comments (project_id, page_path, text) values ('nicht-angelegt', '/', 'x')$$,
  '42501', 'no access to this project', 'project: no comment in an unregistered project');
select results_eq($$select id from public.comments where project_id like 'test-%' order by id$$,
  $$values ('10000000-0000-4000-8000-000000000001'::uuid), ('10000000-0000-4000-8000-000000000009'::uuid)$$,
  'staff: read comments of all projects');

-- ---------------------------------------------------------------- Project link and joining as a guest
select pg_temp.als(null);
select ok(public.annotation_project_key_ok('pk-eins', 'eins.test'), 'project link: valid on its domain');
select ok(not public.annotation_project_key_ok('pk-eins', 'zwei.test'), 'project link: not valid on another domain');
select ok(not public.annotation_project_key_ok('pk-falsch', 'eins.test'), 'project link: wrong link invalid');
select throws_ok($$select public.annotation_join('pk-falsch', 'Eva')$$, '28000', 'invalid project link', 'join: wrong link rejected');
insert into gast values ('eva', public.annotation_join('pk-eins', '  Eva Extern  '));
insert into gast values ('ole', public.annotation_join('pk-zwei', 'Ole'));
select is((select length(k) from gast where name = 'eva'), 64, 'join: returns a key of its own for the browser (256 bit)');

select pg_temp.als((select k from gast where name = 'eva'));
select results_eq($$select project_id, display_name, is_guest from public.annotation_whoami('eins.test')$$,
  $$values ('test-eins'::text, 'Eva Extern'::text, true)$$, 'guest: recognised without link, flagged as guest, name trimmed');
select is_empty($$select * from public.annotation_whoami('zwei.test')$$, 'guest: no access on another domain');
select is_empty($$select * from public.annotation_whoami('eins.test', 'test-zwei')$$, 'guest: no access to another project via override');
select results_eq($$select id from public.comments$$,
  $$values ('10000000-0000-4000-8000-000000000001'::uuid)$$, 'guest: reads only comments of own project');
select throws_ok($$insert into public.comments (project_id, page_path, text) values ('test-zwei', '/', 'x')$$,
  '42501', 'no access to this project', 'guest: insert into another project rejected');
update public.comments set resolved = true where id = '10000000-0000-4000-8000-000000000009';
reset role;
select results_eq($$select resolved from public.comments where id = '10000000-0000-4000-8000-000000000009'$$,
  $$values (false)$$, 'guest: update in another project has no effect');

-- ---------------------------------------------------------------- Names: invisible characters, length, error details
select pg_temp.als(null);
select throws_ok($$select public.annotation_join('pk-eins', e'\u200B\u200BA\u200B')$$, '23514', 'invalid name', 'name: zero-width does not count, 1 visible character rejected');
select throws_ok($$select public.annotation_join('pk-eins', e'\t\n \u00A0')$$, '23514', 'invalid name', 'name: only tabs, line breaks, spaces rejected');
select throws_ok($$select public.annotation_join('pk-eins', repeat('x', 49))$$, '23514', 'invalid name', 'name: 49 characters rejected');
select is(pg_temp.details($$select public.annotation_join('pk-eins', 'X')$$), '', 'name: join error without row details');
select throws_ok($$select public.annotation_join('pk-eins', '-- ..')$$, '23514', 'invalid name', 'name: without letters or digits rejected');
select throws_ok($$select public.annotation_join('pk-eins', e'\U0001F600\U0001F600')$$, '23514', 'invalid name', 'name: emoji only rejected');
select throws_ok($$select public.annotation_join('pk-eins', e'A\u0301\u0301\u0301')$$, '23514', 'invalid name', 'name: one letter plus combining marks rejected');
select throws_ok($$select public.annotation_join('pk-eins', 'ab' || repeat(e'\u0301', 47))$$, '23514', 'invalid name', 'name: combining marks count towards the 48');
select ok(public.annotation_name_ok('Jo') and public.annotation_name_ok('Ülla') and public.annotation_name_ok('Märta Prüfer')
  and public.annotation_name_ok('李明') and public.annotation_name_ok('R2'), 'name: Jo, Ülla, Märta Prüfer, 李明, R2 valid');
insert into gast values ('uella', public.annotation_join('pk-eins', e'U\u0308lla'));
insert into gast values ('ina', public.annotation_join('pk-eins', e'\u00A0In\u200Ba\tB\u202E\n'));
insert into gast values ('lang', public.annotation_join('pk-eins', repeat('ü', 48) || e'\u200B'));
reset role;
select results_eq($$select display_name from public.annotation_people where key_hash in
    (select extensions.digest(k, 'sha256') from gast where name in ('ina', 'uella', 'lang')) order by char_length(display_name), display_name$$,
  $$values ('InaB'::text), (e'\u00DClla'), (repeat('ü', 48))$$, 'name: invisible characters removed, NFC normalised, 48 allowed');

select pg_temp.als((select k from gast where name = 'eva'));
select throws_ok($$select public.annotation_rename(e'X\u200B\u200D')$$, '23514', 'invalid name', 'rename: zero-width does not count');
select is(pg_temp.details($$select public.annotation_rename('X')$$), '', 'rename: error without row details');

-- ---------------------------------------------------------------- E-mail, project and key never readable
select throws_ok($$select email from public.annotation_people$$, '42501', null, 'guest: e-mail not readable');
select throws_ok($$select key_hash from public.annotation_people$$, '42501', null, 'guest: key_hash not readable');
select throws_ok($$select project_id from public.annotation_people$$, '42501', null, 'guest: project of other people not readable');
select throws_ok($$select * from public.annotation_people$$, '42501', null, 'guest: select * on people denied');
select throws_ok($$select id from public.annotation_projects$$, '42501', null, 'guest: projects not readable');
select throws_ok($$select host from public.annotation_project_domains$$, '42501', null, 'guest: domains not readable');
select pg_temp.als('k-mia');
select throws_ok($$select email from public.annotation_people$$, '42501', null, 'staff: e-mail not readable through the API either');

-- ---------------------------------------------------------------- Insert: server sets author, status, time
select pg_temp.als((select k from gast where name = 'eva'));
select throws_ok($$insert into public.comments (project_id, page_path, text, author_id)
  values ('test-eins', '/', 'x', '20000000-0000-4000-8000-000000000001')$$, '42501', null, 'insert: author_id from the browser denied');
select throws_ok($$insert into public.comments (project_id, page_path, text, resolved)
  values ('test-eins', '/', 'x', true)$$, '42501', null, 'insert: resolved from the browser denied');
select lives_ok($$insert into public.comments (id, project_id, page_path, text, parent_id)
  values ('10000000-0000-4000-8000-000000000002', 'test-eins', '/start', 'Antwort von Eva', '10000000-0000-4000-8000-000000000001')$$,
  'guest replies in own project');
reset role;
select results_eq(
  $$select author_id = (select id from public.annotation_people where display_name = 'Eva Extern'), resolved, created_at = now()
    from public.comments where id = '10000000-0000-4000-8000-000000000002'$$,
  $$values (true, false, true)$$, 'insert: author and time come from the server');

-- ---------------------------------------------------------------- Names when reading, guest flag
select pg_temp.als((select k from gast where name = 'eva'));
select results_eq(
  $$select p.display_name, p.is_guest from public.comments c join public.annotation_people p on p.id = c.author_id order by c.created_at, c.id$$,
  $$values ('Mia Muster'::text, false), ('Eva Extern'::text, true)$$, 'guest reads comments with names and guest flag');
select results_eq($$select display_name from public.annotation_people order by display_name$$,
  $$values ('Eva Extern'::text), ('Mia Muster'::text)$$, 'guest sees only themself and authors in their project');
select pg_temp.als((select k from gast where name = 'ole'));
select is_empty($$select id from public.annotation_people where display_name = 'Eva Extern'$$, 'guest of test-zwei: does not see guests of test-eins');

-- ---------------------------------------------------------------- Rename: guests only, applies to old comments
select pg_temp.als('k-mia');
select throws_ok($$select public.annotation_rename('Mia Neu')$$, '42501', 'staff names are fixed', 'staff: rename denied on the server');
reset role;
create temp table rename_vorher as select count(*)::int as n from realtime.messages
  where topic = 'annotation:' || (select realtime_topic from public.annotation_projects where id = 'test-eins');
grant select on rename_vorher to anon;
select pg_temp.als((select k from gast where name = 'eva'));
select lives_ok($$select public.annotation_rename(e'  Eva\u200B Neu  ')$$, 'guest renames themself');
reset role;
select is((select count(*)::int from realtime.messages
  where topic = 'annotation:' || (select realtime_topic from public.annotation_projects where id = 'test-eins')),
  (select n + 1 from rename_vorher), 'rename: ping to the project with comments by that person');
select pg_temp.als('k-max');
select results_eq(
  $$select p.display_name from public.comments c join public.annotation_people p on p.id = c.author_id
    where c.id = '10000000-0000-4000-8000-000000000002'$$,
  $$values ('Eva Neu'::text)$$, 'rename: old comment shows the new name to others');
reset role;
select is((select display_name from public.annotation_people where id = '20000000-0000-4000-8000-000000000001'),
  'Mia Muster', 'rename: staff name unchanged');

-- ---------------------------------------------------------------- Anyone resolves, only the author moves
select pg_temp.als((select k from gast where name = 'eva'));
select throws_ok($$update public.comments set text = 'neu'$$, '42501', null, 'update: text denied');
select throws_ok($$update public.comments set project_id = 'test-zwei'$$, '42501', null, 'update: project denied');
select throws_ok($$update public.comments set resolved_at = now()$$, '42501', null, 'update: resolved_at from the browser denied');
select throws_ok($$update public.comments set selector = '#weg' where id = '10000000-0000-4000-8000-000000000001'$$,
  '42501', 'only the author can move this thread', 'move: thread of another person denied (selector)');
select throws_ok($$update public.comments set rect = '{"x": 9}' where id = '10000000-0000-4000-8000-000000000001'$$,
  '42501', 'only the author can move this thread', 'move: thread of another person denied (rect)');
select lives_ok($$update public.comments set resolved = true where id = '10000000-0000-4000-8000-000000000001'$$,
  'resolve: guest resolves a thread of another person');
reset role;
select results_eq($$select resolved, resolved_at = now() from public.comments where id = '10000000-0000-4000-8000-000000000001'$$,
  $$values (true, true)$$, 'resolve: database sets resolved_at');
select pg_temp.als('k-mia');
select lives_ok($$update public.comments set resolved = false, selector = '#neu', rect = '{"x": 1}'
  where id = '10000000-0000-4000-8000-000000000001'$$, 'author reopens and moves own thread');
reset role;
select results_eq($$select resolved, resolved_at, selector from public.comments where id = '10000000-0000-4000-8000-000000000001'$$,
  $$values (false, null::timestamptz, '#neu'::text)$$, 'reopened: resolved_at cleared, position saved');

-- ---------------------------------------------------------------- Replies
select pg_temp.als((select k from gast where name = 'eva'));
select throws_ok($$insert into public.comments (project_id, page_path, text, parent_id)
  values ('test-eins', '/', 'x', '10000000-0000-4000-8000-000000000002')$$, '23503', 'invalid parent', 'reply to a reply rejected');
select pg_temp.als('k-max');
select throws_ok($$insert into public.comments (project_id, page_path, text, parent_id)
  values ('test-zwei', '/', 'x', '10000000-0000-4000-8000-000000000001')$$, '23503', 'invalid parent', 'reply to a thread of another project rejected');

-- ---------------------------------------------------------------- Delete
-- Max: thread 003 with his own reply 004, thread 005 without replies. Mia: thread 001 with reply 002 by Eva.
insert into public.comments (id, project_id, page_path, text) values
  ('10000000-0000-4000-8000-000000000003', 'test-eins', '/', 'Max allein'),
  ('10000000-0000-4000-8000-000000000005', 'test-eins', '/', 'Max ohne Antwort');
insert into public.comments (id, project_id, page_path, text, parent_id) values
  ('10000000-0000-4000-8000-000000000004', 'test-eins', '/', 'Max ergänzt', '10000000-0000-4000-8000-000000000003');
delete from public.comments where id = '10000000-0000-4000-8000-000000000001';
reset role;
select isnt_empty($$select id from public.comments where id = '10000000-0000-4000-8000-000000000001'$$, 'delete: thread of another person remains');
select pg_temp.als('k-mia');
select throws_ok($$delete from public.comments where id = '10000000-0000-4000-8000-000000000001'$$,
  '23503', null, 'delete: own thread with a reply by another person rejected');
reset role;
select results_eq($$select count(*)::int from public.comments where id in ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002')$$,
  $$values (2)$$, 'delete: thread and the other reply remain');
select pg_temp.als('k-max');
select throws_ok($$delete from public.comments where id = '10000000-0000-4000-8000-000000000003'$$,
  '23503', null, 'delete: thread with only own replies rejected too (no cascade)');
select lives_ok($$delete from public.comments where id = '10000000-0000-4000-8000-000000000004'$$, 'delete: own reply');
select lives_ok($$delete from public.comments where id in ('10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000005')$$,
  'delete: own threads without replies');
reset role;
select is_empty($$select id from public.comments where id in ('10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000005')$$,
  'delete: own reply and reply-less threads gone');

-- ---------------------------------------------------------------- Realtime: secret topic, only with access
-- One ping per statement: inserting and resolving several threads at once sends one ping each.
create temp table pings_zwei as select count(*)::int as n from realtime.messages
  where topic = 'annotation:' || (select realtime_topic from public.annotation_projects where id = 'test-zwei');
grant select on pings_zwei to anon;
select pg_temp.als('k-mia');
insert into public.comments (id, project_id, page_path, text) values
  ('10000000-0000-4000-8000-000000000021', 'test-zwei', '/', 'one'),
  ('10000000-0000-4000-8000-000000000022', 'test-zwei', '/', 'two'),
  ('10000000-0000-4000-8000-000000000023', 'test-zwei', '/', 'three');
update public.comments set resolved = true where project_id = 'test-zwei';
reset role;
select is((select count(*)::int from realtime.messages
  where topic = 'annotation:' || (select realtime_topic from public.annotation_projects where id = 'test-zwei')),
  (select n + 2 from pings_zwei), 'realtime: one ping per statement (insert of 3 rows, resolve all of 4 threads)');
select is((select count(*)::int from public.comments where project_id = 'test-zwei' and resolved), 4,
  'realtime: resolve all touched 4 threads');
create temp table topic_alt as select realtime_topic from public.annotation_projects where id = 'test-eins';
grant select on topic_alt to anon;
select is(
  (select count(*)::int from realtime.messages where topic = 'annotation:' || (select realtime_topic from topic_alt)
     and event = 'changed' and not private and payload - 'id' = '{}'::jsonb) > 0,
  true, 'realtime: pings go to the secret topic, without content');
select is((select count(*)::int from realtime.messages where topic like 'annotation:test-%'), 0,
  'realtime: no ping on a guessable topic');
select pg_temp.als((select k from gast where name = 'eva'));
select results_eq($$select realtime_topic from public.annotation_whoami('eins.test')$$,
  $$select realtime_topic from topic_alt$$, 'realtime: guest with access learns the topic');
select pg_temp.als((select k from gast where name = 'ole'));
select is_empty($$select realtime_topic from public.annotation_whoami('eins.test')$$, 'realtime: guest of another project does not learn the topic');

-- ---------------------------------------------------------------- New project link locks out the old link and its guests
reset role;
create temp table pings_vorher as
  select count(*)::int as n from realtime.messages where topic = 'annotation:' || (select realtime_topic from topic_alt);
set local role service_role;
create temp table pk_neu as select public.annotation_new_project_key('test-eins') as k;
grant select on pk_neu to anon;
reset role;
select isnt((select realtime_topic from public.annotation_projects where id = 'test-eins'), (select realtime_topic from topic_alt),
  'new project link: realtime topic re-rolled');
select is((select count(*)::int from realtime.messages where topic = 'annotation:' || (select realtime_topic from topic_alt)),
  (select n + 1 from pings_vorher), 'new project link: one last ping on the old topic');
select pg_temp.als((select k from gast where name = 'eva'));
select is_empty($$select * from public.annotation_whoami('eins.test')$$, 'new project link: old guest no longer recognised');
select is_empty($$select id from public.comments$$, 'new project link: old guest reads nothing');
select throws_ok($$insert into public.comments (project_id, page_path, text) values ('test-eins', '/', 'x')$$,
  '42501', 'no access to this project', 'new project link: old guest writes nothing');
select throws_ok($$select public.annotation_rename('Eva Wieder')$$, '28000', 'invalid key', 'new project link: old guest cannot rename');
select pg_temp.als(null);
select throws_ok($$select public.annotation_join('pk-eins', 'Eva')$$, '28000', 'invalid project link', 'new project link: old link has no effect');
select ok(public.annotation_project_key_ok((select k from pk_neu), 'eins.test'), 'new project link: new link is valid');
select pg_temp.als((select k from gast where name = 'ole'));
select results_eq($$select display_name from public.annotation_whoami('zwei.test')$$, $$values ('Ole'::text)$$,
  'new project link: guests of other projects unaffected');
select pg_temp.als('k-mia');
select results_eq($$select p.display_name from public.comments c join public.annotation_people p on p.id = c.author_id
    where c.id = '10000000-0000-4000-8000-000000000002'$$,
  $$values ('Eva Neu'::text)$$, 'new project link: comments of locked-out guests stay readable with names');

-- ---------------------------------------------------------------- Staff: revocation and new key
reset role;
set local role service_role;
select lives_ok($$select public.annotation_revoke_key('20000000-0000-4000-8000-000000000002')$$, 'revocation via service_role');
select throws_ok($$select public.annotation_revoke_key((select id from public.annotation_people where display_name = 'Ole'))$$,
  'P0002', 'unknown staff member', 'revocation: staff only');
create temp table mia_neu as select public.annotation_new_key('20000000-0000-4000-8000-000000000001') as k;
grant select on mia_neu to anon;
select pg_temp.als('k-max');
select is_empty($$select id from public.comments$$, 'deleted key: reads nothing');
select throws_ok($$insert into public.comments (project_id, page_path, text) values ('test-eins', '/', 'x')$$,
  '42501', 'no access to this project', 'deleted key: writes nothing');
select pg_temp.als('k-mia');
select is_empty($$select id from public.comments$$, 'new key: old key reads nothing');
reset role;
select pg_temp.als((select k from mia_neu));
select results_eq($$select display_name from public.annotation_whoami('zwei.test')$$, $$values ('Mia Muster'::text)$$,
  'new key: new key is valid');

-- ---------------------------------------------------------------- Admin functions
select throws_ok($$select public.annotation_set_project('x-y', 'X', array['x.test'])$$, '42501', null, 'admin: set_project denied for anon');
select throws_ok($$select public.annotation_new_project_key('test-eins')$$, '42501', null, 'admin: new_project_key denied for anon');
select throws_ok($$select public.annotation_add_staff('x@dayone.de', 'X')$$, '42501', null, 'admin: add_staff denied for anon');
select throws_ok($$select public.annotation_new_key('20000000-0000-4000-8000-000000000001')$$, '42501', null, 'admin: new_key denied for anon');
select throws_ok($$select public.annotation_revoke_key('20000000-0000-4000-8000-000000000001')$$, '42501', null, 'admin: revoke_key denied for anon');

reset role;
set local role service_role;
select lives_ok($$select public.annotation_set_project('test-drei', ' Test Drei ', array['Drei.Test', 'drei.test:8080'])$$, 'admin: project created');
select lives_ok($$select public.annotation_set_project('test-drei', 'Test Drei', array['neu.test'])$$, 'admin: domains replaced');
create temp table mitarbeiter as select * from public.annotation_add_staff(' Neu@DAYONE.de ', e' Nina\u200B ', ' ');
select throws_ok($$select public.annotation_add_staff('fremd@example.com', 'Fred')$$, '23514', null, 'admin: DAYONE e-mail only');
reset role;
select results_eq($$select host from public.annotation_project_domains where project_id = 'test-drei'$$,
  $$values ('neu.test'::text)$$, 'admin: only the new domains apply');
select results_eq(
  $$select p.email, p.first_name, p.last_name, p.display_name, p.key_hash = extensions.digest(m.key, 'sha256')
    from mitarbeiter m join public.annotation_people p on p.id = m.person_id$$,
  $$values ('neu@dayone.de'::text, 'Nina'::text, null::text, 'Nina'::text, true)$$, 'admin: staff member created, only the hash stored');

-- ---------------------------------------------------------------- Privileges
select table_privs_are('public', 'comments', 'anon', array['SELECT', 'DELETE'], 'comments: anon without TRUNCATE, insert/update per column only');
select column_privs_are('public', 'comments', 'resolved_at', 'anon', array['SELECT'], 'comments.resolved_at: anon read only');
select table_privs_are('public', 'comments', 'authenticated', array[]::text[], 'comments: authenticated without privileges');
select table_privs_are('public', 'annotation_people', 'anon', array[]::text[], 'people: anon per column only');
select table_privs_are('public', 'annotation_projects', 'anon', array[]::text[], 'projects: anon without privileges');
select table_privs_are('public', 'annotation_project_domains', 'anon', array[]::text[], 'domains: anon without privileges');

select * from finish();
rollback;
