/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { projectIdFromName } from "./project-id.ts";

test("lowercase, umlauts spelled out, other characters become one hyphen", () => {
  assert.equal(projectIdFromName("WIKA Relaunch 2026"), "wika-relaunch-2026");
  assert.equal(projectIdFromName("Müller & Söhne"), "mueller-soehne");
  assert.equal(projectIdFromName("  ÄÖÜ-Straße!  "), "aeoeue-strasse");
});

test("long names are cut to 63 characters without a trailing hyphen", () => {
  assert.equal(projectIdFromName(`${"a".repeat(62)} b`), "a".repeat(62));
  assert.equal(projectIdFromName("x".repeat(100)), "x".repeat(63));
});

test("names without two usable characters give no ID", () => {
  assert.equal(projectIdFromName("&%$ !"), null);
  assert.equal(projectIdFromName("é"), null);
  assert.equal(projectIdFromName("A"), null);
  assert.equal(projectIdFromName(""), null);
});
