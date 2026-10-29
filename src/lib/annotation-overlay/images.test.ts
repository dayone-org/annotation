/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { fitWithin, imageUrl } from "./images.ts";

test("longest side shrinks to 1600 px, keeping the aspect ratio", () => {
  assert.deepEqual(fitWithin(4000, 3000), { width: 1600, height: 1200 });
  assert.deepEqual(fitWithin(1000, 5000), { width: 320, height: 1600 });
});

test("smaller images are not scaled up", () => {
  assert.deepEqual(fitWithin(1599, 20), { width: 1599, height: 20 });
  assert.deepEqual(fitWithin(320, 200), { width: 320, height: 200 });
});

test("a very thin image keeps at least one pixel", () => {
  assert.deepEqual(fitWithin(10000, 1), { width: 1600, height: 1 });
});

test("public address of a stored file", () => {
  assert.equal(
    imageUrl("http://127.0.0.1:54321/", "p/a/b.webp"),
    "http://127.0.0.1:54321/storage/v1/object/public/comment-images/p/a/b.webp",
  );
});
