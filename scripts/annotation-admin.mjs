#!/usr/bin/env node
// Manage projects and staff (service role). Links with a key are printed exactly once.
//
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/annotation-admin.mjs <command> …
//
//   project      --id wika --name "WIKA relaunch" --domain wika.de --domain localhost:3000
//                (creates the project or replaces name and domains; domain = host incl. port)
//   project-link --id wika --url https://wika.de   (guest link; the old link and its guests stop working)
//   staff        --email a@dayone.de --first-name Anna [--last-name Muster] --url https://wika.de
//   new-key      --person <id> --url https://wika.de   (staff; the old key stops working)
//   revoke       --person <id>                         (staff; deletes the key)
import { createClient } from "@supabase/supabase-js";
import { parseArgs } from "node:util";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    email: { type: "string" },
    "first-name": { type: "string" },
    "last-name": { type: "string" },
    id: { type: "string" },
    name: { type: "string" },
    domain: { type: "string", multiple: true },
    person: { type: "string" },
    url: { type: "string" },
  },
});

function fail(message) {
  console.error(message);
  process.exit(1);
}

const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: serviceKey } = process.env;
if (!url || !serviceKey) {
  fail("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
}

function need(...names) {
  for (const name of names) {
    if (!String(values[name] ?? "").trim()) fail(`--${name} is missing.`);
  }
}

// Parse --url before any database call, so a typo cannot lose a key that is shown only once.
let baseUrl = null;
if (values.url !== undefined) {
  try {
    baseUrl = new URL(values.url);
  } catch {
    fail(`--url is not a valid URL: ${values.url}`);
  }
}

const client = createClient(url, serviceKey, { auth: { persistSession: false } });

async function rpc(fn, args) {
  const { data, error } = await client.rpc(fn, args);
  // 23505/23514 carry a readable message from the database (domain taken, e-mail, name).
  if (error)
    fail(["23505", "23514"].includes(error.code) ? error.message : `${fn}: ${error.message}`);
  return data;
}

function link(key) {
  const target = new URL(baseUrl);
  target.hash = `key=${key}`;
  return target.toString();
}

switch (positionals[0]) {
  case "project": {
    need("id", "name", "domain");
    await rpc("annotation_set_project", {
      p_id: values.id,
      p_name: values.name,
      p_domains: values.domain,
    });
    console.log(`Project ${values.id}: ${values.domain.join(", ")}`);
    break;
  }
  case "project-link": {
    need("id", "url");
    console.log(link(await rpc("annotation_new_project_key", { p_project_id: values.id })));
    break;
  }
  case "staff": {
    need("email", "first-name", "url");
    const [row] = await rpc("annotation_add_staff", {
      p_email: values.email,
      p_first_name: values["first-name"],
      p_last_name: values["last-name"] ?? null,
    });
    console.log(`Person ${row.person_id}\n${link(row.key)}`);
    break;
  }
  case "new-key": {
    need("person", "url");
    console.log(link(await rpc("annotation_new_key", { p_person_id: values.person })));
    break;
  }
  case "revoke": {
    need("person");
    await rpc("annotation_revoke_key", { p_person_id: values.person });
    console.log(`Key of ${values.person} deleted.`);
    break;
  }
  default:
    fail("Command: project | project-link | staff | new-key | revoke (see the file header).");
}
