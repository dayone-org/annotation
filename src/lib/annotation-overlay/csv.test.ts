/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseStaffCsv, toCsv } from "./csv.ts";

test("semicolon file with BOM, CRLF, any header case, umlauts and quoted fields", () => {
  const text =
    '﻿EMAIL;First_Name;last_name\r\njürgen@dayone.de;Jürgen;"Groß; Jr."\r\n\r\n"a@dayone.de";"Ä ""B""";\r\n';
  assert.deepEqual(parseStaffCsv(text), {
    rows: [
      { email: "jürgen@dayone.de", first_name: "Jürgen", last_name: "Groß; Jr." },
      { email: "a@dayone.de", first_name: 'Ä "B"', last_name: "" },
    ],
  });
});

test("comma file, other column order, line break inside quotes, no last_name column", () => {
  const text = 'first_name,email\n"Ma\nrta", m@dayone.de \nBo,b@dayone.de';
  assert.deepEqual(parseStaffCsv(text), {
    rows: [
      { email: "m@dayone.de", first_name: "Ma\nrta", last_name: "" },
      { email: "b@dayone.de", first_name: "Bo", last_name: "" },
    ],
  });
});

test("missing column and more than 200 rows are refused", () => {
  assert.deepEqual(parseStaffCsv("mail,first_name\nx,y"), { error: "Missing column: email" });
  const rows = (n: number) => `email,first_name\n${"x@dayone.de,X\n".repeat(n)}`;
  const full = parseStaffCsv(rows(200));
  assert.ok("rows" in full && full.rows.length === 200);
  assert.deepEqual(parseStaffCsv(rows(201)), { error: "At most 200 rows per import." });
});

test("toCsv quotes only where needed and starts with a BOM", () => {
  assert.equal(
    toCsv([
      ["name", "email"],
      ['Ä, "B"', "a@dayone.de"],
    ]),
    '﻿name,email\r\n"Ä, ""B""",a@dayone.de\r\n',
  );
});
