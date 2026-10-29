-- Images on comments (point 5). Files live in the public storage bucket comment-images, references in
-- annotation_images; the comments row carries no image data.
-- Path: <project_id>/<person_id>/<random UUID v4>.webp|jpg. The UUID (122 random bits, crypto.randomUUID in the
-- browser) makes the address unguessable; the file is readable without a key (Arthur, 29.10.2026). Writing
-- and deleting are bound to the key in the x-annotation-key header: the storage service runs as anon with the
-- request headers set, like PostgREST, so the policies below use annotation_me() and annotation_my_projects().
-- Upload: own folder in a project of the key, image/webp or image/jpeg (extension to match), at most 5 MiB.
-- The bucket enforces type and size as well; the policy is checked again after the upload with the real size.
-- Attach: annotation_add_comment_with_images() creates the comment and its references in one transaction,
-- only with own uploads of the same project, at most 5 per comment. Deleting a comment deletes its references;
-- the browser then deletes the files (allowed for the uploader once no reference points to them). Files without
-- a reference: scripts/annotation-admin.mjs orphan-images [--delete].
-- Image errors: SQLSTATE AN001 with a readable message, like mentions.
-- Idempotent, so a database that already has it can run it again.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comment-images', 'comment-images', true, 5242880, array['image/webp', 'image/jpeg'])
on conflict (id) do update
set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- References
-- ---------------------------------------------------------------------------
-- path: object name in the bucket; public URL <SUPABASE_URL>/storage/v1/object/public/comment-images/<path>.
-- width, height: pixels of the stored image (from the browser, for the layout). size_bytes: from the storage
-- service. position: order in the comment, 0 to 4; together with the unique key at most 5 images per comment.
create table if not exists public.annotation_images (
  id bigint generated always as identity primary key,
  comment_id uuid not null references public.comments (id) on delete cascade,
  project_id text not null references public.annotation_projects (id),
  path text not null unique,
  width integer not null check (width between 1 and 1600),
  height integer not null check (height between 1 and 1600),
  size_bytes integer not null check (size_bytes between 1 and 5242880),
  position smallint not null check (position between 0 and 4),
  unique (comment_id, position)
);

alter table public.annotation_images enable row level security;
revoke all on public.annotation_images from anon, authenticated;
-- Readable like the comment; written only by annotation_add_comment_with_images(), deleted with the comment.
grant select on public.annotation_images to anon;

drop policy if exists images_select on public.annotation_images;
create policy images_select on public.annotation_images
  for select to anon
  using (project_id = any ((select public.annotation_my_projects())::text[]));

-- ---------------------------------------------------------------------------
-- Files (storage.objects, bucket comment-images). Own files = own folder in a project of the key.
-- ---------------------------------------------------------------------------
drop policy if exists annotation_images_upload on storage.objects;
create policy annotation_images_upload on storage.objects
  for insert to anon
  with check (
    bucket_id = 'comment-images'
    and name ~ '^[a-z0-9][a-z0-9-]{1,62}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(webp|jpg)$'
    and (storage.foldername(name))[1] = any ((select public.annotation_my_projects())::text[])
    and (storage.foldername(name))[2] = (select public.annotation_me())::text
    and (metadata ->> 'mimetype', right(name, 4)) in (('image/webp', 'webp'), ('image/jpeg', '.jpg'))
    -- Before the upload the service knows the declared length (if any), afterwards the real size.
    and coalesce((metadata ->> 'size')::bigint, (metadata ->> 'contentLength')::bigint, 0) <= 5242880
  );

-- Own files only (needed by upload and delete); nobody can list the files of others.
drop policy if exists annotation_images_own on storage.objects;
create policy annotation_images_own on storage.objects
  for select to anon
  using (
    bucket_id = 'comment-images'
    and (storage.foldername(name))[1] = any ((select public.annotation_my_projects())::text[])
    and (storage.foldername(name))[2] = (select public.annotation_me())::text
  );

-- Delete own files once no comment uses them (after deleting the comment, or after an aborted comment).
drop policy if exists annotation_images_delete on storage.objects;
create policy annotation_images_delete on storage.objects
  for delete to anon
  using (
    bucket_id = 'comment-images'
    and (storage.foldername(name))[1] = any ((select public.annotation_my_projects())::text[])
    and (storage.foldername(name))[2] = (select public.annotation_me())::text
    and not exists (select 1 from public.annotation_images i where i.path = objects.name)
  );

-- ---------------------------------------------------------------------------
-- Comment with images
-- ---------------------------------------------------------------------------
-- Like annotation_add_comment (same checks, same row back), plus p_images: a list of up to 5
-- {"path": "<project>/<person>/<uuid>.webp", "width": 1200, "height": 800} in display order. Every path must be
-- an upload of the author in the comment's project, of an allowed type and size, and not used by another
-- comment. Any error leaves nothing behind, so the browser can keep the text and retry.
-- The returned row is read before the images exist; PostgREST embeds no images in it, the next ping loads them.
create or replace function public.annotation_add_comment_with_images(
  p_project_id text,
  p_page_path text,
  p_text text,
  p_images jsonb,
  p_selector text default null,
  p_rect jsonb default null,
  p_parent_id uuid default null,
  p_mentions uuid[] default '{}'
)
returns setof public.comments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.comments;
  v_images jsonb := coalesce(p_images, '[]');
  v_image record;
begin
  if jsonb_typeof(v_images) <> 'array' then
    raise exception 'Images must be a list.' using errcode = 'AN001';
  end if;
  if jsonb_array_length(v_images) > 5 then
    raise exception 'At most 5 images per comment.' using errcode = 'AN001';
  end if;

  select * into v_row
  from public.annotation_add_comment(p_project_id, p_page_path, p_text, p_selector, p_rect, p_parent_id, p_mentions);

  for v_image in select value, ordinality - 1 as position from jsonb_array_elements(v_images) with ordinality loop
    begin
      insert into public.annotation_images (comment_id, project_id, path, width, height, size_bytes, position)
      select v_row.id, v_row.project_id, o.name, (v_image.value ->> 'width')::integer,
        (v_image.value ->> 'height')::integer, (o.metadata ->> 'size')::integer, v_image.position
      from storage.objects o
      where o.bucket_id = 'comment-images'
        and o.name = v_image.value ->> 'path'
        and (storage.foldername(o.name))[1] = v_row.project_id
        and (storage.foldername(o.name))[2] = v_row.author_id::text
        and o.metadata ->> 'mimetype' in ('image/webp', 'image/jpeg')
        and (o.metadata ->> 'size')::bigint <= 5242880;
    exception when unique_violation then
      raise exception 'This image belongs to another comment.' using errcode = 'AN001';
    end;
    if not found then
      raise exception 'Image not found. Upload it again.' using errcode = 'AN001';
    end if;
  end loop;

  return next v_row;
end;
$$;

revoke all on function public.annotation_add_comment_with_images(text, text, text, jsonb, text, jsonb, uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.annotation_add_comment_with_images(text, text, text, jsonb, text, jsonb, uuid, uuid[])
  to anon;

-- ---------------------------------------------------------------------------
-- For you: has_images marks entries whose comment has images (icon in the list). Otherwise unchanged.
-- ---------------------------------------------------------------------------
drop function if exists public.annotation_for_you();
create function public.annotation_for_you()
returns table (
  project_id text,
  project_name text,
  project_domain text,
  page_path text,
  thread_id uuid,
  comment_id uuid,
  kind text,
  actor_name text,
  text_start text,
  created_at timestamptz,
  is_read boolean,
  has_images boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select p.id, p.is_guest, public.annotation_my_projects() as projects
    from public.annotation_people p
    where p.id = public.annotation_me()
  ),
  events as (
    select distinct on (e.comment_id) e.comment_id, e.kind
    from (
      select m.comment_id, 'mention' as kind
      from public.annotation_mentions m, me
      where m.person_id = me.id
      union all
      select r.id, 'reply'
      from public.comments t
      join public.comments r on r.parent_id = t.id
      cross join me
      where t.author_id = me.id and t.parent_id is null
    ) e
    order by e.comment_id, e.kind  -- 'mention' before 'reply'
  )
  select c.project_id, pr.name,
    case when not me.is_guest then
      (select min(d.host) from public.annotation_project_domains d where d.project_id = c.project_id) end,
    t.page_path, t.id, c.id, e.kind, a.display_name, left(c.text, 140), c.created_at,
    exists (
      select 1 from public.annotation_reads rd
      where rd.person_id = me.id and rd.thread_id = t.id and rd.read_at >= c.created_at),
    exists (select 1 from public.annotation_images i where i.comment_id = c.id)
  from events e
  cross join me
  join public.comments c on c.id = e.comment_id
  join public.comments t on t.id = coalesce(c.parent_id, c.id)
  join public.annotation_projects pr on pr.id = c.project_id
  join public.annotation_people a on a.id = c.author_id
  where c.author_id <> me.id
    and c.project_id = any (me.projects)
    and not t.resolved
  order by c.created_at desc, c.id;
$$;

revoke all on function public.annotation_for_you() from public, anon, authenticated;
grant execute on function public.annotation_for_you() to anon;

-- ---------------------------------------------------------------------------
-- Service role only (scripts/annotation-admin.mjs orphan-images): files no comment uses, older than
-- p_older_than (uploads of an aborted comment, files of a deleted comment the browser did not remove).
-- ---------------------------------------------------------------------------
create or replace function public.annotation_orphan_images(p_older_than interval default interval '24 hours')
returns table (path text, size_bytes bigint, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select o.name, (o.metadata ->> 'size')::bigint, o.created_at
  from storage.objects o
  where o.bucket_id = 'comment-images'
    and o.created_at < now() - p_older_than
    and not exists (select 1 from public.annotation_images i where i.path = o.name)
  order by o.created_at, o.name;
$$;

revoke all on function public.annotation_orphan_images(interval) from public, anon, authenticated;
grant execute on function public.annotation_orphan_images(interval) to service_role;
