-- Zentrales DAYONE-Annotation-Schema: eine Datenbank für alle Projekte.
-- Anmeldung per Schlüssel, ohne Supabase-Auth: Der Browser schickt seinen Schlüssel bei jeder Anfrage
-- im Header x-annotation-key mit (Rolle anon), RLS prüft Person und Projektzugriff.
--   Projekte: Name und Domains (Host inkl. Port); das Overlay findet sein Projekt über location.host.
--   Mitarbeitende: DAYONE-E-Mail, Vorname, Nachname optional; persönlicher Schlüssel für alle Projekte,
--     Name fest aus der Liste.
--   Gäste: ein Link je Projekt (Projekt-Schlüssel). Beim ersten Öffnen nur Name, dabei entsteht ein
--     eigener Browser-Schlüssel. Ein neuer Projekt-Link macht den alten und alle Gäste darüber wirkungslos.
-- Gespeichert wird nur der SHA-256 jedes Schlüssels. Pflege: scripts/annotation-admin.mjs (Service Role).

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Namen: unsichtbare Zeichen (Steuerzeichen, Tabs, Umbrüche, Zero-Width, Bidi) entfernen,
-- geschützte Leerzeichen wie Leerzeichen behandeln, NFC normalisieren, Ränder trimmen.
-- Gültig: höchstens 48 Zeichen (Codepoints, Kombinationszeichen zählen mit), mindestens 2 Buchstaben oder Ziffern.
-- ---------------------------------------------------------------------------
create function public.annotation_clean_name(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(
    regexp_replace(normalize(p_name, NFC), '[\u0000-\u001F\u007F-\u009F\u00AD\u180E\u200B-\u200F\u2028-\u202F\u2060-\u206F\uFEFF]', '', 'g'),
    '[\u00A0\u2000-\u200A\u3000]', ' ', 'g'));
$$;

create function public.annotation_name_ok(p_name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select char_length(p_name) <= 48
    and p_name ~ '[[:alnum:]].*[[:alnum:]]'
    and p_name = public.annotation_clean_name(p_name);
$$;

-- ---------------------------------------------------------------------------
-- Projekte und Domains: über die API unsichtbar.
-- ---------------------------------------------------------------------------
create table public.annotation_projects (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  -- Projekt-Link für Gäste; jede Erneuerung erhöht key_generation und sperrt alle früheren Gäste.
  key_hash bytea unique,
  key_generation integer not null default 0,
  -- Geheimes Realtime-Topic: nur wer gültigen Zugriff hat, erfährt es; wird bei jedem Entzug neu gewürfelt.
  realtime_topic uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now()
);

alter table public.annotation_projects enable row level security;
revoke all on public.annotation_projects from anon, authenticated;

create table public.annotation_project_domains (
  host text primary key check (host ~ '^[a-z0-9.-]+(:[0-9]{1,5})?$'),
  project_id text not null references public.annotation_projects (id) on delete cascade
);

alter table public.annotation_project_domains enable row level security;
revoke all on public.annotation_project_domains from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Personen
-- ---------------------------------------------------------------------------
create table public.annotation_people (
  id uuid primary key default gen_random_uuid(),
  -- null = Mitarbeitende (alle Projekte), sonst Gast in genau diesem Projekt.
  project_id text references public.annotation_projects (id) on delete cascade,
  -- Gäste gelten nur, solange der Projekt-Link ihrer Generation aktuell ist.
  key_generation integer,
  email text unique check (email = lower(btrim(email)) and email ~ '^[^@[:space:]]+@dayone\.de$'),
  first_name text check (char_length(first_name) between 1 and 48 and first_name = public.annotation_clean_name(first_name)),
  last_name text check (char_length(last_name) between 1 and 48 and last_name = public.annotation_clean_name(last_name)),
  display_name text not null check (public.annotation_name_ok(display_name)),
  is_guest boolean generated always as (project_id is not null) stored,
  key_hash bytea unique,
  created_at timestamptz not null default now(),
  constraint annotation_people_art check (
    (project_id is null and key_generation is null and email is not null and first_name is not null)
    or (project_id is not null and key_generation is not null and email is null and first_name is null and last_name is null)
  )
);

alter table public.annotation_people enable row level security;
revoke all on public.annotation_people from anon, authenticated;
-- Lesbar sind nur ID, Name und ob Gast; E-Mail, Projekt und key_hash nie.
grant select (id, display_name, is_guest) on public.annotation_people to anon;

-- ---------------------------------------------------------------------------
-- Kommentare: author_id ist die Person; den Namen liefert annotation_people beim Lesen.
-- ---------------------------------------------------------------------------
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.annotation_projects (id),
  page_path text not null check (char_length(page_path) between 1 and 512),
  selector text check (char_length(selector) <= 2048),
  rect jsonb,
  text text not null check (char_length(text) between 1 and 10000),
  author_id uuid not null references public.annotation_people (id),
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  -- Ein Thread mit Antworten lässt sich nicht löschen, nur erledigen (auch bei gleichzeitigem Insert).
  parent_id uuid references public.comments (id) on delete restrict
);

create index comments_project_created_idx on public.comments (project_id, created_at);
create index comments_parent_idx on public.comments (parent_id);
create index comments_author_idx on public.comments (author_id);

alter table public.comments enable row level security;
-- TRUNCATE umgeht RLS, deshalb Rechte explizit statt Supabase-Default (all).
revoke all on public.comments from anon, authenticated;
grant select, delete on public.comments to anon;
-- Autor, Status und Zeiten setzt der Server (Trigger), der Browser schickt sie nicht.
grant insert (id, project_id, page_path, selector, rect, text, parent_id) on public.comments to anon;
-- Erledigen darf jeder im Projekt, Verschieben nur der Autor (Trigger); resolved_at setzt die DB.
grant update (rect, selector, resolved) on public.comments to anon;

-- ---------------------------------------------------------------------------
-- Zugriff
-- ---------------------------------------------------------------------------
-- Person zum Schlüssel aus dem Header; null ohne, mit ungültigem oder entzogenem Schlüssel
-- und für Gäste, deren Projekt-Link erneuert wurde.
create function public.annotation_me()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.annotation_people p
  left join public.annotation_projects pr on pr.id = p.project_id
  where p.key_hash = extensions.digest(
      nullif(nullif(current_setting('request.headers', true), '')::json ->> 'x-annotation-key', ''),
      'sha256')
    and (p.project_id is null or p.key_generation = pr.key_generation);
$$;

-- Person, wenn sie Zugriff auf das (angelegte) Projekt hat: Mitarbeitende überall, Gäste im eigenen.
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
    and exists (select 1 from public.annotation_projects pr where pr.id = p_project_id)
    and (p.project_id is null or p.project_id = p_project_id);
$$;

-- Projekt zur Seite: Überschreibung durch das Overlay, sonst über die Domain.
create function public.annotation_resolve_project(p_host text, p_project_id text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(btrim(p_project_id), ''),
    (select d.project_id from public.annotation_project_domains d where d.host = lower(btrim(p_host))));
$$;

-- Für das Overlay: wer bin ich auf dieser Seite? Leer ohne Zugriff (dann bleibt das Overlay unsichtbar).
create function public.annotation_whoami(p_host text, p_project_id text default null)
returns table (project_id text, person_id uuid, display_name text, is_guest boolean, realtime_topic uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select pr.id, p.id, p.display_name, p.is_guest, pr.realtime_topic
  from public.annotation_projects pr
  join public.annotation_people p on p.id = public.annotation_person_for(pr.id)
  where pr.id = public.annotation_resolve_project(p_host, p_project_id);
$$;

-- Gilt der Projekt-Link für das Projekt dieser Seite? Nur dann fragt das Overlay nach dem Namen.
create function public.annotation_project_key_ok(p_key text, p_host text, p_project_id text default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.annotation_projects pr
    where pr.key_hash = extensions.digest(p_key, 'sha256')
      and pr.id = public.annotation_resolve_project(p_host, p_project_id));
$$;

-- Gast tritt mit Projekt-Link und Namen bei; liefert einmalig den eigenen Browser-Schlüssel.
create function public.annotation_join(p_key text, p_display_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project public.annotation_projects;
  v_name text := public.annotation_clean_name(p_display_name);
  v_key text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  select * into v_project from public.annotation_projects pr where pr.key_hash = extensions.digest(p_key, 'sha256');
  if v_project.id is null then
    raise exception 'invalid project link' using errcode = '28000';
  end if;
  -- Eigene Meldung statt Check-Verletzung: deren details enthielten die ganze Zeile.
  if not public.annotation_name_ok(v_name) then
    raise exception 'invalid name' using errcode = '23514';
  end if;

  insert into public.annotation_people (project_id, key_generation, display_name, key_hash)
  values (v_project.id, v_project.key_generation, v_name, extensions.digest(v_key, 'sha256'));
  return v_key;
end;
$$;

-- Umbenennen nur für Gäste; Mitarbeitende tragen den Namen aus der Liste.
create function public.annotation_rename(p_display_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.annotation_me();
  v_name text := public.annotation_clean_name(p_display_name);
begin
  if v_me is null then
    raise exception 'invalid key' using errcode = '28000';
  end if;
  if not exists (select 1 from public.annotation_people p where p.id = v_me and p.is_guest) then
    raise exception 'staff names are fixed' using errcode = '42501';
  end if;
  if not public.annotation_name_ok(v_name) then
    raise exception 'invalid name' using errcode = '23514';
  end if;

  update public.annotation_people set display_name = v_name where id = v_me;
end;
$$;

-- ---------------------------------------------------------------------------
-- Trigger
-- ---------------------------------------------------------------------------
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

-- Verschieben nur der Autor; resolved_at folgt dem Erledigt-Status.
create function public.annotation_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.rect, new.selector) is distinct from (old.rect, old.selector)
    and old.author_id is distinct from public.annotation_person_for(old.project_id) then
    raise exception 'only the author can move this thread' using errcode = '42501';
  end if;

  new.resolved_at := case
    when not new.resolved then null
    when old.resolved then old.resolved_at
    else now()
  end;
  return new;
end;
$$;

create trigger annotation_before_update
before update on public.comments
for each row execute function public.annotation_before_update();

-- Realtime: postgres_changes sieht den Schlüssel nicht. Stattdessen ein leerer Ping auf das geheime
-- Topic des Projekts; das Overlay lädt daraufhin mit Schlüssel neu.
create function public.annotation_ping(p_project_id text)
returns void
language sql
security definer
set search_path = ''
as $$
  select realtime.send('{}'::jsonb, 'changed', 'annotation:' || pr.realtime_topic::text, false)
  from public.annotation_projects pr
  where pr.id = p_project_id;
$$;

create function public.annotation_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.annotation_ping(coalesce(new.project_id, old.project_id));
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
  perform public.annotation_ping(c.project_id)
  from (select distinct project_id from public.comments where author_id = new.id) c;
  return null;
end;
$$;

create trigger annotation_notify_rename
after update of display_name on public.annotation_people
for each row when (old.display_name is distinct from new.display_name)
execute function public.annotation_notify_rename();

-- Entzug: letzter Ping auf das alte Topic (gültige Browser holen sich das neue), dann neu würfeln.
create function public.annotation_rotate_topics(p_project_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.annotation_ping(pr.id)
  from public.annotation_projects pr
  where p_project_id is null or pr.id = p_project_id;

  update public.annotation_projects
  set realtime_topic = gen_random_uuid()
  where p_project_id is null or id = p_project_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin (nur service_role, über scripts/annotation-admin.mjs). Schlüssel: 256 Bit, einmalig zurückgegeben.
-- ---------------------------------------------------------------------------
-- Projekt anlegen oder Namen und Domains ersetzen.
create function public.annotation_set_project(p_id text, p_name text, p_domains text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.annotation_projects (id, name) values (p_id, btrim(p_name))
  on conflict (id) do update set name = excluded.name;

  delete from public.annotation_project_domains where project_id = p_id;
  insert into public.annotation_project_domains (host, project_id)
  select lower(btrim(h)), p_id from unnest(p_domains) h;
end;
$$;

-- Neuer Projekt-Link: alter Link und alle darüber beigetretenen Gäste sind sofort wirkungslos.
create function public.annotation_new_project_key(p_project_id text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  update public.annotation_projects
  set key_hash = extensions.digest(v_key, 'sha256'), key_generation = key_generation + 1
  where id = p_project_id;

  if not found then
    raise exception 'unknown project' using errcode = 'P0002';
  end if;

  perform public.annotation_rotate_topics(p_project_id);
  return v_key;
end;
$$;

-- Neuer persönlicher Schlüssel für Mitarbeitende; der alte ist sofort ungültig.
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
  where id = p_person_id and not is_guest;

  if not found then
    raise exception 'unknown staff member' using errcode = 'P0002';
  end if;

  perform public.annotation_rotate_topics(null);
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
  v_first text := public.annotation_clean_name(p_first_name);
  v_last text := nullif(public.annotation_clean_name(p_last_name), '');
  v_key text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  insert into public.annotation_people (email, first_name, last_name, display_name, key_hash)
  values (lower(btrim(p_email)), v_first, v_last, concat_ws(' ', v_first, v_last), extensions.digest(v_key, 'sha256'))
  returning id into v_id;

  return query select v_id, v_key;
end;
$$;

-- Entzug für Mitarbeitende: Schlüssel löschen. Kommentare und Name bleiben.
create function public.annotation_revoke_key(p_person_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.annotation_people set key_hash = null where id = p_person_id and not is_guest;

  if not found then
    raise exception 'unknown staff member' using errcode = 'P0002';
  end if;

  perform public.annotation_rotate_topics(null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Rechte auf Funktionen (Supabase vergibt EXECUTE standardmäßig an anon und authenticated).
-- ---------------------------------------------------------------------------
do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname like 'annotation\_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;

-- Für Policies, Checks und Generated Columns, die als anon ausgewertet werden.
grant execute on function public.annotation_clean_name(text) to anon;
grant execute on function public.annotation_name_ok(text) to anon;
grant execute on function public.annotation_me() to anon;
grant execute on function public.annotation_person_for(text) to anon;
-- Für das Overlay.
grant execute on function public.annotation_whoami(text, text) to anon;
grant execute on function public.annotation_project_key_ok(text, text, text) to anon;
grant execute on function public.annotation_join(text, text) to anon;
grant execute on function public.annotation_rename(text) to anon;
-- Für das Admin-Skript.
grant execute on function public.annotation_set_project(text, text, text[]) to service_role;
grant execute on function public.annotation_new_project_key(text) to service_role;
grant execute on function public.annotation_new_key(uuid) to service_role;
grant execute on function public.annotation_add_staff(text, text, text) to service_role;
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

-- Löschen nur eigene Kommentare; Threads mit Antworten lehnt der Fremdschlüssel ab (on delete restrict).
create policy comments_delete on public.comments
  for delete to anon
  using (author_id = public.annotation_person_for(project_id));
