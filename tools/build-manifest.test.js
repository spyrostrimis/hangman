import test from "node:test";
import assert from "node:assert/strict";

import { buildManifest } from "./build-manifest.js";

const GENERATED_AT = "2026-01-02T03:04:05.000Z";

function makeRecord(word) {
  return {
    word,
    mw_entry_id: `${word}:1`,
    mw_unit_id: "1",
    definition: {
      text: `Synthetic definition for ${word}.`,
      part_of_speech: "noun",
      source: "mw-collegiate",
    },
    pronunciation: {
      mw: "synthetic",
      audio_file: `${word}001`,
      audio_url: `https://media.example.test/${word}001.mp3`,
    },
    example: null,
  };
}

function makeInputs() {
  const lockedWords = ["alpha", "beta"];
  return {
    lockedWords,
    mwReport: {
      words: lockedWords.map((word) => ({
        word,
        status: "success",
        record: makeRecord(word),
        audio_verification: { ok: true, status: 200 },
        error: null,
        candidates: [],
      })),
    },
    enrichment: Object.fromEntries(lockedWords.map((word) => [
      word,
      {
        synonym: `${word} peer`,
        clue: `Synthetic clue for ${word}.`,
        explanation: `Synthetic explanation for ${word}.`,
      },
    ])),
    generatedAt: GENERATED_AT,
  };
}

function assertBaselinePasses(inputs) {
  assert.doesNotThrow(() => buildManifest(inputs));
}

test("assembles a valid manifest from synthetic inputs", () => {
  const manifest = buildManifest(makeInputs());

  assert.equal(manifest.schema_version, 1);
  assert.equal(manifest.generated_at, GENERATED_AT);
  assert.equal(manifest.word_count, 2);
  assert.equal(manifest.words.length, 2);
});

test("preserves locked-word order rather than report or enrichment order", () => {
  const inputs = makeInputs();
  inputs.mwReport.words.reverse();
  inputs.enrichment = Object.fromEntries(Object.entries(inputs.enrichment).reverse());

  assert.deepEqual(
    buildManifest(inputs).words.map(({ word }) => word),
    inputs.lockedWords,
  );
});

test("assigns provenance constants locally and rejects enrichment overrides", () => {
  const inputs = makeInputs();
  assertBaselinePasses(inputs);

  const record = buildManifest(inputs).words[0];
  assert.equal(record.hints.synonym.source, "llm-generated");
  assert.equal(record.hints.clue.source, "llm-generated");
  assert.equal(record.explanation.provenance, "llm-generated");

  inputs.enrichment.alpha.source = "untrusted";
  inputs.enrichment.alpha.provenance = "untrusted";
  assert.throws(() => buildManifest(inputs), /must contain exactly synonym, clue, explanation/);
});

test("rejects a missing enrichment word", () => {
  const inputs = makeInputs();
  assertBaselinePasses(inputs);

  delete inputs.enrichment.alpha;
  assert.throws(() => buildManifest(inputs), /missing enrichment word: alpha/);
});

test("rejects an unexpected enrichment word", () => {
  const inputs = makeInputs();
  assertBaselinePasses(inputs);

  inputs.enrichment.gamma = {
    synonym: "peer",
    clue: "Synthetic clue.",
    explanation: "Synthetic explanation.",
  };
  assert.throws(() => buildManifest(inputs), /unexpected enrichment word: gamma/);
});

test("rejects an empty enrichment value", () => {
  const inputs = makeInputs();
  assertBaselinePasses(inputs);

  inputs.enrichment.alpha.clue = "   ";
  assert.throws(() => buildManifest(inputs), /alpha\.clue must be a non-empty string/);
});

test("rejects a failed MW result", () => {
  const inputs = makeInputs();
  assertBaselinePasses(inputs);

  inputs.mwReport.words[0].status = "failed";
  assert.throws(() => buildManifest(inputs), /has status "failed"/);
});

test("rejects a missing MW record", () => {
  const inputs = makeInputs();
  assertBaselinePasses(inputs);

  inputs.mwReport.words[0].record = null;
  assert.throws(() => buildManifest(inputs), /has no record/);
});

test("rejects a duplicate MW word", () => {
  const inputs = makeInputs();
  assertBaselinePasses(inputs);

  inputs.mwReport.words[1].word = "alpha";
  inputs.mwReport.words[1].record.word = "alpha";
  assert.throws(() => buildManifest(inputs), /duplicate MW word: alpha/);
});

test("rejects an unexpected MW word", () => {
  const inputs = makeInputs();
  assertBaselinePasses(inputs);

  inputs.mwReport.words[1].word = "gamma";
  inputs.mwReport.words[1].record.word = "gamma";
  assert.throws(() => buildManifest(inputs), /unexpected MW word: gamma/);
});

test("rejects an MW record whose word differs from its result", () => {
  const inputs = makeInputs();
  assertBaselinePasses(inputs);

  inputs.mwReport.words[0].record.word = "beta";
  assert.throws(() => buildManifest(inputs), /MW record word mismatch for alpha/);
});

test("does not leak report-only fields into runtime records", () => {
  const inputs = makeInputs();
  const reportResult = inputs.mwReport.words[0];
  const record = buildManifest(inputs).words[0];

  for (const field of ["status", "audio_verification", "error", "candidates"]) {
    assert.equal(Object.hasOwn(reportResult, field), true);
    assert.equal(Object.hasOwn(record, field), false);
  }
});

test("maps image metadata deterministically from each locked word", () => {
  const manifest = buildManifest(makeInputs());

  assert.deepEqual(manifest.words.map(({ image }) => image), [
    {
      key: "paintings/alpha.webp",
      origin: "2023-dalle2",
      provenance: "recovered",
      generation: null,
    },
    {
      key: "paintings/beta.webp",
      origin: "2023-dalle2",
      provenance: "recovered",
      generation: null,
    },
  ]);
});
