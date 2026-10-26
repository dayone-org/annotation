-- Schlüsselprüfung, RLS und Trigger des zentralen Schemas, ausgeführt wie PostgREST (Rolle anon,
-- Schlüssel im Header x-annotation-key). Unabhängig vom Seed, alles in einer Transaktion.
begin;
create extension if not exists pgtap with schema extensions;
select plan(68);

-- Browser wechseln: Rolle anon, Schlüssel im Header (null = kein Header).
create function pg_temp.als(p_key text) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.headers',
    case when p_key is null then '{}' else json_build_object('x-annotation-key', p_key)::text end, true);
  set local role anon;
end $$;

-- Personen: Mia (Mitarbeiterin), Max (Mitarbeiter), Eva (extern test-eins), Ole (extern test-zwei),
-- Rita (extern test-eins, wird entzogen), Ina (extern test-eins, noch nie kommentiert).
insert into public.annotation_people (id, project_id, email, first_name, last_name, display_name, key_hash) values
  ('20000000-0000-4000-8000-000000000001', null, 'mia@dayone.de', 'Mia', 'Muster', 'Mia Muster', extensions.digest('k-mia', 'sha256')),
  ('20000000-0000-4000-8000-000000000002', null, 'max@dayone.de', 'Max', null, 'Max', extensions.digest('k-max', 'sha256')),
  ('20000000-0000-4000-8000-000000000003', 'test-eins', null, null, null, 'Eva Extern', extensions.digest('k-eva', 'sha256')),
  ('20000000-0000-4000-8000-000000000004', 'test-zwei', null, null, null, 'Ole Extern', extensions.digest('k-ole', 'sha256')),
  ('20000000-0000-4000-8000-000000000005', 'test-eins', null, null, null, 'Rita', extensions.digest('k-rita', 'sha256')),
  ('20000000-0000-4000-8000-000000000006', 'test-eins', null, null, null, 'Ina', extensions.digest('k-ina', 'sha256'));

-- ---------------------------------------------------------------- Ohne und mit falschem Schlüssel
select pg_temp.als('k-mia');
insert into public.comments (id, project_id, page_path, text) values
  ('10000000-0000-4000-8000-000000000001', 'test-eins', '/start', 'Thread von Mia'),
  ('10000000-0000-4000-8000-000000000009', 'test-zwei', '/start', 'Thread in test-zwei');

select pg_temp.als(null);
select is_empty($$select id from public.comments$$, 'ohne Schlüssel: liest keine Kommentare');
select is_empty($$select id from public.annotation_people$$, 'ohne Schlüssel: sieht keine Personen');
select is_empty($$select * from public.annotation_whoami('test-eins')$$, 'ohne Schlüssel: whoami leer');
select throws_ok($$insert into public.comments (project_id, page_path, text) values ('test-eins', '/', 'x')$$,
  '42501', 'no access to this project', 'ohne Schlüssel: Insert abgelehnt');
select throws_ok($$select public.annotation_rename('Dieb')$$, '28000', 'invalid key', 'ohne Schlüssel: Umbenennen abgelehnt');

select pg_temp.als('k-falsch');
select is_empty($$select id from public.comments$$, 'falscher Schlüssel: liest keine Kommentare');
select is_empty($$select * from public.annotation_whoami('test-eins')$$, 'falscher Schlüssel: whoami leer');
select throws_ok($$insert into public.comments (project_id, page_path, text) values ('test-eins', '/', 'x')$$,
  '42501', 'no access to this project', 'falscher Schlüssel: Insert abgelehnt');
update public.comments set resolved = true;
delete from public.comments;

reset role;
select results_eq($$select count(*)::int, count(*) filter (where resolved)::int from public.comments where project_id like 'test-%'$$,
  $$values (2, 0)$$, 'falscher Schlüssel: Update und Delete wirkungslos');

-- ---------------------------------------------------------------- Mitarbeiter: alle Projekte
select pg_temp.als('k-max');
select results_eq($$select * from public.annotation_whoami('test-eins')$$,
  $$values ('20000000-0000-4000-8000-000000000002'::uuid, 'Max'::text)$$, 'Mitarbeiter: whoami in test-eins');
select results_eq($$select display_name from public.annotation_whoami('ganz-neues-projekt')$$,
  $$values ('Max'::text)$$, 'Mitarbeiter: Zugriff auch auf ein Projekt ohne Vorlauf');
select results_eq($$select id from public.comments where project_id like 'test-%' order by id$$,
  $$values ('10000000-0000-4000-8000-000000000001'::uuid), ('10000000-0000-4000-8000-000000000009'::uuid)$$,
  'Mitarbeiter: liest Kommentare aller Projekte');

-- ---------------------------------------------------------------- Externer: nur eigenes Projekt
select pg_temp.als('k-eva');
select results_eq($$select display_name from public.annotation_whoami('test-eins')$$,
  $$values ('Eva Extern'::text)$$, 'Externe: whoami im eigenen Projekt');
select is_empty($$select * from public.annotation_whoami('test-zwei')$$, 'Externe: whoami im fremden Projekt leer');
select results_eq($$select id from public.comments$$,
  $$values ('10000000-0000-4000-8000-000000000001'::uuid)$$, 'Externe: liest nur Kommentare des eigenen Projekts');
select throws_ok($$insert into public.comments (project_id, page_path, text) values ('test-zwei', '/', 'x')$$,
  '42501', 'no access to this project', 'Externe: Insert im fremden Projekt abgelehnt');
update public.comments set resolved = true where id = '10000000-0000-4000-8000-000000000009';
delete from public.comments where id = '10000000-0000-4000-8000-000000000009';
select throws_ok($$select public.annotation_rename('x' || '') $$, '23514', null, 'Name: 1 Zeichen abgelehnt');

select pg_temp.als('k-ole');
select is_empty($$select id from public.comments where project_id = 'test-eins'$$, 'Externer test-zwei: sieht test-eins nicht');
select is_empty($$select id from public.annotation_people where id = '20000000-0000-4000-8000-000000000003'$$,
  'Externer test-zwei: sieht Personen aus test-eins nicht');

reset role;
select results_eq($$select resolved from public.comments where id = '10000000-0000-4000-8000-000000000009'$$,
  $$values (false)$$, 'Externe: Update und Delete im fremden Projekt wirkungslos');

-- ---------------------------------------------------------------- E-Mail und Schlüssel nie lesbar
select pg_temp.als('k-eva');
select throws_ok($$select email from public.annotation_people$$, '42501', null, 'Externe: E-Mail nicht lesbar');
select throws_ok($$select first_name, last_name from public.annotation_people$$, '42501', null, 'Externe: Vor- und Nachname nicht lesbar');
select throws_ok($$select key_hash from public.annotation_people$$, '42501', null, 'Externe: key_hash nicht lesbar');
select throws_ok($$select * from public.annotation_people$$, '42501', null, 'Externe: select * auf Personen gesperrt');
select pg_temp.als('k-mia');
select throws_ok($$select email from public.annotation_people$$, '42501', null, 'Mitarbeiter: E-Mail über die API ebenfalls nicht lesbar');

-- ---------------------------------------------------------------- Insert: Server setzt Autor, Status, Zeit
select pg_temp.als('k-eva');
select throws_ok($$insert into public.comments (project_id, page_path, text, author_id)
  values ('test-eins', '/', 'x', '20000000-0000-4000-8000-000000000001')$$, '42501', null, 'Insert: author_id vom Browser gesperrt');
select throws_ok($$insert into public.comments (project_id, page_path, text, resolved)
  values ('test-eins', '/', 'x', true)$$, '42501', null, 'Insert: resolved vom Browser gesperrt');
select lives_ok($$insert into public.comments (id, project_id, page_path, text, parent_id)
  values ('10000000-0000-4000-8000-000000000002', 'test-eins', '/start', 'Antwort von Eva', '10000000-0000-4000-8000-000000000001')$$,
  'Externe antwortet im eigenen Projekt');

reset role;
select results_eq(
  $$select author_id, resolved, created_at = now() from public.comments where id = '10000000-0000-4000-8000-000000000002'$$,
  $$values ('20000000-0000-4000-8000-000000000003'::uuid, false, true)$$, 'Insert: Autor und Zeit kommen vom Server');

-- ---------------------------------------------------------------- Personen: Namen beim Lesen
select pg_temp.als('k-eva');
select results_eq(
  $$select p.display_name from public.comments c join public.annotation_people p on p.id = c.author_id order by c.created_at, c.id$$,
  $$values ('Mia Muster'::text), ('Eva Extern'::text)$$, 'Externe liest Kommentare samt Namen');
select results_eq($$select display_name from public.annotation_people order by display_name$$,
  $$values ('Eva Extern'::text), ('Mia Muster'::text)$$, 'Externe sieht nur sich und Autoren ihres Projekts');

-- ---------------------------------------------------------------- Umbenennen wirkt auf alte Kommentare
select pg_temp.als('k-mia');
select throws_ok($$select public.annotation_rename('   X   ')$$, '23514', null, 'Name: 1 Zeichen nach trim abgelehnt');
select throws_ok($$select public.annotation_rename(repeat('x', 49))$$, '23514', null, 'Name: 49 Zeichen abgelehnt');
select lives_ok($$select public.annotation_rename(repeat('ü', 48))$$, 'Name: 48 Zeichen erlaubt');
select lives_ok($$select public.annotation_rename('  Mia Neu  ')$$, 'Name: getrimmt gespeichert');

select pg_temp.als('k-eva');
select results_eq(
  $$select p.display_name from public.comments c join public.annotation_people p on p.id = c.author_id
    where c.id = '10000000-0000-4000-8000-000000000001'$$,
  $$values ('Mia Neu'::text)$$, 'Umbenennung: alter Kommentar zeigt für andere den neuen Namen');
select results_eq(
  $$select p.display_name from public.comments c join public.annotation_people p on p.id = c.author_id
    where c.id = '10000000-0000-4000-8000-000000000002'$$,
  $$values ('Eva Extern'::text)$$, 'Umbenennung: andere Personen unberührt');
reset role;
select is((select first_name from public.annotation_people where id = '20000000-0000-4000-8000-000000000001'),
  'Mia', 'Umbenennung: Mitarbeiterliste (Vorname) bleibt unverändert');

-- ---------------------------------------------------------------- Spaltenrechte beim Update
select pg_temp.als('k-eva');
select throws_ok($$update public.comments set text = 'neu'$$, '42501', null, 'Update: Text gesperrt');
select throws_ok($$update public.comments set project_id = 'test-zwei'$$, '42501', null, 'Update: Projekt gesperrt');
select throws_ok($$update public.comments set author_id = '20000000-0000-4000-8000-000000000003'$$, '42501', null, 'Update: Autor gesperrt');
select lives_ok($$update public.comments set resolved = true, resolved_at = '2026-10-26 12:00+00', selector = '#neu'
  where id = '10000000-0000-4000-8000-000000000001'$$, 'Update: Erledigt-Status und Position erlaubt');
reset role;
select results_eq($$select resolved, selector from public.comments where id = '10000000-0000-4000-8000-000000000001'$$,
  $$values (true, '#neu'::text)$$, 'Update: Werte gespeichert');

-- ---------------------------------------------------------------- Antworten
select pg_temp.als('k-eva');
select throws_ok($$insert into public.comments (project_id, page_path, text, parent_id)
  values ('test-eins', '/', 'x', '10000000-0000-4000-8000-000000000002')$$, '23503', 'invalid parent', 'Antwort auf Antwort abgelehnt');
select pg_temp.als('k-max');
select throws_ok($$insert into public.comments (project_id, page_path, text, parent_id)
  values ('test-zwei', '/', 'x', '10000000-0000-4000-8000-000000000001')$$, '23503', 'invalid parent', 'Antwort auf Thread eines anderen Projekts abgelehnt');

-- ---------------------------------------------------------------- Entzug und neuer Schlüssel
select pg_temp.als('k-rita');
insert into public.comments (id, project_id, page_path, text) values
  ('10000000-0000-4000-8000-000000000005', 'test-eins', '/', 'von Rita');
reset role;
set local role service_role;
select lives_ok($$select public.annotation_revoke_key('20000000-0000-4000-8000-000000000005')$$, 'Entzug per service_role');

select pg_temp.als('k-rita');
select is_empty($$select id from public.comments$$, 'gelöschter Schlüssel: liest nichts');
select throws_ok($$insert into public.comments (project_id, page_path, text) values ('test-eins', '/', 'x')$$,
  '42501', 'no access to this project', 'gelöschter Schlüssel: schreibt nichts');
delete from public.comments where id = '10000000-0000-4000-8000-000000000005';
select throws_ok($$select public.annotation_rename('Rita Neu')$$, '28000', 'invalid key', 'gelöschter Schlüssel: Umbenennen abgelehnt');

reset role;
set local role service_role;
create temp table neuer_schluessel as select public.annotation_new_key('20000000-0000-4000-8000-000000000003') as k;
select pg_temp.als('k-eva');
select is_empty($$select id from public.comments$$, 'neu erzeugter Schlüssel: alter Schlüssel liest nichts');
reset role;
select pg_temp.als((select k from neuer_schluessel));
select results_eq($$select display_name from public.annotation_whoami('test-eins')$$,
  $$values ('Eva Extern'::text)$$, 'neu erzeugter Schlüssel: neuer Schlüssel gilt');

select pg_temp.als('k-eva');
select results_eq($$select count(*)::int from public.comments where id = '10000000-0000-4000-8000-000000000005'$$,
  $$values (0)$$, 'Hilfsprüfung: alter Schlüssel sieht auch Ritas Kommentar nicht');
select pg_temp.als('k-mia');
select results_eq(
  $$select p.display_name from public.comments c join public.annotation_people p on p.id = c.author_id
    where c.id = '10000000-0000-4000-8000-000000000005'$$,
  $$values ('Rita'::text)$$, 'Entzug: Kommentare der Person bleiben samt Namen lesbar');

-- ---------------------------------------------------------------- Löschen nur eigene
select pg_temp.als('k-max');
delete from public.comments where id = '10000000-0000-4000-8000-000000000001';
reset role;
select isnt_empty($$select id from public.comments where id = '10000000-0000-4000-8000-000000000001'$$,
  'Löschen: fremder Thread bleibt');
select pg_temp.als('k-mia');
delete from public.comments where id = '10000000-0000-4000-8000-000000000001';
reset role;
select is_empty($$select id from public.comments where id in ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002')$$,
  'Löschen: eigener Thread weg, fremde Antwort fällt per Cascade mit');

-- ---------------------------------------------------------------- Admin-Funktionen
select pg_temp.als('k-mia');
select throws_ok($$select public.annotation_add_staff('x@dayone.de', 'X')$$, '42501', null, 'Admin: add_staff für anon gesperrt');
select throws_ok($$select public.annotation_add_guest('test-eins', 'Eve')$$, '42501', null, 'Admin: add_guest für anon gesperrt');
select throws_ok($$select public.annotation_new_key('20000000-0000-4000-8000-000000000003')$$, '42501', null, 'Admin: new_key für anon gesperrt');
select throws_ok($$select public.annotation_revoke_key('20000000-0000-4000-8000-000000000003')$$, '42501', null, 'Admin: revoke_key für anon gesperrt');

reset role;
set local role service_role;
create temp table gast as select * from public.annotation_add_guest(' test-eins ', '  Gina Gast  ');
create temp table mitarbeiter as select * from public.annotation_add_staff(' Neu@DAYONE.de ', ' Nina ', ' ');
reset role;
select results_eq(
  $$select p.project_id, p.display_name, p.key_hash = extensions.digest(g.key, 'sha256'), length(g.key)
    from gast g join public.annotation_people p on p.id = g.person_id$$,
  $$values ('test-eins'::text, 'Gina Gast'::text, true, 64)$$, 'Admin: Externe angelegt, nur Hash gespeichert');
select results_eq(
  $$select p.email, p.first_name, p.last_name, p.display_name from mitarbeiter m join public.annotation_people p on p.id = m.person_id$$,
  $$values ('neu@dayone.de'::text, 'Nina'::text, null::text, 'Nina'::text)$$, 'Admin: Mitarbeiter angelegt, E-Mail normalisiert');
set local role service_role;
select throws_ok($$select public.annotation_add_staff('fremd@example.com', 'Fred')$$, '23514', null, 'Admin: nur DAYONE-E-Mail');
reset role;

-- ---------------------------------------------------------------- Rechte und Realtime-Ping
select table_privs_are('public', 'comments', 'anon', array['SELECT', 'DELETE'], 'comments: anon ohne TRUNCATE, Insert/Update nur spaltenweise');
select table_privs_are('public', 'comments', 'authenticated', array[]::text[], 'comments: authenticated ohne Rechte');
select table_privs_are('public', 'annotation_people', 'anon', array[]::text[], 'people: anon nur spaltenweise');
select table_privs_are('public', 'annotation_people', 'authenticated', array[]::text[], 'people: authenticated ohne Rechte');
select is(
  (select count(*)::int from realtime.messages where topic = 'annotation:test-eins' and event = 'changed' and not private and payload - 'id' = '{}'::jsonb),
  8, 'Realtime: je Änderung in test-eins ein öffentlicher Ping ohne Inhalt (6 Kommentare, 2 Umbenennungen)');
select is(
  (select count(*)::int from realtime.messages where topic = 'annotation:test-zwei'),
  3, 'Realtime: Umbenennung pingt alle Projekte der Person (1 Kommentar, 2 Umbenennungen von Mia)');

select * from finish();
rollback;
