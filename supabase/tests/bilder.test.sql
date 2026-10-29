-- Images on comments: upload only into the own folder of a project of the key (webp/jpeg, at most 5 MiB,
-- unguessable name), stored files never change, attach only own fresh uploads (image and thumb) of the same
-- project to a new comment (at most 5, each once), read like the comment, delete files only as uploader once
-- no comment uses them; deleting a comment removes its references.
-- Run like PostgREST and the storage service (role anon, key in the x-annotation-key header).
begin;
create extension if not exists pgtap with schema extensions;
select plan(80);

create function pg_temp.as_key(p_key text) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.headers',
    case when p_key is null then '{}' else json_build_object('x-annotation-key', p_key)::text end, true);
  -- The storage service sets this; without it the bucket refuses every delete.
  perform set_config('storage.allow_delete_query', 'true', true);
  set local role anon;
end $$;

insert into public.annotation_projects (id, name, key_hash, key_generation) values
  ('bi-eins', 'Bi Eins', extensions.digest('pk-bi1', 'sha256'), 1),
  ('bi-zwei', 'Bi Zwei', extensions.digest('pk-bi2', 'sha256'), 1);

-- Ana, Bo: staff.
insert into public.annotation_people (id, email, first_name, display_name, key_hash) values
  ('50000000-0000-4000-8000-000000000001', 'ana.bi@dayone.de', 'Ana', 'Ana Ärger', extensions.digest('k-ana-bi', 'sha256')),
  ('50000000-0000-4000-8000-000000000002', 'bo.bi@dayone.de', 'Bo', 'Bo Brandt', extensions.digest('k-bo-bi', 'sha256'));

create temp table keys (name text primary key, k text);
create temp table ids (name text primary key, id uuid);
grant select, insert on keys, ids to anon;
insert into ids values ('ana', '50000000-0000-4000-8000-000000000001'), ('bo', '50000000-0000-4000-8000-000000000002');

select pg_temp.as_key(null);
insert into keys values ('g1', public.annotation_join('pk-bi1', 'Gina Gast')), ('g2', public.annotation_join('pk-bi2', 'Gero Gast'));
select pg_temp.as_key((select k from keys where name = 'g1'));
insert into ids select 'g1', person_id from public.annotation_whoami('x', 'bi-eins');
select pg_temp.as_key((select k from keys where name = 'g2'));
insert into ids select 'g2', person_id from public.annotation_whoami('x', 'bi-zwei');
reset role;
grant select on ids to service_role;

create function pg_temp.id(p_name text) returns uuid language sql as $$ select id from ids where name = p_name $$;
-- Object name: project / person / UUID v4 (the n-th) . extension
create function pg_temp.p(p_project text, p_person text, p_n int, p_ext text default 'webp') returns text language sql as $$
  select p_project || '/' || pg_temp.id(p_person) || '/aaaaaaaa-0000-4000-8000-' || lpad(p_n::text, 12, '0') || '.' || p_ext
$$;
-- What the storage service writes; runs as the calling role, so the policies apply.
create function pg_temp.upload(p_name text, p_type text default 'image/webp', p_size bigint default 2000) returns void
language sql as $$
  insert into storage.objects (bucket_id, name, metadata)
  values ('comment-images', p_name, jsonb_build_object('mimetype', p_type, 'size', p_size, 'contentLength', p_size))
$$;
-- Small version (thumb) of an image: the same name with bbbbbbbb instead of aaaaaaaa.
create function pg_temp.t(p_path text) returns text language sql as $$ select replace(p_path, '/aaaaaaaa-', '/bbbbbbbb-') $$;
create function pg_temp.img(p_path text, p_w int default 1200, p_h int default 800, p_thumb text default null) returns jsonb
language sql as $$
  select jsonb_build_object('path', p_path, 'thumb_path', coalesce(p_thumb, pg_temp.t(p_path)), 'width', p_w, 'height', p_h)
$$;
create function pg_temp.exists_file(p_name text) returns boolean language sql security definer as $$
  select exists (select 1 from storage.objects where bucket_id = 'comment-images' and name = p_name)
$$;
grant execute on function pg_temp.id(text), pg_temp.p(text, text, int, text), pg_temp.upload(text, text, bigint),
  pg_temp.t(text), pg_temp.img(text, int, int, text), pg_temp.exists_file(text) to anon;

-- ---------------------------------------------------------------- Bucket and privileges
reset role;
select results_eq($$select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'comment-images'$$,
  $$values (true, 5242880::bigint, array['image/webp', 'image/jpeg'])$$,
  'bucket: public, at most 5 MiB, only webp and jpeg');
select results_eq(
  $$select r, p from unnest(array['anon', 'authenticated']) r, unnest(array['select', 'insert', 'update', 'delete', 'truncate']) p
    where has_table_privilege(r, 'public.annotation_images', p) order by 1, 2$$,
  $$values ('anon', 'select')$$,
  'grants: anon may only read references, authenticated nothing');
select set_eq(
  $$select r, f from unnest(array['anon', 'authenticated', 'service_role']) r,
      unnest(array['public.annotation_add_comment_with_images(text, text, text, jsonb, text, jsonb, uuid, uuid[])',
        'public.annotation_orphan_images(interval)']) f
    where has_function_privilege(r, f, 'execute')$$,
  $$values ('anon', 'public.annotation_add_comment_with_images(text, text, text, jsonb, text, jsonb, uuid, uuid[])'),
      ('service_role', 'public.annotation_add_comment_with_images(text, text, text, jsonb, text, jsonb, uuid, uuid[])'),
      ('service_role', 'public.annotation_orphan_images(interval)')$$,
  'grants: comment with images for anon, orphan list for the service role only');

-- ---------------------------------------------------------------- Upload
select pg_temp.as_key('k-ana-bi');
select lives_ok($$select pg_temp.upload(pg_temp.p('bi-eins', 'ana', 1))$$, 'upload: staff into own folder');
select lives_ok($$select pg_temp.upload(pg_temp.p('bi-zwei', 'ana', 2))$$, 'upload: staff into another project (staff see all)');
select lives_ok($$select pg_temp.upload(pg_temp.p('bi-eins', 'ana', 3, 'jpg'), 'image/jpeg')$$, 'upload: jpeg as .jpg');
select lives_ok($$select pg_temp.upload(pg_temp.p('bi-eins', 'ana', 4), 'image/webp', 5242880)$$, 'upload: exactly 5 MiB');
-- Thumbs of the files attached below.
select pg_temp.upload(pg_temp.t(pg_temp.p('bi-eins', 'ana', 1)), 'image/webp', 300);
select pg_temp.upload(pg_temp.t(pg_temp.p('bi-eins', 'ana', 3, 'jpg')), 'image/jpeg', 300);
-- Before the upload the service knows only type and declared length; the size check follows with the real size.
select lives_ok($$insert into storage.objects (bucket_id, name, metadata)
    values ('comment-images', pg_temp.p('bi-eins', 'ana', 5), '{"mimetype": "image/webp"}')$$,
  'upload: permission check before the upload (no size yet)');
select throws_ok($$select pg_temp.upload(pg_temp.p('bi-eins', 'ana', 6), 'image/webp', 5242881)$$, '42501', null,
  'upload: over 5 MiB refused');
select throws_ok($$insert into storage.objects (bucket_id, name, metadata)
    values ('comment-images', pg_temp.p('bi-eins', 'ana', 7), '{"mimetype": "image/webp", "contentLength": 5242881}')$$,
  '42501', null, 'upload: declared length over 5 MiB refused before the upload');
select throws_ok($$select pg_temp.upload(pg_temp.p('bi-eins', 'ana', 8, 'png'), 'image/png')$$, 'AN001', 'Image type and extension do not match.',
  'upload: png refused');
select throws_ok($$select pg_temp.upload(pg_temp.p('bi-eins', 'ana', 9), 'image/png')$$, 'AN001', 'Image type and extension do not match.',
  'upload: png named .webp refused');
select throws_ok($$select pg_temp.upload(pg_temp.p('bi-eins', 'ana', 10, 'jpg'), 'image/webp')$$, 'AN001', 'Image type and extension do not match.',
  'upload: type and extension must match');
select throws_ok($$select pg_temp.upload(pg_temp.p('bi-eins', 'bo', 11))$$, '42501', null,
  'upload: into the folder of another person refused');
select throws_ok($$select pg_temp.upload('bi-eins/' || pg_temp.id('ana') || '/bild-1.webp')$$, '42501', null,
  'upload: name without random UUID refused');
select throws_ok($$select pg_temp.upload('bi-eins/' || pg_temp.id('ana') || '/aaaaaaaa-0000-1000-8000-000000000012.webp')$$,
  '42501', null, 'upload: UUID that is not a random v4 refused');
select throws_ok($$select pg_temp.upload(pg_temp.p('bi-neu', 'ana', 13))$$, '42501', null,
  'upload: unknown project refused');
select throws_ok($$insert into storage.objects (bucket_id, name, metadata)
    values ('andere', pg_temp.p('bi-eins', 'ana', 14), '{"mimetype": "image/webp", "size": 1}')$$, '42501', null,
  'upload: other buckets refused');

select pg_temp.as_key((select k from keys where name = 'g1'));
select lives_ok($$select pg_temp.upload(pg_temp.p('bi-eins', 'g1', 21))$$, 'upload: guest into own folder');
select lives_ok($$select pg_temp.upload(pg_temp.p('bi-eins', 'g1', 22))$$, 'upload: guest, second file');
select pg_temp.upload(pg_temp.t(pg_temp.p('bi-eins', 'g1', 21)), 'image/webp', 300);
select throws_ok($$select pg_temp.upload(pg_temp.p('bi-zwei', 'g1', 23))$$, '42501', null,
  'upload: guest into another project refused');

select pg_temp.as_key(null);
select throws_ok($$select pg_temp.upload(pg_temp.p('bi-eins', 'g1', 24))$$, '42501', null, 'upload: without key refused');
select pg_temp.as_key('k-falsch');
select throws_ok($$select pg_temp.upload(pg_temp.p('bi-eins', 'g1', 25))$$, '42501', null, 'upload: wrong key refused');

select pg_temp.as_key('k-bo-bi');
select lives_ok($$select pg_temp.upload(pg_temp.p('bi-eins', 'bo', 31))$$, 'upload: Bo into own folder');
select lives_ok($$select pg_temp.upload(pg_temp.p('bi-eins', 'bo', 30 + n)) from generate_series(2, 6) n$$,
  'upload: Bo, five more files');
select pg_temp.upload(pg_temp.t(pg_temp.p('bi-eins', 'bo', 30 + n)), 'image/webp', 300) from generate_series(1, 5) n;

-- A file the service would never accept, to show that attaching checks the size again.
reset role;
insert into storage.objects (bucket_id, name, metadata) values
  ('comment-images', pg_temp.p('bi-eins', 'ana', 42), '{"mimetype": "image/webp", "size": 5242881}');
-- An upload older than an hour (attaching it races orphan-images --delete).
insert into storage.objects (bucket_id, name, metadata, created_at) values
  ('comment-images', pg_temp.p('bi-eins', 'ana', 43), '{"mimetype": "image/webp", "size": 2000}', now() - interval '61 minutes');

-- ---------------------------------------------------------------- Stored files are fixed
-- A signed upload URL writes past the policies (storage service as owner, token valid for two hours), so
-- the table itself refuses changes and checks type against extension. Run without role: the policies do not apply.
select throws_ok($$update storage.objects set metadata = metadata || '{"size": 9}'
    where bucket_id = 'comment-images' and name = pg_temp.p('bi-eins', 'ana', 5)$$,
  'AN001', 'Images cannot be changed.', 'fixed: metadata of a stored file cannot change');
select throws_ok($$update storage.objects set version = 'ausgetauscht'
    where bucket_id = 'comment-images' and name = pg_temp.p('bi-eins', 'ana', 5)$$,
  'AN001', 'Images cannot be changed.', 'fixed: content (version) of a stored file cannot change');
select throws_ok($$update storage.objects set metadata = metadata || '{"mimetype": "image/jpeg"}'
    where bucket_id = 'comment-images' and name = pg_temp.p('bi-eins', 'ana', 5)$$,
  'AN001', 'Images cannot be changed.', 'fixed: the type of a stored file cannot change');
select lives_ok($$update storage.objects set last_accessed_at = now(), metadata = metadata || '{"eTag": "neu"}'
    where bucket_id = 'comment-images' and name = pg_temp.p('bi-eins', 'ana', 5)$$,
  'fixed: other columns (last access, eTag) stay writable, e.g. for storage migrations');
select throws_ok($$update storage.objects set name = pg_temp.p('bi-eins', 'ana', 44)
    where bucket_id = 'comment-images' and name = pg_temp.p('bi-eins', 'ana', 5)$$,
  'AN001', 'Images cannot be changed.', 'fixed: a stored file cannot be renamed');
select throws_ok($$insert into storage.objects (bucket_id, name, metadata, version)
    values ('comment-images', pg_temp.p('bi-eins', 'ana', 5), '{"mimetype": "image/webp", "size": 9}', 'ausgetauscht')
    on conflict (bucket_id, name collate "C") where archived_at is null do update set version = excluded.version$$,
  'AN001', 'Images cannot be changed.', 'fixed: an upsert onto a stored file is refused');
select throws_ok($$insert into storage.objects (bucket_id, name, metadata)
    values ('comment-images', pg_temp.p('bi-eins', 'ana', 45), '{"mimetype": "image/jpeg", "size": 2000}')$$,
  'AN001', 'Image type and extension do not match.', 'fixed: jpeg named .webp refused past the policies');
select throws_ok($$insert into storage.objects (bucket_id, name, metadata)
    values ('comment-images', pg_temp.p('bi-eins', 'ana', 46, 'jpg'), '{"mimetype": "image/webp", "size": 2000}')$$,
  'AN001', 'Image type and extension do not match.', 'fixed: webp named .jpg refused past the policies');
select throws_ok($$insert into storage.objects (bucket_id, name, metadata)
    values ('comment-images', pg_temp.p('bi-eins', 'ana', 41), '{"mimetype": "image/png", "size": 2000}')$$,
  'AN001', 'Image type and extension do not match.', 'fixed: png named .webp refused past the policies');

-- ---------------------------------------------------------------- Listing own files only
select pg_temp.as_key((select k from keys where name = 'g1'));
select results_eq($$select count(*)::int from storage.objects where bucket_id = 'comment-images'$$, $$values (3)$$,
  'list: a guest sees only own files');
select pg_temp.as_key(null);
select is_empty($$select 1 from storage.objects where bucket_id = 'comment-images'$$, 'list: nothing without key');

-- ---------------------------------------------------------------- Comment with images
select pg_temp.as_key('k-ana-bi');
create temp table c as
  select 'ana1'::text as name, id from public.annotation_add_comment_with_images('bi-eins', '/start', 'Vorlage für die Kachel',
    jsonb_build_array(pg_temp.img(pg_temp.p('bi-eins', 'ana', 3, 'jpg'), 900, 1600), pg_temp.img(pg_temp.p('bi-eins', 'ana', 1))),
    p_mentions => array[pg_temp.id('bo')]);
reset role;
grant select, insert on c to anon;
select pg_temp.as_key('k-ana-bi');
select results_eq(
  $$select path, thumb_path, width, height, size_bytes, position, project_id from public.annotation_images
    where comment_id = (select id from c where name = 'ana1') order by position$$,
  $$values (pg_temp.p('bi-eins', 'ana', 3, 'jpg'), pg_temp.t(pg_temp.p('bi-eins', 'ana', 3, 'jpg')), 900, 1600, 2000, 0::smallint, 'bi-eins'::text),
      (pg_temp.p('bi-eins', 'ana', 1), pg_temp.t(pg_temp.p('bi-eins', 'ana', 1)), 1200, 800, 2000, 1::smallint, 'bi-eins')$$,
  'attach: staff, two images with thumbs in order, size from the storage service');
select results_eq($$select author_id, text from public.comments where id = (select id from c where name = 'ana1')$$,
  $$values (pg_temp.id('ana'), 'Vorlage für die Kachel'::text)$$, 'attach: the comment is created as usual');

select pg_temp.as_key((select k from keys where name = 'g1'));
insert into c select 'g1', id from public.annotation_add_comment_with_images('bi-eins', '/start', 'Antwort mit Bild',
  jsonb_build_array(pg_temp.img(pg_temp.p('bi-eins', 'g1', 21))), p_parent_id => (select id from c where name = 'ana1'));
select results_eq($$select path from public.annotation_images where comment_id = (select id from c where name = 'g1')$$,
  $$values (pg_temp.p('bi-eins', 'g1', 21))$$, 'attach: guest, reply with an image');

select pg_temp.as_key('k-ana-bi');
select lives_ok($$select public.annotation_add_comment_with_images('bi-eins', '/start', 'Ohne Bild', '[]')$$,
  'attach: no images is a plain comment');

create temp table n0 as select count(*) as n from public.comments where project_id = 'bi-eins';
grant select on n0 to anon;
select throws_ok($$select public.annotation_add_comment_with_images('bi-eins', '/start', 'Fremd',
    jsonb_build_array(pg_temp.img(pg_temp.p('bi-eins', 'bo', 31))))$$,
  'AN001', 'Image not found. Send again.', 'attach: an upload of another person refused');
select throws_ok($$select public.annotation_add_comment_with_images('bi-eins', '/start', 'Falsches Projekt',
    jsonb_build_array(pg_temp.img(pg_temp.p('bi-zwei', 'ana', 2))))$$,
  'AN001', 'Image not found. Send again.', 'attach: an upload in another project refused');
select throws_ok($$select public.annotation_add_comment_with_images('bi-eins', '/start', 'Schon benutzt',
    jsonb_build_array(pg_temp.img(pg_temp.p('bi-eins', 'ana', 1))))$$,
  'AN001', 'This image belongs to another comment.', 'attach: an image of another comment refused');
select throws_ok($$select public.annotation_add_comment_with_images('bi-eins', '/start', 'Vorschau fehlt',
    jsonb_build_array(pg_temp.img(pg_temp.p('bi-eins', 'ana', 4), p_thumb => pg_temp.p('bi-eins', 'ana', 97))))$$,
  'AN001', 'Image not found. Send again.', 'attach: a thumb that was never uploaded refused');
select throws_ok($$select public.annotation_add_comment_with_images('bi-eins', '/start', 'Fremde Vorschau',
    jsonb_build_array(pg_temp.img(pg_temp.p('bi-eins', 'ana', 4), p_thumb => pg_temp.p('bi-eins', 'bo', 31))))$$,
  'AN001', 'Image not found. Send again.', 'attach: a thumb of another person refused');
select throws_ok($$select public.annotation_add_comment_with_images('bi-eins', '/start', 'Alte Vorschau',
    jsonb_build_array(pg_temp.img(pg_temp.p('bi-eins', 'ana', 4), p_thumb => pg_temp.p('bi-eins', 'ana', 43))))$$,
  'AN001', 'Image not found. Send again.', 'attach: a thumb older than an hour refused');
select throws_ok($$select public.annotation_add_comment_with_images('bi-eins', '/start', 'Benutzte Vorschau',
    jsonb_build_array(pg_temp.img(pg_temp.p('bi-eins', 'ana', 4), p_thumb => pg_temp.t(pg_temp.p('bi-eins', 'ana', 1)))))$$,
  'AN001', 'This image belongs to another comment.', 'attach: a thumb of another comment refused');
select throws_ok($$select public.annotation_add_comment_with_images('bi-eins', '/start', 'Selbst als Vorschau',
    jsonb_build_array(pg_temp.img(pg_temp.p('bi-eins', 'ana', 4), p_thumb => pg_temp.p('bi-eins', 'ana', 4))))$$,
  'AN001', 'Image sent twice.', 'attach: an image as its own thumb refused');
select throws_ok($$select public.annotation_add_comment_with_images('bi-eins', '/start', 'Doppelt',
    jsonb_build_array(pg_temp.img(pg_temp.p('bi-eins', 'ana', 4)), pg_temp.img(pg_temp.p('bi-eins', 'ana', 4))))$$,
  'AN001', 'Image sent twice.', 'attach: the same image twice refused');
select throws_ok($$select public.annotation_add_comment_with_images('bi-eins', '/start', E'\u200B\u200C\u200D\u2060\uFEFF \n',
    jsonb_build_array(pg_temp.img(pg_temp.p('bi-eins', 'ana', 4))))$$,
  'AN001', 'Write a comment to go with the images.', 'attach: only zero-width characters with an image refused');
select throws_ok($$select public.annotation_add_comment_with_images('bi-eins', '/start', 'Alt',
    jsonb_build_array(pg_temp.img(pg_temp.p('bi-eins', 'ana', 43))))$$,
  'AN001', 'Image not found. Send again.', 'attach: an upload older than an hour refused');
select throws_ok($$select public.annotation_add_comment_with_images('bi-eins', '/start', E' \n\t ',
    jsonb_build_array(pg_temp.img(pg_temp.p('bi-eins', 'ana', 4))))$$,
  'AN001', 'Write a comment to go with the images.', 'attach: only spaces with an image refused');
select throws_ok($$select public.annotation_add_comment_with_images('bi-eins', '/start', 'Null breit',
    jsonb_build_array(pg_temp.img(pg_temp.p('bi-eins', 'ana', 4), 0, 800)))$$,
  'AN001', 'Image size is invalid.', 'attach: width 0 refused');
select throws_ok($$select public.annotation_add_comment_with_images('bi-eins', '/start', 'Text statt Zahl',
    jsonb_build_array(jsonb_build_object('path', pg_temp.p('bi-eins', 'ana', 4), 'width', 'breit', 'height', 800)))$$,
  'AN001', 'Image size is invalid.', 'attach: width that is no number refused');
select throws_ok($$select public.annotation_add_comment_with_images('bi-eins', '/start', 'Ohne Höhe',
    jsonb_build_array(jsonb_build_object('path', pg_temp.p('bi-eins', 'ana', 4), 'width', 800)))$$,
  'AN001', 'Image size is invalid.', 'attach: missing height refused');
select throws_ok($$select public.annotation_add_comment_with_images('bi-eins', '/start', 'Zu groß',
    jsonb_build_array(pg_temp.img(pg_temp.p('bi-eins', 'ana', 42))))$$,
  'AN001', 'Image not found. Send again.', 'attach: over 5 MiB refused');
select throws_ok($$select public.annotation_add_comment_with_images('bi-eins', '/start', 'Gibt es nicht',
    jsonb_build_array(pg_temp.img(pg_temp.p('bi-eins', 'ana', 99))))$$,
  'AN001', 'Image not found. Send again.', 'attach: missing file refused');
select throws_ok($$select public.annotation_add_comment_with_images('bi-eins', '/start', 'Riesig',
    jsonb_build_array(pg_temp.img(pg_temp.p('bi-eins', 'ana', 4), 1200, 1601)))$$,
  'AN001', 'Image size is invalid.', 'attach: height over 1600 px refused');

select pg_temp.as_key('k-bo-bi');
select throws_ok($$select public.annotation_add_comment_with_images('bi-eins', '/start', 'Sechs',
    (select jsonb_agg(pg_temp.img(pg_temp.p('bi-eins', 'bo', 30 + n))) from generate_series(1, 6) n))$$,
  'AN001', 'At most 5 images per comment.', 'attach: a sixth image refused');
select lives_ok($$select public.annotation_add_comment_with_images('bi-eins', '/start', 'Fünf',
    (select jsonb_agg(pg_temp.img(pg_temp.p('bi-eins', 'bo', 30 + n))) from generate_series(1, 5) n))$$,
  'attach: five images');
select throws_ok($$insert into public.annotation_images (comment_id, project_id, path, width, height, size_bytes, position)
    values ((select id from c where name = 'ana1'), 'bi-eins', pg_temp.p('bi-eins', 'bo', 36), 10, 10, 2000, 4)$$,
  '42501', null, 'attach: no direct insert, so no image on a comment of someone else');

select pg_temp.as_key((select k from keys where name = 'g1'));
select throws_ok($$select public.annotation_add_comment_with_images('bi-zwei', '/start', 'Fremdes Projekt',
    jsonb_build_array(pg_temp.img(pg_temp.p('bi-eins', 'g1', 22))))$$,
  '42501', null, 'attach: guest, comment in another project refused');
select pg_temp.as_key(null);
select throws_ok($$select public.annotation_add_comment_with_images('bi-eins', '/start', 'Ohne Schlüssel',
    jsonb_build_array(pg_temp.img(pg_temp.p('bi-eins', 'g1', 22))))$$,
  '42501', null, 'attach: without key refused');

reset role;
select results_eq($$select count(*) from public.comments where project_id = 'bi-eins'$$,
  $$select n + 1 from n0$$, 'attach: refused calls leave no comment behind (only Bo''s five)');

-- ---------------------------------------------------------------- Reading
select pg_temp.as_key((select k from keys where name = 'g1'));
select results_eq($$select count(*)::int from public.annotation_images where project_id = 'bi-eins'$$, $$values (8)$$,
  'read: a guest reads the references of the own project');
select pg_temp.as_key((select k from keys where name = 'g2'));
select is_empty($$select 1 from public.annotation_images where project_id = 'bi-eins'$$,
  'read: a guest of another project reads none');
select pg_temp.as_key(null);
select is_empty($$select 1 from public.annotation_images$$, 'read: nothing without key');

select pg_temp.as_key('k-bo-bi');
insert into c select 'bo0', id from public.annotation_add_comment_with_images('bi-eins', '/start', 'Antwort ohne Bild', '[]',
  p_parent_id => (select id from c where name = 'ana1'));
select results_eq(
  $$select comment_id, has_images from public.annotation_for_you() where project_id = 'bi-eins' order by created_at$$,
  $$values ((select id from c where name = 'ana1'), true)$$, 'for you: has_images on an entry with images');
select pg_temp.as_key('k-ana-bi');
select set_eq(
  $$select comment_id, has_images from public.annotation_for_you() where project_id = 'bi-eins'$$,
  $$values ((select id from c where name = 'g1'), true), ((select id from c where name = 'bo0'), false)$$,
  'for you: has_images on a reply with an image, not on one without');

-- ---------------------------------------------------------------- Deleting
-- A file in use stays, also for its uploader.
select pg_temp.as_key('k-ana-bi');
delete from storage.objects where name = pg_temp.p('bi-eins', 'ana', 1);
select ok(pg_temp.exists_file(pg_temp.p('bi-eins', 'ana', 1)), 'delete: a file in use stays');
delete from storage.objects where name = pg_temp.t(pg_temp.p('bi-eins', 'ana', 1));
select ok(pg_temp.exists_file(pg_temp.t(pg_temp.p('bi-eins', 'ana', 1))), 'delete: a thumb in use stays');
-- Files of others stay, also unused ones.
select pg_temp.as_key('k-bo-bi');
delete from storage.objects where name = pg_temp.p('bi-eins', 'ana', 4);
select ok(pg_temp.exists_file(pg_temp.p('bi-eins', 'ana', 4)), 'delete: another person''s unused file stays');
select pg_temp.as_key(null);
delete from storage.objects where name = pg_temp.p('bi-eins', 'ana', 4);
select ok(pg_temp.exists_file(pg_temp.p('bi-eins', 'ana', 4)), 'delete: nothing without key');
select pg_temp.as_key('k-ana-bi');
delete from storage.objects where name = pg_temp.p('bi-eins', 'ana', 4);
select ok(not pg_temp.exists_file(pg_temp.p('bi-eins', 'ana', 4)), 'delete: own unused file');
select pg_temp.as_key((select k from keys where name = 'g1'));
delete from storage.objects where name = pg_temp.p('bi-eins', 'g1', 22);
select ok(not pg_temp.exists_file(pg_temp.p('bi-eins', 'g1', 22)), 'delete: guest, own unused file');

-- Deleting a comment removes its references; then the uploader may delete the file.
delete from public.comments where id = (select id from c where name = 'g1');
reset role;
select is_empty($$select 1 from public.annotation_images where comment_id = (select id from c where name = 'g1')$$,
  'delete comment: its references are gone');
select pg_temp.as_key('k-ana-bi');
delete from storage.objects where name = pg_temp.p('bi-eins', 'g1', 21);
select ok(pg_temp.exists_file(pg_temp.p('bi-eins', 'g1', 21)), 'delete: the thread author cannot delete a reply''s file');
select pg_temp.as_key((select k from keys where name = 'g1'));
delete from storage.objects where name in (pg_temp.p('bi-eins', 'g1', 21), pg_temp.t(pg_temp.p('bi-eins', 'g1', 21)));
select ok(not pg_temp.exists_file(pg_temp.p('bi-eins', 'g1', 21)) and not pg_temp.exists_file(pg_temp.t(pg_temp.p('bi-eins', 'g1', 21))),
  'delete: the uploader deletes the files (image and thumb) of the deleted comment');

-- ---------------------------------------------------------------- Orphans (service role)
-- Stored files cannot change, so age them by storing them again.
create function pg_temp.age(p_names text[]) returns void language sql as $$
  with gone as (delete from storage.objects where bucket_id = 'comment-images' and name = any (p_names) returning name, metadata)
  insert into storage.objects (bucket_id, name, metadata, created_at)
  select 'comment-images', name, metadata, now() - interval '25 hours' from gone
$$;
reset role;
select pg_temp.age(array[pg_temp.p('bi-zwei', 'ana', 2), pg_temp.p('bi-eins', 'ana', 1), pg_temp.t(pg_temp.p('bi-eins', 'ana', 1))]);
set local role service_role;
select results_eq(
  $$select path, size_bytes from public.annotation_orphan_images() where path like 'bi-%'$$,
  $$values (pg_temp.p('bi-zwei', 'ana', 2), 2000::bigint)$$,
  'orphans: unused and older than 24 h; not files or thumbs in use, not new ones');
reset role;
select pg_temp.age(array(select name from storage.objects where bucket_id = 'comment-images' and name like 'bi-%'));
set local role service_role;
select set_eq(
  $$select path from public.annotation_orphan_images() where path like 'bi-%'$$,
  $$values (pg_temp.p('bi-zwei', 'ana', 2)), (pg_temp.p('bi-eins', 'ana', 5)), (pg_temp.p('bi-eins', 'ana', 42)),
      (pg_temp.p('bi-eins', 'ana', 43)), (pg_temp.p('bi-eins', 'bo', 36))$$,
  'orphans: every unused file, none in use');
reset role;

select * from finish();
rollback;
