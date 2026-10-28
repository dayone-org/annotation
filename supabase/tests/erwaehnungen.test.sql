-- Mentions and "For you": only staff mention staff, at most 10 per comment; "For you" shows mentions and
-- replies by others in own threads (staff: all projects, guests: their own), without resolved threads.
-- Run like PostgREST (role anon, key in the x-annotation-key header).
begin;
create extension if not exists pgtap with schema extensions;
select plan(75);

create function pg_temp.as_key(p_key text) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.headers',
    case when p_key is null then '{}' else json_build_object('x-annotation-key', p_key)::text end, true);
  set local role anon;
end $$;

insert into public.annotation_projects (id, name, key_hash, key_generation) values
  ('mn-eins', 'Mn Eins', extensions.digest('pk-mn1', 'sha256'), 1),
  ('mn-zwei', 'Mn Zwei', extensions.digest('pk-mn2', 'sha256'), 1);
insert into public.annotation_project_domains (host, project_id) values
  ('b.mn-eins.test', 'mn-eins'), ('a.mn-eins.test:5194', 'mn-eins'), ('mn-zwei.test', 'mn-zwei');

-- Ana, Bo, Cleo: staff. Rita: staff whose key is revoked. Ten more staff for the limit.
insert into public.annotation_people (id, email, first_name, display_name, key_hash) values
  ('40000000-0000-4000-8000-000000000001', 'ana.mn@dayone.de', 'Ana', 'Ana Ärger', extensions.digest('k-ana', 'sha256')),
  ('40000000-0000-4000-8000-000000000002', 'bo.mn@dayone.de', 'Bo', 'Bo Brandt', extensions.digest('k-bo', 'sha256')),
  ('40000000-0000-4000-8000-000000000003', 'cleo.mn@dayone.de', 'Cleo', 'Cleo Claus', extensions.digest('k-cleo', 'sha256')),
  ('40000000-0000-4000-8000-000000000004', 'rita.mn@dayone.de', 'Rita', 'Rita Ruhe', null);
insert into public.annotation_people (id, email, first_name, display_name, key_hash)
select ('41000000-0000-4000-8000-0000000000' || lpad(i::text, 2, '0'))::uuid, 'f' || i || '.mn@dayone.de', 'Füll',
  'Füll ' || lpad(i::text, 2, '0'), extensions.digest('k-f' || i, 'sha256')
from generate_series(1, 10) i;

create temp table keys (name text primary key, k text);
create temp table ids (name text primary key, id uuid);
grant select, insert on keys, ids to anon, service_role;

select pg_temp.as_key(null);
insert into keys values ('g1', public.annotation_join('pk-mn1', 'Gina Gast')), ('g2', public.annotation_join('pk-mn2', 'Gero Gast'));
select pg_temp.as_key((select k from keys where name = 'g1'));
insert into ids select 'g1', person_id from public.annotation_whoami('b.mn-eins.test');
select pg_temp.as_key((select k from keys where name = 'g2'));
insert into ids select 'g2', person_id from public.annotation_whoami('mn-zwei.test');

create function pg_temp.id(p_name text) returns uuid language sql as $$ select id from ids where name = p_name $$;
grant execute on function pg_temp.id(text) to anon;

-- ---------------------------------------------------------------- Privileges
reset role;
select results_eq(
  $$select r, t, p from unnest(array['anon', 'authenticated']) r,
      unnest(array['public.annotation_mentions', 'public.annotation_reads']) t,
      unnest(array['select', 'insert', 'update', 'delete', 'truncate']) p
    where has_table_privilege(r, t, p) order by 1, 2, 3$$,
  $$values ('anon', 'public.annotation_mentions', 'select')$$,
  'grants: anon may only read mentions; reads and authenticated get nothing');
select set_eq(
  $$select r, f from unnest(array['anon', 'authenticated']) r,
      unnest(array['public.annotation_staff_directory()', 'public.annotation_add_comment(text, text, text, text, jsonb, uuid, uuid[])',
        'public.annotation_for_you()', 'public.annotation_mark_read(uuid, timestamptz)',
        'public.annotation_mark_all_read(timestamptz)']) f
    where has_function_privilege(r, f, 'execute')$$,
  $$values ('anon', 'public.annotation_add_comment(text, text, text, text, jsonb, uuid, uuid[])'),
      ('anon', 'public.annotation_for_you()'),
      ('anon', 'public.annotation_mark_all_read(timestamptz)'), ('anon', 'public.annotation_mark_read(uuid, timestamptz)'),
      ('anon', 'public.annotation_staff_directory()')$$,
  'grants: the new functions for anon only');
select results_eq($$select proargnames from pg_proc where proname = 'annotation_staff_directory'$$,
  $$values (array['person_id', 'display_name'] collate "C")$$, 'directory: only ID and name, no e-mail');

-- ---------------------------------------------------------------- Staff directory
select pg_temp.as_key(null);
select is_empty($$select * from public.annotation_staff_directory()$$, 'directory: nothing without key');
select pg_temp.as_key('k-falsch');
select is_empty($$select * from public.annotation_staff_directory()$$, 'directory: nothing with a wrong key');
select pg_temp.as_key((select k from keys where name = 'g1'));
select is_empty($$select * from public.annotation_staff_directory()$$, 'directory: nothing for a guest');
select pg_temp.as_key('k-bo');
-- Only this test's people (the local database may hold more staff).
select results_eq($$select person_id, display_name from public.annotation_staff_directory() where person_id::text like '40000000-%'$$,
  $$values ('40000000-0000-4000-8000-000000000001'::uuid, 'Ana Ärger'::text),
      ('40000000-0000-4000-8000-000000000002', 'Bo Brandt'), ('40000000-0000-4000-8000-000000000003', 'Cleo Claus')$$,
  'directory: staff with key, sorted by name; no revoked staff');
select results_eq($$select count(*)::int from public.annotation_staff_directory() where person_id::text like '41000000-%'$$,
  $$values (10)$$, 'directory: the ten other staff members');
select is_empty($$select 1 from public.annotation_staff_directory() where person_id in (pg_temp.id('g1'), pg_temp.id('g2'))$$,
  'directory: no guests');

-- ---------------------------------------------------------------- Creating comments with mentions
select pg_temp.as_key('k-ana');
-- Thread T1 by Ana mentions Bo (twice) and Cleo.
insert into ids select 'c1', id from public.annotation_add_comment('mn-eins', '/start', 'Frage an @Bo Brandt und @Cleo Claus',
  '#knopf', '{"x": 1}', null,
  array['40000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000003']::uuid[]);
select results_eq($$select author_id, page_path, selector, rect, parent_id from public.comments where id = pg_temp.id('c1')$$,
  $$values ('40000000-0000-4000-8000-000000000001'::uuid, '/start'::text, '#knopf'::text, '{"x": 1}'::jsonb, null::uuid)$$,
  'add_comment: author set by the server, fields stored');
select results_eq($$select person_id from public.annotation_mentions where comment_id = pg_temp.id('c1') order by 1$$,
  $$values ('40000000-0000-4000-8000-000000000002'::uuid), ('40000000-0000-4000-8000-000000000003')$$,
  'add_comment: mentions stored once per person');
insert into ids select 'zehn', id from public.annotation_add_comment('mn-eins', '/start', 'Zehn', null, null, null,
  array['40000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000003',
    '41000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000002', '41000000-0000-4000-8000-000000000003',
    '41000000-0000-4000-8000-000000000004', '41000000-0000-4000-8000-000000000005', '41000000-0000-4000-8000-000000000006',
    '41000000-0000-4000-8000-000000000007', '41000000-0000-4000-8000-000000000008']::uuid[]);
select results_eq($$select count(*)::int from public.annotation_mentions where comment_id = pg_temp.id('zehn')$$, $$values (10)$$,
  'add_comment: ten mentions are allowed');
delete from public.comments where id = pg_temp.id('zehn');
reset role;
select is_empty($$select 1 from public.annotation_mentions where comment_id = pg_temp.id('zehn')$$,
  'mentions: deleting a comment removes its mentions');
select pg_temp.as_key('k-ana');
select throws_ok($$select public.annotation_add_comment('mn-eins', '/start', 'Elf', null, null, null,
    array['40000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000003',
      '41000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000002', '41000000-0000-4000-8000-000000000003',
      '41000000-0000-4000-8000-000000000004', '41000000-0000-4000-8000-000000000005', '41000000-0000-4000-8000-000000000006',
      '41000000-0000-4000-8000-000000000007', '41000000-0000-4000-8000-000000000008', '41000000-0000-4000-8000-000000000009']::uuid[])$$,
  'AN001', 'At most 10 people can be mentioned in one comment.', 'add_comment: eleven mentions refused');
select throws_ok($$select public.annotation_add_comment('mn-eins', '/start', 'Abgelehnt', null, null, null, array[pg_temp.id('g1')])$$,
  'AN001', 'Only staff members can be mentioned.', 'add_comment: mentioning a guest refused');
select throws_ok($$select public.annotation_add_comment('mn-eins', '/start', 'Abgelehnt', null, null, null,
    array['49999999-0000-4000-8000-000000000000']::uuid[])$$,
  'AN001', 'Only staff members can be mentioned.', 'add_comment: unknown ID refused');
select throws_ok($$select public.annotation_add_comment('mn-eins', '/start', 'Abgelehnt', null, null, null,
    array['40000000-0000-4000-8000-000000000002', null]::uuid[])$$,
  'AN001', 'Only staff members can be mentioned.', 'add_comment: null ID refused');
select throws_ok($$select public.annotation_add_comment('mn-eins', '/start', 'Abgelehnt', null, null, null,
    array['40000000-0000-4000-8000-000000000004']::uuid[])$$,
  'AN001', 'Only staff members can be mentioned.', 'add_comment: staff with revoked key refused');
select throws_ok($$select public.annotation_add_comment('mn-eins', '/start', 'Abgelehnt', null, null, '49999999-0000-4000-8000-000000000000')$$,
  '23503', 'invalid parent', 'add_comment: unknown parent refused');
select throws_ok($$insert into public.annotation_mentions (comment_id, person_id) values (pg_temp.id('c1'), pg_temp.id('g1'))$$,
  '42501', null, 'mentions: no direct insert');
select throws_ok($$delete from public.annotation_mentions$$, '42501', null, 'mentions: no direct delete');

select pg_temp.as_key((select k from keys where name = 'g1'));
select throws_ok($$select public.annotation_add_comment('mn-eins', '/start', 'Abgelehnt', null, null, null,
    array['40000000-0000-4000-8000-000000000002']::uuid[])$$,
  'AN001', 'Guests cannot mention anyone.', 'add_comment: a guest cannot mention');
select throws_ok($$select public.annotation_add_comment('mn-zwei', '/start', 'Abgelehnt')$$,
  '42501', 'no access to this project', 'add_comment: guest refused in another project');
-- Thread T3 by guest Gina: an @ is plain text, an empty list is fine.
insert into ids select 't3', id from public.annotation_add_comment('mn-eins', '/gast', 'Hallo @Bo Brandt', null, null, null, '{}');
select isnt(pg_temp.id('t3'), null, 'add_comment: guest comment without mentions');
select pg_temp.as_key(null);
select throws_ok($$select public.annotation_add_comment('mn-eins', '/start', 'Abgelehnt', null, null, null,
    array['40000000-0000-4000-8000-000000000002']::uuid[])$$,
  '42501', 'no access to this project', 'add_comment: refused without key');

-- ---------------------------------------------------------------- Further events
select pg_temp.as_key('k-bo');
insert into ids select 'r1', id from public.annotation_add_comment('mn-eins', '/start', 'Antwort von Bo', null, null, pg_temp.id('c1'));
-- Bo replies in Gina's thread.
insert into ids select 'r_g1', id from public.annotation_add_comment('mn-eins', '/gast', 'Antwort an Gina', null, null, pg_temp.id('t3'));
select pg_temp.as_key('k-cleo');
-- A reply in Ana's thread that also mentions Ana: one entry for her.
insert into ids select 'r2', id from public.annotation_add_comment('mn-eins', '/start', 'Siehe @Ana Ärger', null, null, pg_temp.id('c1'),
  array['40000000-0000-4000-8000-000000000001']::uuid[]);
-- Thread T2 in the other project mentions Bo.
insert into ids select 't2', id from public.annotation_add_comment('mn-zwei', '/zwei', 'Hallo @Bo Brandt', null, null, null,
  array['40000000-0000-4000-8000-000000000002']::uuid[]);
-- Thread T5 mentions Bo and is resolved below.
insert into ids select 't5', id from public.annotation_add_comment('mn-eins', '/start', 'Erledigt @Bo Brandt', null, null, null,
  array['40000000-0000-4000-8000-000000000002']::uuid[]);
update public.comments set resolved = true where id = pg_temp.id('t5');
select pg_temp.as_key('k-ana');
-- Own comments: reply in own thread, mentioning oneself.
insert into ids select 'r3', id from public.annotation_add_comment('mn-eins', '/start', 'Eigene Antwort', null, null, pg_temp.id('c1'));
insert into ids select 'self', id from public.annotation_add_comment('mn-eins', '/start', 'Ich @Ana Ärger', null, null, null,
  array['40000000-0000-4000-8000-000000000001']::uuid[]);
-- Ana replies in Gero's thread T4 in the other project.
select pg_temp.as_key((select k from keys where name = 'g2'));
insert into ids select 't4', id from public.annotation_add_comment('mn-zwei', '/zwei-gast', 'Gero fragt');
select pg_temp.as_key('k-ana');
insert into ids select 'r_g2', id from public.annotation_add_comment('mn-zwei', '/zwei-gast', 'Antwort an Gero', null, null, pg_temp.id('t4'));
select pg_temp.as_key((select k from keys where name = 'g1'));
insert into ids select 'g1_own', id from public.annotation_add_comment('mn-eins', '/gast', 'Gina antwortet sich', null, null, pg_temp.id('t3'));

-- All events so far happened two hours ago; T2 is the newest of Bo's entries.
reset role;
update public.comments set created_at = now() - interval '2 hours' where project_id in ('mn-eins', 'mn-zwei');
update public.comments set created_at = now() - interval '90 minutes' where id = pg_temp.id('t2');
-- A mention of a guest in another project cannot be created; data that has one must still not show up.
insert into public.annotation_mentions (comment_id, person_id) values (pg_temp.id('t2'), pg_temp.id('g1'));

-- ---------------------------------------------------------------- Mentions are readable like their comments
select pg_temp.as_key('k-bo');
select results_eq($$select person_id from public.annotation_mentions where comment_id = pg_temp.id('c1') order by 1$$,
  $$values ('40000000-0000-4000-8000-000000000002'::uuid), ('40000000-0000-4000-8000-000000000003')$$,
  'mentions: staff read mentions of visible comments');
select pg_temp.as_key((select k from keys where name = 'g2'));
select is_empty($$select * from public.annotation_mentions where comment_id = pg_temp.id('c1')$$,
  'mentions: guest reads no mentions of another project');
select pg_temp.as_key((select k from keys where name = 'g1'));
select is_empty($$select * from public.annotation_mentions where comment_id = pg_temp.id('c1')$$,
  'mentions: guest reads no mentions in their own project either');
select pg_temp.as_key(null);
select is_empty($$select * from public.annotation_mentions$$, 'mentions: nothing without key');

-- ---------------------------------------------------------------- For you
select pg_temp.as_key('k-bo');
select results_eq($$select project_id, project_name, project_domain, page_path, thread_id, comment_id, kind, actor_name, is_read
    from public.annotation_for_you()$$,
  $$values ('mn-zwei'::text, 'Mn Zwei'::text, 'mn-zwei.test'::text, '/zwei'::text, pg_temp.id('t2'), pg_temp.id('t2'), 'mention'::text, 'Cleo Claus'::text, false),
      ('mn-eins', 'Mn Eins', 'a.mn-eins.test:5194', '/start', pg_temp.id('c1'), pg_temp.id('c1'), 'mention', 'Ana Ärger', false)$$,
  'for you: staff sees mentions from all projects, newest first, without resolved threads');

select pg_temp.as_key('k-ana');
select set_eq($$select thread_id, comment_id, kind, actor_name, is_read from public.annotation_for_you()$$,
  $$values (pg_temp.id('c1'), pg_temp.id('r1'), 'reply'::text, 'Bo Brandt'::text, false),
      (pg_temp.id('c1'), pg_temp.id('r2'), 'mention', 'Cleo Claus', false)$$,
  'for you: replies by others in own thread; a reply that mentions me is one mention; own comments create nothing');
select set_eq($$select comment_id, text_start from public.annotation_for_you()$$,
  $$values (pg_temp.id('r1'), 'Antwort von Bo'::text), (pg_temp.id('r2'), 'Siehe @Ana Ärger')$$,
  'for you: text start of the comment that created the entry, not of the thread');

select pg_temp.as_key((select k from keys where name = 'g1'));
select results_eq($$select project_id, page_path, thread_id, comment_id, kind, actor_name, is_read from public.annotation_for_you()$$,
  $$values ('mn-eins'::text, '/gast'::text, pg_temp.id('t3'), pg_temp.id('r_g1'), 'reply'::text, 'Bo Brandt'::text, false)$$,
  'for you: guest sees replies by others in own thread only in own project');
select results_eq($$select text_start from public.annotation_for_you()$$, $$values ('Antwort an Gina'::text)$$,
  'for you: guest gets text only from the own project');
select results_eq($$select project_domain from public.annotation_for_you()$$, $$values (null::text)$$,
  'for you: no domain for guests (the project has domains)');
select pg_temp.as_key((select k from keys where name = 'g2'));
select results_eq($$select project_id, thread_id, comment_id, kind from public.annotation_for_you()$$,
  $$values ('mn-zwei'::text, pg_temp.id('t4'), pg_temp.id('r_g2'), 'reply'::text)$$,
  'for you: the other guest sees only their own project');

select pg_temp.as_key('k-f9');
select is_empty($$select * from public.annotation_for_you()$$, 'for you: nothing for staff without mentions or own threads with replies');
select pg_temp.as_key(null);
select is_empty($$select * from public.annotation_for_you()$$, 'for you: nothing without key');
select pg_temp.as_key('k-falsch');
select is_empty($$select * from public.annotation_for_you()$$, 'for you: nothing with a wrong key');
reset role;
update public.comments set text = repeat('ä', 139) || 'ßENDE' where id = pg_temp.id('t2');
select pg_temp.as_key('k-bo');
select results_eq($$select text_start from public.annotation_for_you() where comment_id = pg_temp.id('t2')$$,
  $$values (repeat('ä', 139) || 'ß')$$, 'for you: text start cut to 140 characters by the database');

-- ---------------------------------------------------------------- Read state
select pg_temp.as_key(null);
select throws_ok($$select public.annotation_mark_read(pg_temp.id('c1'), now())$$, '28000', 'invalid key', 'mark_read: refused without key');
select throws_ok($$select public.annotation_mark_all_read(now())$$, '28000', 'invalid key', 'mark_all_read: refused without key');

select pg_temp.as_key('k-bo');
select lives_ok($$select public.annotation_mark_read(pg_temp.id('c1'), now())$$, 'mark_read: Bo opens thread T1');
select results_eq($$select comment_id, is_read from public.annotation_for_you()$$,
  $$values (pg_temp.id('t2'), false), (pg_temp.id('c1'), true)$$, 'mark_read: only this thread is read');
select pg_temp.as_key('k-ana');
select results_eq($$select count(*)::int from public.annotation_for_you() where not is_read$$, $$values (2)$$,
  'mark_read: other people stay unread');
select pg_temp.as_key('k-bo');
select lives_ok($$select public.annotation_mark_read(pg_temp.id('r1'), now())$$, 'mark_read: a reply ID is ignored');
select lives_ok($$select public.annotation_mark_read('49999999-0000-4000-8000-000000000000', now())$$, 'mark_read: an unknown ID is ignored');

select pg_temp.as_key((select k from keys where name = 'g1'));
select lives_ok($$select public.annotation_mark_read(pg_temp.id('t4'), now())$$, 'mark_read: guest calls it for a thread of another project');
reset role;
select results_eq($$select count(*)::int from public.annotation_reads where person_id = pg_temp.id('g1')$$, $$values (0)$$,
  'mark_read: no read state for threads without access');
select results_eq($$select count(*)::int from public.annotation_reads where person_id = '40000000-0000-4000-8000-000000000002'$$,
  $$values (1)$$, 'mark_read: reply and unknown IDs store nothing');

-- Time passes: Bo read T1 an hour ago, then Cleo mentions him in a new reply in T1 (ten minutes ago).
update public.annotation_reads set read_at = now() - interval '1 hour' where person_id = '40000000-0000-4000-8000-000000000002';
select pg_temp.as_key('k-cleo');
insert into ids select 'r4', id from public.annotation_add_comment('mn-eins', '/start', 'Noch was @Bo Brandt', null, null, pg_temp.id('c1'),
  array['40000000-0000-4000-8000-000000000002']::uuid[]);
reset role;
update public.comments set created_at = now() - interval '10 minutes' where id = pg_temp.id('r4');
select pg_temp.as_key('k-bo');
select results_eq($$select comment_id, is_read from public.annotation_for_you()$$,
  $$values (pg_temp.id('r4'), false), (pg_temp.id('t2'), false), (pg_temp.id('c1'), true)$$,
  'read state: a new event after reading is unread again, older entries stay read');

-- Upper bound: Bo's overlay loaded T1 before r4 (newest loaded comment 30 minutes ago).
select lives_ok($$select public.annotation_mark_read(pg_temp.id('c1'), now() - interval '30 minutes')$$, 'mark_read: up to the newest loaded comment');
select results_eq($$select comment_id, is_read from public.annotation_for_you() where thread_id = pg_temp.id('c1')$$,
  $$values (pg_temp.id('r4'), false), (pg_temp.id('c1'), true)$$, 'mark_read: an entry newer than the bound stays unread');
select lives_ok($$select public.annotation_mark_read(pg_temp.id('c1'), now() - interval '3 hours')$$, 'mark_read: an older bound');
reset role;
select results_eq($$select read_at = now() - interval '30 minutes' from public.annotation_reads
    where person_id = '40000000-0000-4000-8000-000000000002' and thread_id = pg_temp.id('c1')$$,
  $$values (true)$$, 'mark_read: read state never goes backwards');
select pg_temp.as_key('k-bo');
select throws_ok($$select public.annotation_mark_read(pg_temp.id('c1'), null)$$, '22004', 'p_until is required', 'mark_read: bound required');
select throws_ok($$select public.annotation_mark_all_read(null)$$, '22004', 'p_until is required', 'mark_all_read: bound required');

-- Mark all with the list loaded up to r4; meanwhile Cleo mentions Bo in another project (one minute ago).
select pg_temp.as_key('k-cleo');
insert into ids select 'n1', id from public.annotation_add_comment('mn-zwei', '/zwei', 'Neu @Bo Brandt', null, null, null,
  array['40000000-0000-4000-8000-000000000002']::uuid[]);
reset role;
update public.comments set created_at = now() - interval '1 minute' where id = pg_temp.id('n1');
select pg_temp.as_key('k-bo');
select lives_ok($$select public.annotation_mark_all_read(now() - interval '10 minutes')$$, 'mark_all_read: Bo marks everything loaded');
select results_eq($$select comment_id, is_read from public.annotation_for_you()$$,
  $$values (pg_temp.id('n1'), false), (pg_temp.id('r4'), true), (pg_temp.id('t2'), true), (pg_temp.id('c1'), true)$$,
  'mark_all_read: the newer mention in another project stays unread');
select lives_ok($$select public.annotation_mark_all_read(now() + interval '1 day')$$, 'mark_all_read: a bound in the future');
reset role;
select results_eq($$select max(read_at) = now() from public.annotation_reads where person_id = '40000000-0000-4000-8000-000000000002'$$,
  $$values (true)$$, 'mark_all_read: read state never lies in the future');
select pg_temp.as_key('k-bo');
select results_eq($$select count(*)::int from public.annotation_for_you() where not is_read$$, $$values (0)$$,
  'mark_all_read: no unread entries left');
select results_eq($$select count(*)::int from public.annotation_for_you()$$, $$values (4)$$, 'mark_all_read: entries stay in the list');
select pg_temp.as_key('k-ana');
-- Ana: replies r1, r4 and mention r2 in her thread T1.
select results_eq($$select count(*)::int from public.annotation_for_you() where not is_read$$, $$values (3)$$,
  'mark_all_read: only for the own person');

-- ---------------------------------------------------------------- Resolving and revoking
select lives_ok($$update public.comments set resolved = true where id = pg_temp.id('c1')$$, 'resolve: Ana resolves T1');
select is_empty($$select * from public.annotation_for_you()$$, 'resolve: entries of a resolved thread disappear');
select lives_ok($$update public.comments set resolved = false where id = pg_temp.id('c1')$$, 'resolve: Ana reopens T1');
select results_eq($$select count(*)::int from public.annotation_for_you() where not is_read$$, $$values (3)$$,
  'resolve: reopened, unread entries are back');

reset role;
set local role service_role;
select public.annotation_revoke_key('40000000-0000-4000-8000-000000000002');
select pg_temp.as_key('k-bo');
select is_empty($$select * from public.annotation_for_you()$$, 'revoked: no entries');
select is_empty($$select * from public.annotation_staff_directory()$$, 'revoked: no directory');
select throws_ok($$select public.annotation_mark_all_read(now())$$, '28000', 'invalid key', 'revoked: mark_all_read refused');
select is_empty($$select * from public.annotation_mentions$$, 'revoked: no mentions readable');
select pg_temp.as_key('k-ana');
select is_empty($$select * from public.annotation_staff_directory() where person_id = '40000000-0000-4000-8000-000000000002'$$,
  'revoked: no longer in the directory');
select throws_ok($$select public.annotation_add_comment('mn-eins', '/start', 'Abgelehnt', null, null, null,
    array['40000000-0000-4000-8000-000000000002']::uuid[])$$,
  'AN001', 'Only staff members can be mentioned.', 'revoked: can no longer be mentioned');

-- Renewed project link: the guest's key stops working, so does "For you".
reset role;
set local role service_role;
select public.annotation_new_project_key('mn-eins');
select pg_temp.as_key((select k from keys where name = 'g1'));
select is_empty($$select * from public.annotation_for_you()$$, 'new project link: old guest gets no entries');
reset role;

select * from finish();
rollback;
