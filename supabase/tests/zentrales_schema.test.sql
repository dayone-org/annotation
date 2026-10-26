-- Schlüssel, Projekte, Gäste, RLS und Trigger des zentralen Schemas, ausgeführt wie PostgREST
-- (Rolle anon, Schlüssel im Header x-annotation-key). Unabhängig vom Seed, alles in einer Transaktion.
begin;
create extension if not exists pgtap with schema extensions;
select plan(112);

-- Browser wechseln: Rolle anon, Schlüssel im Header (null = kein Header).
create function pg_temp.als(p_key text) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.headers',
    case when p_key is null then '{}' else json_build_object('x-annotation-key', p_key)::text end, true);
  set local role anon;
end $$;

-- DETAIL einer Fehlermeldung, wie PostgREST sie als "details" ausliefert.
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

-- Projekte: test-eins (zwei Domains), test-zwei. Projekt-Schlüssel bekannt, Generation 1.
insert into public.annotation_projects (id, name, key_hash, key_generation) values
  ('test-eins', 'Test Eins', extensions.digest('pk-eins', 'sha256'), 1),
  ('test-zwei', 'Test Zwei', extensions.digest('pk-zwei', 'sha256'), 1);
insert into public.annotation_project_domains (host, project_id) values
  ('eins.test', 'test-eins'), ('eins.test:8443', 'test-eins'), ('zwei.test', 'test-zwei');

-- Mitarbeitende: Mia, Max.
insert into public.annotation_people (id, email, first_name, last_name, display_name, key_hash) values
  ('20000000-0000-4000-8000-000000000001', 'mia@dayone.de', 'Mia', 'Muster', 'Mia Muster', extensions.digest('k-mia', 'sha256')),
  ('20000000-0000-4000-8000-000000000002', 'max@dayone.de', 'Max', null, 'Max', extensions.digest('k-max', 'sha256'));

create temp table gast (name text primary key, k text);
grant select, insert on gast to anon;

-- ---------------------------------------------------------------- Ohne und mit falschem Schlüssel
select pg_temp.als('k-mia');
insert into public.comments (id, project_id, page_path, text) values
  ('10000000-0000-4000-8000-000000000001', 'test-eins', '/start', 'Thread von Mia'),
  ('10000000-0000-4000-8000-000000000009', 'test-zwei', '/start', 'Thread in test-zwei');

select pg_temp.als(null);
select is_empty($$select id from public.comments$$, 'ohne Schlüssel: liest keine Kommentare');
select is_empty($$select id from public.annotation_people$$, 'ohne Schlüssel: sieht keine Personen');
select is_empty($$select * from public.annotation_whoami('eins.test')$$, 'ohne Schlüssel: whoami leer, Overlay bleibt unsichtbar');
select throws_ok($$insert into public.comments (project_id, page_path, text) values ('test-eins', '/', 'x')$$,
  '42501', 'no access to this project', 'ohne Schlüssel: Insert abgelehnt');
select throws_ok($$select public.annotation_rename('Dieb')$$, '28000', 'invalid key', 'ohne Schlüssel: Umbenennen abgelehnt');

select pg_temp.als('k-falsch');
select is_empty($$select id from public.comments$$, 'falscher Schlüssel: liest keine Kommentare');
select is_empty($$select * from public.annotation_whoami('eins.test')$$, 'falscher Schlüssel: whoami leer');
select throws_ok($$insert into public.comments (project_id, page_path, text) values ('test-eins', '/', 'x')$$,
  '42501', 'no access to this project', 'falscher Schlüssel: Insert abgelehnt');
update public.comments set resolved = true;
delete from public.comments;
reset role;
select results_eq($$select count(*)::int, count(*) filter (where resolved)::int from public.comments where project_id like 'test-%'$$,
  $$values (2, 0)$$, 'falscher Schlüssel: Update und Delete wirkungslos');

-- ---------------------------------------------------------------- Projekt über Domain oder Überschreibung
select pg_temp.als('k-max');
select results_eq($$select project_id, person_id, display_name, is_guest from public.annotation_whoami('eins.test')$$,
  $$values ('test-eins'::text, '20000000-0000-4000-8000-000000000002'::uuid, 'Max'::text, false)$$, 'Domain: eins.test gehört zu test-eins');
select results_eq($$select project_id from public.annotation_whoami('EINS.Test:8443')$$,
  $$values ('test-eins'::text)$$, 'Domain: zweite Domain, Groß-/Kleinschreibung egal');
select results_eq($$select project_id from public.annotation_whoami('eins.test', 'test-zwei')$$,
  $$values ('test-zwei'::text)$$, 'Domain: projectId überschreibt die Domain');
select is_empty($$select * from public.annotation_whoami('unbekannt.test')$$, 'Domain: unbekannte Domain ohne Projekt');
select is_empty($$select * from public.annotation_whoami('eins.test', 'nicht-angelegt')$$, 'Projekt: nicht angelegtes Projekt ohne Zugriff');
select throws_ok($$insert into public.comments (project_id, page_path, text) values ('nicht-angelegt', '/', 'x')$$,
  '42501', 'no access to this project', 'Projekt: kein Kommentar in nicht angelegtem Projekt');
select results_eq($$select id from public.comments where project_id like 'test-%' order by id$$,
  $$values ('10000000-0000-4000-8000-000000000001'::uuid), ('10000000-0000-4000-8000-000000000009'::uuid)$$,
  'Mitarbeitende: lesen Kommentare aller Projekte');

-- ---------------------------------------------------------------- Projekt-Link und Beitritt als Gast
select pg_temp.als(null);
select ok(public.annotation_project_key_ok('pk-eins', 'eins.test'), 'Projekt-Link: gilt auf seiner Domain');
select ok(not public.annotation_project_key_ok('pk-eins', 'zwei.test'), 'Projekt-Link: gilt nicht auf fremder Domain');
select ok(not public.annotation_project_key_ok('pk-falsch', 'eins.test'), 'Projekt-Link: falscher Link ungültig');
select throws_ok($$select public.annotation_join('pk-falsch', 'Eva')$$, '28000', 'invalid project link', 'Beitritt: falscher Link abgelehnt');
insert into gast values ('eva', public.annotation_join('pk-eins', '  Eva Extern  '));
insert into gast values ('ole', public.annotation_join('pk-zwei', 'Ole'));
select is((select length(k) from gast where name = 'eva'), 64, 'Beitritt: liefert eigenen Browser-Schlüssel (256 Bit)');

select pg_temp.als((select k from gast where name = 'eva'));
select results_eq($$select project_id, display_name, is_guest from public.annotation_whoami('eins.test')$$,
  $$values ('test-eins'::text, 'Eva Extern'::text, true)$$, 'Gast: wiedererkannt ohne Link, als Gast markiert, Name getrimmt');
select is_empty($$select * from public.annotation_whoami('zwei.test')$$, 'Gast: fremde Domain ohne Zugriff');
select is_empty($$select * from public.annotation_whoami('eins.test', 'test-zwei')$$, 'Gast: fremdes Projekt per Überschreibung ohne Zugriff');
select results_eq($$select id from public.comments$$,
  $$values ('10000000-0000-4000-8000-000000000001'::uuid)$$, 'Gast: liest nur Kommentare des eigenen Projekts');
select throws_ok($$insert into public.comments (project_id, page_path, text) values ('test-zwei', '/', 'x')$$,
  '42501', 'no access to this project', 'Gast: Insert im fremden Projekt abgelehnt');
update public.comments set resolved = true where id = '10000000-0000-4000-8000-000000000009';
reset role;
select results_eq($$select resolved from public.comments where id = '10000000-0000-4000-8000-000000000009'$$,
  $$values (false)$$, 'Gast: Update im fremden Projekt wirkungslos');

-- ---------------------------------------------------------------- Namen: unsichtbare Zeichen, Länge, Fehlerdetails
select pg_temp.als(null);
select throws_ok($$select public.annotation_join('pk-eins', e'\u200B\u200BA\u200B')$$, '23514', 'invalid name', 'Name: Zero-Width zählt nicht, 1 sichtbares Zeichen abgelehnt');
select throws_ok($$select public.annotation_join('pk-eins', e'\t\n \u00A0')$$, '23514', 'invalid name', 'Name: nur Tabs, Umbrüche, Leerzeichen abgelehnt');
select throws_ok($$select public.annotation_join('pk-eins', repeat('x', 49))$$, '23514', 'invalid name', 'Name: 49 Zeichen abgelehnt');
select is(pg_temp.details($$select public.annotation_join('pk-eins', 'X')$$), '', 'Name: Fehlermeldung beim Beitritt ohne Zeilen-Details');
select throws_ok($$select public.annotation_join('pk-eins', '-- ..')$$, '23514', 'invalid name', 'Name: ohne Buchstaben oder Ziffern abgelehnt');
select throws_ok($$select public.annotation_join('pk-eins', e'\U0001F600\U0001F600')$$, '23514', 'invalid name', 'Name: nur Emoji abgelehnt');
select throws_ok($$select public.annotation_join('pk-eins', e'A\u0301\u0301\u0301')$$, '23514', 'invalid name', 'Name: ein Buchstabe plus Kombinationszeichen abgelehnt');
select throws_ok($$select public.annotation_join('pk-eins', 'ab' || repeat(e'\u0301', 47))$$, '23514', 'invalid name', 'Name: Kombinationszeichen zählen gegen die 48');
select ok(public.annotation_name_ok('Jo') and public.annotation_name_ok('Ülla') and public.annotation_name_ok('Märta Prüfer')
  and public.annotation_name_ok('李明') and public.annotation_name_ok('R2'), 'Name: Jo, Ülla, Märta Prüfer, 李明, R2 gültig');
insert into gast values ('uella', public.annotation_join('pk-eins', e'U\u0308lla'));
insert into gast values ('ina', public.annotation_join('pk-eins', e'\u00A0In\u200Ba\tB\u202E\n'));
insert into gast values ('lang', public.annotation_join('pk-eins', repeat('ü', 48) || e'\u200B'));
reset role;
select results_eq($$select display_name from public.annotation_people where key_hash in
    (select extensions.digest(k, 'sha256') from gast where name in ('ina', 'uella', 'lang')) order by char_length(display_name), display_name$$,
  $$values ('InaB'::text), (e'\u00DClla'), (repeat('ü', 48))$$, 'Name: unsichtbare Zeichen entfernt, NFC normalisiert, 48 erlaubt');

select pg_temp.als((select k from gast where name = 'eva'));
select throws_ok($$select public.annotation_rename(e'X\u200B\u200D')$$, '23514', 'invalid name', 'Umbenennen: Zero-Width zählt nicht');
select is(pg_temp.details($$select public.annotation_rename('X')$$), '', 'Umbenennen: Fehlermeldung ohne Zeilen-Details');

-- ---------------------------------------------------------------- E-Mail, Projekt und Schlüssel nie lesbar
select throws_ok($$select email from public.annotation_people$$, '42501', null, 'Gast: E-Mail nicht lesbar');
select throws_ok($$select key_hash from public.annotation_people$$, '42501', null, 'Gast: key_hash nicht lesbar');
select throws_ok($$select project_id from public.annotation_people$$, '42501', null, 'Gast: Projekt anderer Personen nicht lesbar');
select throws_ok($$select * from public.annotation_people$$, '42501', null, 'Gast: select * auf Personen gesperrt');
select throws_ok($$select id from public.annotation_projects$$, '42501', null, 'Gast: Projekte nicht lesbar');
select throws_ok($$select host from public.annotation_project_domains$$, '42501', null, 'Gast: Domains nicht lesbar');
select pg_temp.als('k-mia');
select throws_ok($$select email from public.annotation_people$$, '42501', null, 'Mitarbeitende: E-Mail über die API ebenfalls nicht lesbar');

-- ---------------------------------------------------------------- Insert: Server setzt Autor, Status, Zeit
select pg_temp.als((select k from gast where name = 'eva'));
select throws_ok($$insert into public.comments (project_id, page_path, text, author_id)
  values ('test-eins', '/', 'x', '20000000-0000-4000-8000-000000000001')$$, '42501', null, 'Insert: author_id vom Browser gesperrt');
select throws_ok($$insert into public.comments (project_id, page_path, text, resolved)
  values ('test-eins', '/', 'x', true)$$, '42501', null, 'Insert: resolved vom Browser gesperrt');
select lives_ok($$insert into public.comments (id, project_id, page_path, text, parent_id)
  values ('10000000-0000-4000-8000-000000000002', 'test-eins', '/start', 'Antwort von Eva', '10000000-0000-4000-8000-000000000001')$$,
  'Gast antwortet im eigenen Projekt');
reset role;
select results_eq(
  $$select author_id = (select id from public.annotation_people where display_name = 'Eva Extern'), resolved, created_at = now()
    from public.comments where id = '10000000-0000-4000-8000-000000000002'$$,
  $$values (true, false, true)$$, 'Insert: Autor und Zeit kommen vom Server');

-- ---------------------------------------------------------------- Namen beim Lesen, Gast-Kennzeichen
select pg_temp.als((select k from gast where name = 'eva'));
select results_eq(
  $$select p.display_name, p.is_guest from public.comments c join public.annotation_people p on p.id = c.author_id order by c.created_at, c.id$$,
  $$values ('Mia Muster'::text, false), ('Eva Extern'::text, true)$$, 'Gast liest Kommentare samt Namen und Gast-Kennzeichen');
select results_eq($$select display_name from public.annotation_people order by display_name$$,
  $$values ('Eva Extern'::text), ('Mia Muster'::text)$$, 'Gast sieht nur sich und Autoren seines Projekts');
select pg_temp.als((select k from gast where name = 'ole'));
select is_empty($$select id from public.annotation_people where display_name = 'Eva Extern'$$, 'Gast test-zwei: sieht Gäste aus test-eins nicht');

-- ---------------------------------------------------------------- Umbenennen: nur Gäste, wirkt auf alte Kommentare
select pg_temp.als('k-mia');
select throws_ok($$select public.annotation_rename('Mia Neu')$$, '42501', 'staff names are fixed', 'Mitarbeitende: Umbenennen serverseitig gesperrt');
reset role;
create temp table rename_vorher as select count(*)::int as n from realtime.messages
  where topic = 'annotation:' || (select realtime_topic from public.annotation_projects where id = 'test-eins');
grant select on rename_vorher to anon;
select pg_temp.als((select k from gast where name = 'eva'));
select lives_ok($$select public.annotation_rename(e'  Eva\u200B Neu  ')$$, 'Gast benennt sich um');
reset role;
select is((select count(*)::int from realtime.messages
  where topic = 'annotation:' || (select realtime_topic from public.annotation_projects where id = 'test-eins')),
  (select n + 1 from rename_vorher), 'Umbenennung: Ping in das Projekt mit Kommentaren der Person');
select pg_temp.als('k-max');
select results_eq(
  $$select p.display_name from public.comments c join public.annotation_people p on p.id = c.author_id
    where c.id = '10000000-0000-4000-8000-000000000002'$$,
  $$values ('Eva Neu'::text)$$, 'Umbenennung: alter Kommentar zeigt für andere den neuen Namen');
reset role;
select is((select display_name from public.annotation_people where id = '20000000-0000-4000-8000-000000000001'),
  'Mia Muster', 'Umbenennung: Mitarbeiter-Name unverändert');

-- ---------------------------------------------------------------- Erledigen jeder, Verschieben nur der Autor
select pg_temp.als((select k from gast where name = 'eva'));
select throws_ok($$update public.comments set text = 'neu'$$, '42501', null, 'Update: Text gesperrt');
select throws_ok($$update public.comments set project_id = 'test-zwei'$$, '42501', null, 'Update: Projekt gesperrt');
select throws_ok($$update public.comments set resolved_at = now()$$, '42501', null, 'Update: resolved_at vom Browser gesperrt');
select throws_ok($$update public.comments set selector = '#weg' where id = '10000000-0000-4000-8000-000000000001'$$,
  '42501', 'only the author can move this thread', 'Verschieben: fremder Thread gesperrt (selector)');
select throws_ok($$update public.comments set rect = '{"x": 9}' where id = '10000000-0000-4000-8000-000000000001'$$,
  '42501', 'only the author can move this thread', 'Verschieben: fremder Thread gesperrt (rect)');
select lives_ok($$update public.comments set resolved = true where id = '10000000-0000-4000-8000-000000000001'$$,
  'Erledigen: Gast erledigt fremden Thread');
reset role;
select results_eq($$select resolved, resolved_at = now() from public.comments where id = '10000000-0000-4000-8000-000000000001'$$,
  $$values (true, true)$$, 'Erledigen: resolved_at setzt die DB');
select pg_temp.als('k-mia');
select lives_ok($$update public.comments set resolved = false, selector = '#neu', rect = '{"x": 1}'
  where id = '10000000-0000-4000-8000-000000000001'$$, 'Autor öffnet und verschiebt eigenen Thread');
reset role;
select results_eq($$select resolved, resolved_at, selector from public.comments where id = '10000000-0000-4000-8000-000000000001'$$,
  $$values (false, null::timestamptz, '#neu'::text)$$, 'Wieder offen: resolved_at geleert, Position gespeichert');

-- ---------------------------------------------------------------- Antworten
select pg_temp.als((select k from gast where name = 'eva'));
select throws_ok($$insert into public.comments (project_id, page_path, text, parent_id)
  values ('test-eins', '/', 'x', '10000000-0000-4000-8000-000000000002')$$, '23503', 'invalid parent', 'Antwort auf Antwort abgelehnt');
select pg_temp.als('k-max');
select throws_ok($$insert into public.comments (project_id, page_path, text, parent_id)
  values ('test-zwei', '/', 'x', '10000000-0000-4000-8000-000000000001')$$, '23503', 'invalid parent', 'Antwort auf Thread eines anderen Projekts abgelehnt');

-- ---------------------------------------------------------------- Löschen
-- Max: Thread 003 mit eigener Antwort 004, Thread 005 ohne Antwort. Mia: Thread 001 mit Evas Antwort 002.
insert into public.comments (id, project_id, page_path, text) values
  ('10000000-0000-4000-8000-000000000003', 'test-eins', '/', 'Max allein'),
  ('10000000-0000-4000-8000-000000000005', 'test-eins', '/', 'Max ohne Antwort');
insert into public.comments (id, project_id, page_path, text, parent_id) values
  ('10000000-0000-4000-8000-000000000004', 'test-eins', '/', 'Max ergänzt', '10000000-0000-4000-8000-000000000003');
delete from public.comments where id = '10000000-0000-4000-8000-000000000001';
reset role;
select isnt_empty($$select id from public.comments where id = '10000000-0000-4000-8000-000000000001'$$, 'Löschen: fremder Thread bleibt');
select pg_temp.als('k-mia');
select throws_ok($$delete from public.comments where id = '10000000-0000-4000-8000-000000000001'$$,
  '23503', null, 'Löschen: eigener Thread mit fremder Antwort abgelehnt');
reset role;
select results_eq($$select count(*)::int from public.comments where id in ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002')$$,
  $$values (2)$$, 'Löschen: Thread und fremde Antwort bleiben');
select pg_temp.als('k-max');
select throws_ok($$delete from public.comments where id = '10000000-0000-4000-8000-000000000003'$$,
  '23503', null, 'Löschen: auch Thread mit nur eigenen Antworten abgelehnt (kein Cascade)');
select lives_ok($$delete from public.comments where id = '10000000-0000-4000-8000-000000000004'$$, 'Löschen: eigene Antwort');
select lives_ok($$delete from public.comments where id in ('10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000005')$$,
  'Löschen: eigene Threads ohne Antworten');
reset role;
select is_empty($$select id from public.comments where id in ('10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000005')$$,
  'Löschen: eigene Antwort und antwortlose Threads weg');

-- ---------------------------------------------------------------- Realtime: geheimes Topic, nur mit Zugriff
create temp table topic_alt as select realtime_topic from public.annotation_projects where id = 'test-eins';
grant select on topic_alt to anon;
select is(
  (select count(*)::int from realtime.messages where topic = 'annotation:' || (select realtime_topic from topic_alt)
     and event = 'changed' and not private and payload - 'id' = '{}'::jsonb) > 0,
  true, 'Realtime: Pings landen auf dem geheimen Topic, ohne Inhalt');
select is((select count(*)::int from realtime.messages where topic like 'annotation:test-%'), 0,
  'Realtime: kein Ping auf einem erratbaren Topic');
select pg_temp.als((select k from gast where name = 'eva'));
select results_eq($$select realtime_topic from public.annotation_whoami('eins.test')$$,
  $$select realtime_topic from topic_alt$$, 'Realtime: Gast mit Zugriff erfährt das Topic');
select pg_temp.als((select k from gast where name = 'ole'));
select is_empty($$select realtime_topic from public.annotation_whoami('eins.test')$$, 'Realtime: Gast eines anderen Projekts erfährt das Topic nicht');

-- ---------------------------------------------------------------- Neuer Projekt-Link sperrt alten Link und Gäste
reset role;
create temp table pings_vorher as
  select count(*)::int as n from realtime.messages where topic = 'annotation:' || (select realtime_topic from topic_alt);
set local role service_role;
create temp table pk_neu as select public.annotation_new_project_key('test-eins') as k;
grant select on pk_neu to anon;
reset role;
select isnt((select realtime_topic from public.annotation_projects where id = 'test-eins'), (select realtime_topic from topic_alt),
  'Neuer Projekt-Link: Realtime-Topic neu gewürfelt');
select is((select count(*)::int from realtime.messages where topic = 'annotation:' || (select realtime_topic from topic_alt)),
  (select n + 1 from pings_vorher), 'Neuer Projekt-Link: ein letzter Ping auf das alte Topic');
select pg_temp.als((select k from gast where name = 'eva'));
select is_empty($$select * from public.annotation_whoami('eins.test')$$, 'Neuer Projekt-Link: alter Gast nicht mehr erkannt');
select is_empty($$select id from public.comments$$, 'Neuer Projekt-Link: alter Gast liest nichts');
select throws_ok($$insert into public.comments (project_id, page_path, text) values ('test-eins', '/', 'x')$$,
  '42501', 'no access to this project', 'Neuer Projekt-Link: alter Gast schreibt nichts');
select throws_ok($$select public.annotation_rename('Eva Wieder')$$, '28000', 'invalid key', 'Neuer Projekt-Link: alter Gast benennt nicht um');
select pg_temp.als(null);
select throws_ok($$select public.annotation_join('pk-eins', 'Eva')$$, '28000', 'invalid project link', 'Neuer Projekt-Link: alter Link wirkungslos');
select ok(public.annotation_project_key_ok((select k from pk_neu), 'eins.test'), 'Neuer Projekt-Link: neuer Link gilt');
select pg_temp.als((select k from gast where name = 'ole'));
select results_eq($$select display_name from public.annotation_whoami('zwei.test')$$, $$values ('Ole'::text)$$,
  'Neuer Projekt-Link: Gäste anderer Projekte unberührt');
select pg_temp.als('k-mia');
select results_eq($$select p.display_name from public.comments c join public.annotation_people p on p.id = c.author_id
    where c.id = '10000000-0000-4000-8000-000000000002'$$,
  $$values ('Eva Neu'::text)$$, 'Neuer Projekt-Link: Kommentare gesperrter Gäste bleiben samt Namen lesbar');

-- ---------------------------------------------------------------- Mitarbeitende: Entzug und neuer Schlüssel
reset role;
set local role service_role;
select lives_ok($$select public.annotation_revoke_key('20000000-0000-4000-8000-000000000002')$$, 'Entzug per service_role');
select throws_ok($$select public.annotation_revoke_key((select id from public.annotation_people where display_name = 'Ole'))$$,
  'P0002', 'unknown staff member', 'Entzug: nur für Mitarbeitende');
create temp table mia_neu as select public.annotation_new_key('20000000-0000-4000-8000-000000000001') as k;
grant select on mia_neu to anon;
select pg_temp.als('k-max');
select is_empty($$select id from public.comments$$, 'gelöschter Schlüssel: liest nichts');
select throws_ok($$insert into public.comments (project_id, page_path, text) values ('test-eins', '/', 'x')$$,
  '42501', 'no access to this project', 'gelöschter Schlüssel: schreibt nichts');
select pg_temp.als('k-mia');
select is_empty($$select id from public.comments$$, 'neuer Schlüssel: alter Schlüssel liest nichts');
reset role;
select pg_temp.als((select k from mia_neu));
select results_eq($$select display_name from public.annotation_whoami('zwei.test')$$, $$values ('Mia Muster'::text)$$,
  'neuer Schlüssel: neuer Schlüssel gilt');

-- ---------------------------------------------------------------- Admin-Funktionen
select throws_ok($$select public.annotation_set_project('x-y', 'X', array['x.test'])$$, '42501', null, 'Admin: set_project für anon gesperrt');
select throws_ok($$select public.annotation_new_project_key('test-eins')$$, '42501', null, 'Admin: new_project_key für anon gesperrt');
select throws_ok($$select public.annotation_add_staff('x@dayone.de', 'X')$$, '42501', null, 'Admin: add_staff für anon gesperrt');
select throws_ok($$select public.annotation_new_key('20000000-0000-4000-8000-000000000001')$$, '42501', null, 'Admin: new_key für anon gesperrt');
select throws_ok($$select public.annotation_revoke_key('20000000-0000-4000-8000-000000000001')$$, '42501', null, 'Admin: revoke_key für anon gesperrt');

reset role;
set local role service_role;
select lives_ok($$select public.annotation_set_project('test-drei', ' Test Drei ', array['Drei.Test', 'drei.test:8080'])$$, 'Admin: Projekt angelegt');
select lives_ok($$select public.annotation_set_project('test-drei', 'Test Drei', array['neu.test'])$$, 'Admin: Domains ersetzt');
create temp table mitarbeiter as select * from public.annotation_add_staff(' Neu@DAYONE.de ', e' Nina\u200B ', ' ');
select throws_ok($$select public.annotation_add_staff('fremd@example.com', 'Fred')$$, '23514', null, 'Admin: nur DAYONE-E-Mail');
reset role;
select results_eq($$select host from public.annotation_project_domains where project_id = 'test-drei'$$,
  $$values ('neu.test'::text)$$, 'Admin: nur die neuen Domains gelten');
select results_eq(
  $$select p.email, p.first_name, p.last_name, p.display_name, p.key_hash = extensions.digest(m.key, 'sha256')
    from mitarbeiter m join public.annotation_people p on p.id = m.person_id$$,
  $$values ('neu@dayone.de'::text, 'Nina'::text, null::text, 'Nina'::text, true)$$, 'Admin: Mitarbeiterin angelegt, nur Hash gespeichert');

-- ---------------------------------------------------------------- Rechte
select table_privs_are('public', 'comments', 'anon', array['SELECT', 'DELETE'], 'comments: anon ohne TRUNCATE, Insert/Update nur spaltenweise');
select column_privs_are('public', 'comments', 'resolved_at', 'anon', array['SELECT'], 'comments.resolved_at: anon nur lesen');
select table_privs_are('public', 'comments', 'authenticated', array[]::text[], 'comments: authenticated ohne Rechte');
select table_privs_are('public', 'annotation_people', 'anon', array[]::text[], 'people: anon nur spaltenweise');
select table_privs_are('public', 'annotation_projects', 'anon', array[]::text[], 'projects: anon ohne Rechte');
select table_privs_are('public', 'annotation_project_domains', 'anon', array[]::text[], 'domains: anon ohne Rechte');

select * from finish();
rollback;
