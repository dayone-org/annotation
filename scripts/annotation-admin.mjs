#!/usr/bin/env node
// Projekte und Mitarbeitende pflegen (Service Role). Links mit Schlüssel werden genau einmal ausgegeben.
//
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/annotation-admin.mjs <befehl> …
//
//   projekt      --id wika --name "WIKA Relaunch" --domain wika.de --domain localhost:3000
//                (legt an oder ersetzt Name und Domains; Domain = Host inkl. Port)
//   projekt-link --id wika --url https://wika.de   (Link für Gäste; alter Link und alle Gäste darüber gesperrt)
//   mitarbeiter  --email a@dayone.de --vorname Anna [--nachname Muster] --url https://wika.de
//   neuer-schluessel --person <id> --url https://wika.de   (Mitarbeitende; alter Schlüssel sofort ungültig)
//   entziehen        --person <id>                         (Mitarbeitende; Schlüssel löschen)
import { createClient } from "@supabase/supabase-js";
import { parseArgs } from "node:util";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    email: { type: "string" },
    vorname: { type: "string" },
    nachname: { type: "string" },
    id: { type: "string" },
    name: { type: "string" },
    domain: { type: "string", multiple: true },
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
    if (!String(values[name] ?? "").trim()) fail(`--${name} fehlt.`);
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
  case "projekt": {
    need("id", "name", "domain");
    await rpc("annotation_set_project", {
      p_id: values.id,
      p_name: values.name,
      p_domains: values.domain,
    });
    console.log(`Projekt ${values.id}: ${values.domain.join(", ")}`);
    break;
  }
  case "projekt-link": {
    need("id", "url");
    console.log(link(await rpc("annotation_new_project_key", { p_project_id: values.id })));
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
    fail(
      "Befehl: projekt | projekt-link | mitarbeiter | neuer-schluessel | entziehen (Details im Dateikopf).",
    );
}
