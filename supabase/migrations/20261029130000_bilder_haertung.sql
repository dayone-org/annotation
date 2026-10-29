-- Images on comments, hardening after the review (point 5, round 1).
-- A signed upload URL (POST /object/upload/sign) is checked against the upload policy once; the upload itself
-- then runs as the storage service past every policy, and its token stays valid for two hours. With
-- x-upsert it replaced an attached image, and the declared type did not have to match the extension. So the
-- table itself enforces both, for every role:
-- - a stored file in comment-images never changes (content, metadata, name); new content means a new file;
-- - on insert, the type matches the extension (image/webp .webp, image/jpeg .jpg).
-- annotation_add_comment_with_images() also takes only uploads younger than one hour (orphan-images --delete
-- removes unused files after 24 hours, no race), checks width and height itself and wants text besides spaces.
-- Idempotent, so a database that already has it can run it again.

create or replace function public.annotation_images_fixed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'Images cannot be changed.' using errcode = 'AN001';
  end if;
  if not coalesce((new.metadata ->> 'mimetype', substring(new.name from '\.[^./]*$'))
      in (('image/webp', '.webp'), ('image/jpeg', '.jpg')), false) then
    raise exception 'Image type and extension do not match.' using errcode = 'AN001';
  end if;
  return new;
end;
$$;

revoke all on function public.annotation_images_fixed() from public, anon, authenticated;

drop trigger if exists annotation_images_fixed_update on storage.objects;
create trigger annotation_images_fixed_update
  before update on storage.objects
  for each row
  when (old.bucket_id = 'comment-images' or new.bucket_id = 'comment-images')
  execute function public.annotation_images_fixed();

drop trigger if exists annotation_images_fixed_insert on storage.objects;
create trigger annotation_images_fixed_insert
  before insert on storage.objects
  for each row
  when (new.bucket_id = 'comment-images')
  execute function public.annotation_images_fixed();

-- Unchanged from 20261029120000 except the three checks marked "new".
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
  -- new: a comment is text or text with images, never images alone.
  if coalesce(p_text, '') !~ '[^[:space:]]' then
    raise exception 'Write a comment to go with the images.' using errcode = 'AN001';
  end if;
  -- new: whole pixels 1 to 1600, as the browser stores them.
  if exists (
    select 1 from jsonb_array_elements(v_images) i, unnest(array[i ->> 'width', i ->> 'height']) s
    where case when s ~ '^[0-9]{1,4}$' then s::integer not between 1 and 1600 else true end
  ) then
    raise exception 'Image size is invalid.' using errcode = 'AN001';
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
        and (o.metadata ->> 'size')::bigint <= 5242880
        -- new: orphan-images --delete removes unused files after 24 hours; an hour keeps clear of it.
        and o.created_at > now() - interval '1 hour';
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
