-- Zentrales DAYONE-Annotation-Schema: eine Datenbank für alle Projekte.
-- Anmeldung per Schlüssel je Person, ohne Supabase-Auth: Der Browser schickt den Schlüssel bei
-- jeder Anfrage im Header x-annotation-key mit (Rolle anon), RLS prüft Person und Projektzugriff.
--   Mitarbeiter: DAYONE-E-Mail, Vorname, Nachname optional; Schlüssel gilt für alle Projekte.
--   Externe: Anzeigename, genau ein Projekt; Schlüssel gilt nur dort.
-- Gespeichert wird nur der SHA-256 des Schlüssels. Anlegen und Entzug: scripts/annotation-admin.mjs.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Personen
-- ---------------------------------------------------------------------------
create table public.annotation_people (
  id uuid primary key default gen_random_uuid(),
  -- null = Mitarbeiter (alle Projekte), sonst Externer in genau diesem Projekt.
  project_id text check (char_length(project_id) between 1 and 64),
  email text unique check (email = lower(btrim(email)) and email ~ '^[^@[:space:]]+@dayone\.de$'),
  first_name text check (char_length(first_name) between 1 and 48 and first_name = btrim(first_name)),
  last_name text check (char_length(last_name) between 1 and 48 and last_name = btrim(last_name)),
  display_name text not null
    check (char_length(display_name) between 2 and 48 and display_name = btrim(display_name)),
  key_hash bytea unique,
  created_at timestamptz not null default now(),
  constraint annotation_people_art check (
    (project_id is null and email is not null and first_name is not null)
    or (project_id is not null and email is null and first_name is null and last_name is null)
  )
);

alter table public.annotation_people enable row level security;
revoke all on public.annotation_people from anon, authenticated;
-- Nur Name und ID sind über die API lesbar; E-Mail und key_hash nie.
grant select (id, display_name) on public.annotation_people to anon;

-- ---------------------------------------------------------------------------
-- Kommentare: author_id ist die Person; den Namen liefert annotation_people beim Lesen.
-- ---------------------------------------------------------------------------
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  project_id text not null check (char_length(project_id) between 1 and 64),
  page_path text not null check (char_length(page_path) between 1 and 512),
  selector text check (char_length(selector) <= 2048),
  rect jsonb,
  text text not null check (char_length(text) between 1 and 10000),
  author_id uuid not null references public.annotation_people (id),
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  parent_id uuid references public.comments (id) on delete cascade
);

create index comments_project_created_idx on public.comments (project_id, created_at);
create index comments_parent_idx on public.comments (parent_id);
create index comments_author_idx on public.comments (author_id);

alter table public.comments enable row level security;
-- TRUNCATE umgeht RLS, deshalb Rechte explizit statt Supabase-Default (all).
revoke all on public.comments from anon, authenticated;
grant select, delete on public.comments to anon;
-- Autor, Status und Zeit setzt der Server (Trigger), der Browser schickt sie nicht.
grant insert (id, project_id, page_path, selector, rect, text, parent_id) on public.comments to anon;
-- Ändern nur Position und Erledigt-Status, nie Text, Autor oder Projekt.
grant update (rect, selector, resolved, resolved_at) on public.comments to anon;

-- ---------------------------------------------------------------------------
-- Funktionen
-- ---------------------------------------------------------------------------
-- Person zum Schlüssel aus dem Header; null ohne oder mit ungültigem bzw. entzogenem Schlüssel.
create function public.annotation_me()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.annotation_people p
  where p.key_hash = extensions.digest(
    nullif(nullif(current_setting('request.headers', true), '')::json ->> 'x-annotation-key', ''),
    'sha256');
$$;

-- Person, wenn sie Zugriff aufs Projekt hat: Mitarbeiter überall, Externe nur im eigenen Projekt.
create function public.annotation_person_for(p_project_id text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.annotation_people p
  where p.id = public.annotation_me()
    and (p.project_id is null or p.project_id = p_project_id);
$$;

-- Für das Overlay: wer bin ich in diesem Projekt? Leer ohne Zugriff.
create function public.annotation_whoami(p_project_id text)
returns table (id uuid, display_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name
  from public.annotation_people p
  where p.id = public.annotation_person_for(p_project_id);
$$;

-- Eigener Name; gilt sofort für alle Kommentare der Person, auch alte.
create function public.annotation_rename(p_display_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.annotation_people p
  set display_name = btrim(p_display_name)
  where p.id = public.annotation_me();

  if not found then
    raise exception 'invalid key' using errcode = '28000';
  end if;
end;
$$;

-- Autor, Zeitpunkt und Status setzt der Server, nicht der Browser.
create function public.annotation_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.author_id := public.annotation_person_for(new.project_id);

  if new.author_id is null then
    raise exception 'no access to this project' using errcode = '42501';
  end if;

  -- Antworten nur auf Threads im selben Projekt, keine Antwort auf Antworten.
  if new.parent_id is not null and not exists (
    select 1
    from public.comments c
    where c.id = new.parent_id
      and c.project_id = new.project_id
      and c.parent_id is null
  ) then
    raise exception 'invalid parent' using errcode = '23503';
  end if;

  new.created_at := now();
  new.resolved := false;
  new.resolved_at := null;
  return new;
end;
$$;

create trigger annotation_before_insert
before insert on public.comments
for each row execute function public.annotation_before_insert();

-- Realtime: postgres_changes sieht den Schlüssel-Header nicht. Stattdessen ein leerer Ping je
-- Projekt (öffentlicher Broadcast); das Overlay lädt daraufhin mit Schlüssel neu.
create function public.annotation_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send('{}'::jsonb, 'changed', 'annotation:' || coalesce(new.project_id, old.project_id), false);
  return null;
end;
$$;

create trigger annotation_notify
after insert or update or delete on public.comments
for each row execute function public.annotation_notify();

-- Umbenennung: Ping in jedes Projekt, in dem die Person kommentiert hat, damit alte Kommentare sofort umschalten.
create function public.annotation_notify_rename()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send('{}'::jsonb, 'changed', 'annotation:' || c.project_id, false)
  from (select distinct project_id from public.comments where author_id = new.id) c;
  return null;
end;
$$;

create trigger annotation_notify_rename
after update of display_name on public.annotation_people
for each row when (old.display_name is distinct from new.display_name)
execute function public.annotation_notify_rename();

-- Admin (nur service_role, über scripts/annotation-admin.mjs). Schlüssel: 256 Bit, einmalig zurückgegeben.
create function public.annotation_new_key(p_person_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  update public.annotation_people
  set key_hash = extensions.digest(v_key, 'sha256')
  where id = p_person_id;

  if not found then
    raise exception 'unknown person' using errcode = 'P0002';
  end if;

  return v_key;
end;
$$;

create function public.annotation_add_staff(p_email text, p_first_name text, p_last_name text default null)
returns table (person_id uuid, key text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_id uuid;
  v_first text := btrim(p_first_name);
  v_last text := nullif(btrim(p_last_name), '');
begin
  insert into public.annotation_people (email, first_name, last_name, display_name)
  values (lower(btrim(p_email)), v_first, v_last, concat_ws(' ', v_first, v_last))
  returning id into v_id;

  return query select v_id, public.annotation_new_key(v_id);
end;
$$;

create function public.annotation_add_guest(p_project_id text, p_display_name text)
returns table (person_id uuid, key text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_id uuid;
begin
  insert into public.annotation_people (project_id, display_name)
  values (btrim(p_project_id), btrim(p_display_name))
  returning id into v_id;

  return query select v_id, public.annotation_new_key(v_id);
end;
$$;

-- Entzug: Schlüssel löschen. Kommentare und Name bleiben, die Person kommt nicht mehr hinein.
create function public.annotation_revoke_key(p_person_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.annotation_people set key_hash = null where id = p_person_id;

  if not found then
    raise exception 'unknown person' using errcode = 'P0002';
  end if;
end;
$$;

-- Supabase vergibt EXECUTE auf neue Funktionen standardmäßig an anon und authenticated.
revoke all on function public.annotation_me() from public, anon, authenticated;
revoke all on function public.annotation_person_for(text) from public, anon, authenticated;
revoke all on function public.annotation_whoami(text) from public, anon, authenticated;
revoke all on function public.annotation_rename(text) from public, anon, authenticated;
revoke all on function public.annotation_before_insert() from public, anon, authenticated;
revoke all on function public.annotation_notify() from public, anon, authenticated;
revoke all on function public.annotation_notify_rename() from public, anon, authenticated;
revoke all on function public.annotation_new_key(uuid) from public, anon, authenticated;
revoke all on function public.annotation_add_staff(text, text, text) from public, anon, authenticated;
revoke all on function public.annotation_add_guest(text, text) from public, anon, authenticated;
revoke all on function public.annotation_revoke_key(uuid) from public, anon, authenticated;
grant execute on function public.annotation_me() to anon;
grant execute on function public.annotation_person_for(text) to anon;
grant execute on function public.annotation_whoami(text) to anon;
grant execute on function public.annotation_rename(text) to anon;
grant execute on function public.annotation_new_key(uuid) to service_role;
grant execute on function public.annotation_add_staff(text, text, text) to service_role;
grant execute on function public.annotation_add_guest(text, text) to service_role;
grant execute on function public.annotation_revoke_key(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Policies (nur anon; authenticated hat keine Rechte)
-- ---------------------------------------------------------------------------
-- Sichtbar: man selbst und Autoren von Kommentaren, die man lesen darf (RLS von comments greift).
create policy people_select on public.annotation_people
  for select to anon
  using (
    id = public.annotation_me()
    or exists (select 1 from public.comments c where c.author_id = annotation_people.id)
  );

create policy comments_select on public.comments
  for select to anon
  using (public.annotation_person_for(project_id) is not null);

create policy comments_insert on public.comments
  for insert to anon
  with check (public.annotation_person_for(project_id) is not null);

create policy comments_update on public.comments
  for update to anon
  using (public.annotation_person_for(project_id) is not null)
  with check (public.annotation_person_for(project_id) is not null);

-- Löschen nur eigene Kommentare; Antworten fremder Personen fallen per Cascade mit dem Thread.
create policy comments_delete on public.comments
  for delete to anon
  using (author_id = public.annotation_person_for(project_id));
