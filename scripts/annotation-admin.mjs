#!/usr/bin/env node
// Personen anlegen und Schlüssel verwalten (Service Role). Der Link mit Schlüssel wird genau einmal ausgegeben.
//
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/annotation-admin.mjs <befehl> …
//
//   mitarbeiter --email a@dayone.de --vorname Anna [--nachname Muster] --url https://seite.de
//   extern      --projekt wika --name "Simon Scholz" --url https://seite.de
//   neuer-schluessel --person <id> --url https://seite.de   (alter Schlüssel ist sofort ungültig)
//   entziehen        --person <id>                          (Schlüssel löschen)
import { createClient } from "@supabase/supabase-js";
import { parseArgs } from "node:util";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    email: { type: "string" },
    vorname: { type: "string" },
    nachname: { type: "string" },
    projekt: { type: "string" },
    name: { type: "string" },
    person: { type: "string" },
    url: { type: "string" },
  },
});

const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: serviceKey } = process.env;
if (!url || !serviceKey) {
  fail("SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY setzen.");
}

const client = createClient(url, serviceKey, { auth: { persistSession: false } });

function fail(message) {
  console.error(message);
  process.exit(1);
}

function need(...names) {
  for (const name of names) {
    if (!values[name]?.trim()) fail(`--${name} fehlt.`);
  }
}

async function rpc(fn, args) {
  const { data, error } = await client.rpc(fn, args);
  if (error) fail(`${fn}: ${error.message}`);
  return data;
}

function link(key) {
  const target = new URL(values.url);
  target.hash = `key=${key}`;
  return target.toString();
}

switch (positionals[0]) {
  case "mitarbeiter": {
    need("email", "vorname", "url");
    const [row] = await rpc("annotation_add_staff", {
      p_email: values.email,
      p_first_name: values.vorname,
      p_last_name: values.nachname ?? null,
    });
    console.log(`Person ${row.person_id}\n${link(row.key)}`);
    break;
  }
  case "extern": {
    need("projekt", "name", "url");
    const [row] = await rpc("annotation_add_guest", {
      p_project_id: values.projekt,
      p_display_name: values.name,
    });
    console.log(`Person ${row.person_id}\n${link(row.key)}`);
    break;
  }
  case "neuer-schluessel": {
    need("person", "url");
    console.log(link(await rpc("annotation_new_key", { p_person_id: values.person })));
    break;
  }
  case "entziehen": {
    need("person");
    await rpc("annotation_revoke_key", { p_person_id: values.person });
    console.log(`Schlüssel von ${values.person} gelöscht.`);
    break;
  }
  default:
    fail("Befehl: mitarbeiter | extern | neuer-schluessel | entziehen (Details im Dateikopf).");
}
