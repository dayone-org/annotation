-- Handoff codes for the jump from "For you" into another project: staff only, 2 minutes, once, only on
-- the target project's host, only with exactly that code; the plain key is never stored.
-- Run like PostgREST (role anon, key in the x-annotation-key header). Time is steered through expires_at.
begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

create function pg_temp.as_key(p_key text) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.headers',
    case when p_key is null then '{}' else json_build_object('x-annotation-key', p_key)::text end, true);
  set local role anon;
end $$;

-- Realistic keys (64 hex), so a search for the plain key in stored bytes means something.
create temp table keys (name text primary key, k text);
create temp table codes (name text primary key, c text);
grant select, insert, update on keys, codes to anon, service_role;
insert into keys values
  ('hanna', encode(extensions.digest('ho-hanna', 'sha256'), 'hex')),
  ('ole', encode(extensions.digest('ho-ole', 'sha256'), 'hex')),
  ('rita', encode(extensions.digest('ho-rita', 'sha256'), 'hex'));

insert into public.annotation_projects (id, name, key_hash, key_generation) values
  ('ho-a', 'Ho A', extensions.digest('pk-ho-a', 'sha256'), 1),
  ('ho-b', 'Ho B', extensions.digest('pk-ho-b', 'sha256'), 1);
insert into public.annotation_project_domains (host, project_id) values
  ('ho-a.test', 'ho-a'), ('b.ho.test:5198', 'ho-b');
insert into public.annotation_people (id, email, first_name, display_name, key_hash) values
  ('50000000-0000-4000-8000-000000000001', 'hanna.ho@dayone.de', 'Hanna', 'Hanna Höfer',
    extensions.digest((select k from keys where name = 'hanna'), 'sha256')),
  ('50000000-0000-4000-8000-000000000002', 'ole.ho@dayone.de', 'Ole', 'Ole Öst',
    extensions.digest((select k from keys where name = 'ole'), 'sha256')),
  ('50000000-0000-4000-8000-000000000003', 'rita.ho@dayone.de', 'Rita', 'Rita Rück',
    extensions.digest((select k from keys where name = 'rita'), 'sha256'));

select pg_temp.as_key(null);
insert into keys values ('gast', public.annotation_join('pk-ho-a', 'Gabi Gast'));

create function pg_temp.k(p_name text) returns text language sql as $$ select k from keys where name = p_name $$;
create function pg_temp.c(p_name text) returns text language sql as $$ select c from codes where name = p_name $$;
grant execute on function pg_temp.k(text), pg_temp.c(text) to anon, service_role;

-- ---------------------------------------------------------------- Privileges
reset role;
select is_empty(
  $$select r, p from unnest(array['anon', 'authenticated']) r,
      unnest(array['select', 'insert', 'update', 'delete', 'truncate', 'references']) p
    where has_table_privilege(r, 'public.annotation_handoffs', p)$$,
  'grants: anon and authenticated have nothing on the handoff table');
select set_eq(
  $$select r, f from unnest(array['anon', 'authenticated']) r,
      unnest(array['public.annotation_handoff_create(text)', 'public.annotation_handoff_redeem(text, text, text)']) f
    where has_function_privilege(r, f, 'execute')$$,
  $$values ('anon', 'public.annotation_handoff_create(text)'), ('anon', 'public.annotation_handoff_redeem(text, text, text)')$$,
  'grants: both functions for anon only');

-- ---------------------------------------------------------------- Create: staff only
select pg_temp.as_key(null);
select throws_ok($$select public.annotation_handoff_create('ho-b')$$, '28000', 'invalid key', 'create: refused without key');
select pg_temp.as_key('0000000000000000000000000000000000000000000000000000000000000000');
select throws_ok($$select public.annotation_handoff_create('ho-b')$$, '28000', 'invalid key', 'create: refused with an unknown key');
select pg_temp.as_key(pg_temp.k('gast'));
select throws_ok($$select public.annotation_handoff_create('ho-b')$$, '42501',
  'Only staff members can jump to another project.', 'create: refused for a guest');
select pg_temp.as_key(pg_temp.k('hanna'));
select throws_ok($$select public.annotation_handoff_create('ho-gibts-nicht')$$, '22023', 'unknown project',
  'create: refused for an unknown project');

reset role;
set local role service_role;
select public.annotation_revoke_key('50000000-0000-4000-8000-000000000003');
select pg_temp.as_key(pg_temp.k('rita'));
select throws_ok($$select public.annotation_handoff_create('ho-b')$$, '28000', 'invalid key', 'create: refused with a revoked key');

reset role;
select is_empty($$select * from public.annotation_handoffs h join public.annotation_people p on p.id = h.person_id
    where p.email like '%.ho@dayone.de' or p.project_id = 'ho-a'$$,
  'create: refused calls leave no code behind');

select pg_temp.as_key(pg_temp.k('hanna'));
insert into codes values ('h1', public.annotation_handoff_create('ho-b'));
select matches(pg_temp.c('h1'), '^[0-9a-f]{64}$', 'create: the code is 256 random bits as 64 hex characters');
insert into codes values ('h2', public.annotation_handoff_create('ho-b'));
select isnt(pg_temp.c('h1'), pg_temp.c('h2'), 'create: every call gives a new code');

reset role;
select results_eq(
  $$select person_id, project_id, expires_at - now() from public.annotation_handoffs
    where code_hash = extensions.digest(pg_temp.c('h1'), 'sha256')$$,
  $$values ('50000000-0000-4000-8000-000000000001'::uuid, 'ho-b'::text, interval '2 minutes')$$,
  'create: bound to Hanna and project ho-b, valid for exactly 2 minutes');
select is((select count(*)::int from public.annotation_handoffs h
    where h::text like '%' || pg_temp.k('hanna') || '%'
      or position(convert_to(pg_temp.k('hanna'), 'UTF8') in h.key_cipher) > 0
      or position(decode(pg_temp.k('hanna'), 'hex') in h.key_cipher) > 0),
  0, 'storage: the plain key is nowhere in the table, neither as text nor as bytes');
select is((select count(*)::int from public.annotation_handoffs h
    where h::text like '%' || pg_temp.c('h1') || '%' or position(convert_to(pg_temp.c('h1'), 'UTF8') in h.key_cipher) > 0),
  0, 'storage: the code itself is not stored either');

-- anon reads nothing, not even with a staff key.
select pg_temp.as_key(pg_temp.k('hanna'));
select throws_ok($$select code_hash from public.annotation_handoffs$$, '42501', null, 'storage: hash not readable for anon');
select throws_ok($$select key_cipher from public.annotation_handoffs$$, '42501', null, 'storage: cipher not readable for anon');

-- ---------------------------------------------------------------- Redeem: host, exact code, once
select pg_temp.as_key(null);
select is(public.annotation_handoff_redeem(upper(pg_temp.c('h2')), 'b.ho.test:5198'), null, 'redeem: upper-case code fails');
select is(public.annotation_handoff_redeem(left(pg_temp.c('h2'), 63), 'b.ho.test:5198'), null, 'redeem: shortened code fails');
select is(public.annotation_handoff_redeem(left(pg_temp.c('h2'), 63) || '_', 'b.ho.test:5198'), null,
  'redeem: code with one character changed fails');
select is(public.annotation_handoff_redeem(null, 'b.ho.test:5198'), null, 'redeem: no code fails');
select is(public.annotation_handoff_redeem(pg_temp.c('h2'), 'b.ho.test:5198'), pg_temp.k('hanna'),
  'redeem: the exact code on the target host gives the key, after failed guesses');

select is(public.annotation_handoff_redeem(pg_temp.c('h1'), 'b.ho.test'), null, 'redeem: target host without port fails');
select is(public.annotation_handoff_redeem(pg_temp.c('h1'), 'b.ho.test:5198'), null,
  'redeem: a code is gone after a failed attempt that found it');

select pg_temp.as_key(pg_temp.k('hanna'));
insert into codes values ('h3', public.annotation_handoff_create('ho-b'));
select pg_temp.as_key(null);
select is(public.annotation_handoff_redeem(pg_temp.c('h3'), 'ho-a.test'), null, 'redeem: another project''s host fails');

select pg_temp.as_key(pg_temp.k('hanna'));
insert into codes values ('h4', public.annotation_handoff_create('ho-b'));
select pg_temp.as_key(null);
select is(public.annotation_handoff_redeem(pg_temp.c('h4'), 'B.HO.TEST:5198 '), pg_temp.k('hanna'),
  'redeem: host compared like whoami (case, spaces)');
select is(public.annotation_handoff_redeem(pg_temp.c('h4'), 'B.HO.TEST:5198 '), null, 'redeem: only once');
select pg_temp.as_key(pg_temp.k('hanna'));
select results_eq($$select project_id, display_name from public.annotation_whoami('b.ho.test:5198')$$,
  $$values ('ho-b'::text, 'Hanna Höfer'::text)$$, 'redeem: the returned key logs Hanna in on the target page');

-- ---------------------------------------------------------------- Time
select pg_temp.as_key(pg_temp.k('hanna'));
insert into codes values ('h5', public.annotation_handoff_create('ho-b')), ('h6', public.annotation_handoff_create('ho-b'));
reset role;
update public.annotation_handoffs set expires_at = now() + interval '1 millisecond'
where code_hash = extensions.digest(pg_temp.c('h5'), 'sha256');
update public.annotation_handoffs set expires_at = now()
where code_hash = extensions.digest(pg_temp.c('h6'), 'sha256');
select pg_temp.as_key(null);
select is(public.annotation_handoff_redeem(pg_temp.c('h5'), 'b.ho.test:5198'), pg_temp.k('hanna'),
  'time: still valid just before the end');
select is(public.annotation_handoff_redeem(pg_temp.c('h6'), 'b.ho.test:5198'), null, 'time: refused at the end');

-- Cleanup: expired codes of others disappear on redeem and on create.
select pg_temp.as_key(pg_temp.k('ole'));
insert into codes values ('o1', public.annotation_handoff_create('ho-a')), ('o2', public.annotation_handoff_create('ho-a'));
reset role;
update public.annotation_handoffs set expires_at = now() - interval '1 second'
where code_hash = extensions.digest(pg_temp.c('o1'), 'sha256');
select pg_temp.as_key(null);
select is(public.annotation_handoff_redeem('ffff', 'ho-a.test'), null, 'cleanup: a redeem with an unknown code');
reset role;
select is((select count(*)::int from public.annotation_handoffs where code_hash = extensions.digest(pg_temp.c('o1'), 'sha256')), 0,
  'cleanup: that redeem removed the expired code');
update public.annotation_handoffs set expires_at = now() - interval '1 second'
where code_hash = extensions.digest(pg_temp.c('o2'), 'sha256');
select pg_temp.as_key(pg_temp.k('hanna'));
insert into codes values ('h7', public.annotation_handoff_create('ho-b'));
reset role;
select is((select count(*)::int from public.annotation_handoffs where code_hash = extensions.digest(pg_temp.c('o2'), 'sha256')), 0,
  'cleanup: a create removed the expired code');
select is((select count(*)::int from public.annotation_handoffs where expires_at <= now()), 0, 'cleanup: no expired code left');

-- ---------------------------------------------------------------- Key changes in between
select pg_temp.as_key(pg_temp.k('ole'));
insert into codes values ('o3', public.annotation_handoff_create('ho-b')), ('o4', public.annotation_handoff_create('ho-b'));
reset role;
set local role service_role;
select public.annotation_new_key('50000000-0000-4000-8000-000000000002');
select pg_temp.as_key(null);
select is(public.annotation_handoff_redeem(pg_temp.c('o3'), 'b.ho.test:5198'), null, 'key renewed: the old key is not handed out');
reset role;
set local role service_role;
select public.annotation_revoke_key('50000000-0000-4000-8000-000000000002');
select pg_temp.as_key(null);
select is(public.annotation_handoff_redeem(pg_temp.c('o4'), 'b.ho.test:5198'), null, 'key revoked: nothing handed out');

-- Ole's codes are gone with the attempts; Hanna's h7 is still there and works once.
reset role;
select is((select count(*)::int from public.annotation_handoffs where person_id = '50000000-0000-4000-8000-000000000002'), 0,
  'key changes: the attempts used up the codes');
select pg_temp.as_key(pg_temp.k('gast'));
select is(public.annotation_handoff_redeem(pg_temp.c('h7'), 'b.ho.test:5198'), pg_temp.k('hanna'),
  'redeem: the key in the header (here a guest) plays no role');
select pg_temp.as_key(null);
select is(public.annotation_handoff_redeem(pg_temp.c('h7'), 'b.ho.test:5198'), null, 'redeem: h7 used up');

-- Deleting a person or project removes their codes.
select pg_temp.as_key(pg_temp.k('hanna'));
insert into codes values ('h8', public.annotation_handoff_create('ho-a'));
reset role;
delete from public.annotation_people where id = '50000000-0000-4000-8000-000000000001';
select is((select count(*)::int from public.annotation_handoffs where code_hash = extensions.digest(pg_temp.c('h8'), 'sha256')), 0,
  'cascade: deleting the person removes the code');
reset role;

select * from finish();
rollback;
