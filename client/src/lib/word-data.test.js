import test from "node:test";
import assert from "node:assert/strict";

import {
  PRODUCTION_ASSET_BASE_URL,
  buildAssetUrl,
  selectRandomWord,
} from "./word-data.js";

test("selectRandomWord returns a record supplied by the caller", () => {
  const records = [{ word: "first" }, { word: "middle" }, { word: "last" }];

  const selected = selectRandomWord(records, () => 0.5);

  assert.equal(selected, records[1]);
  assert.ok(records.includes(selected));
});

test("selectRandomWord reaches the first and last index boundaries", () => {
  const records = [{ word: "first" }, { word: "middle" }, { word: "last" }];

  assert.equal(selectRandomWord(records, () => 0), records[0]);
  assert.equal(selectRandomWord(records, () => 0.999999), records[2]);
});

test("selectRandomWord rejects invalid word collections", () => {
  const validRecords = [{ word: "only" }];
  assert.equal(selectRandomWord(validRecords, () => 0), validRecords[0]);

  assert.throws(
    () => selectRandomWord([], () => 0),
    /words must be a non-empty array/
  );
  assert.throws(
    () => selectRandomWord(null, () => 0),
    /words must be a non-empty array/
  );
});

test("buildAssetUrl creates the exact production asset URL", () => {
  assert.equal(
    buildAssetUrl("paintings/melancholy.webp"),
    `${PRODUCTION_ASSET_BASE_URL}/paintings/melancholy.webp`
  );
});

test("buildAssetUrl normalizes an overridden base URL and object key", () => {
  assert.equal(
    buildAssetUrl("/paintings/melancholy.webp", "https://assets.example.test/"),
    "https://assets.example.test/paintings/melancholy.webp"
  );
});
