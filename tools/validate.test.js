import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  LOCKED_WORDS,
  VALIDATION_CODES,
  validateManifest,
} from "./validate.js";

function makeRecord(word) {
  return {
    word,
    mw_entry_id: `${word}:1`,
    mw_unit_id: "1",
    definition: {
      text: "A synthetic definition for the selected item.",
      part_of_speech: "noun",
      source: "mw-collegiate",
    },
    hints: {
      synonym: {
        text: "similar",
        source: "mw-thesaurus",
      },
      clue: {
        text: "A fabricated hint with indirect wording.",
        source: "llm-generated",
      },
    },
    pronunciation: {
      mw: "synthetic",
      audio_file: `${word}001`,
      audio_url: `https://media.example.test/audio/${word}001.mp3`,
    },
    example: null,
    explanation: {
      text: "A synthetic explanation.",
      provenance: "llm-generated",
    },
    image: {
      key: `paintings/${word}.webp`,
      origin: "2023-dalle2",
      provenance: "recovered",
      generation: null,
    },
  };
}

function makeManifest() {
  return {
    schema_version: 1,
    generated_at: "2026-01-02T03:04:05Z",
    word_count: 105,
    words: LOCKED_WORDS.map(makeRecord),
  };
}

function codes(result) {
  return result.errors.map(({ code }) => code);
}

test("schema artifact is valid JSON Schema describing v1 and 105 records", () => {
  const schema = JSON.parse(
    readFileSync(new URL("./schema/manifest.schema.json", import.meta.url), "utf8"),
  );

  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.properties.schema_version.const, 1);
  assert.equal(schema.properties.words.minItems, 105);
  assert.equal(schema.properties.words.maxItems, 105);
  assert.deepEqual(schema.$defs.example.properties.kind.enum, ["vis", "quote"]);
});

test("clean manifest passes with an attributed synthetic example", () => {
  const manifest = makeManifest();
  manifest.words[0].example = {
    text: "The acquaint appears in this synthetic sentence.",
    kind: "vis",
    form_matched: "acquaint",
    attribution: {
      author: null,
      source: "Synthetic Gazette",
      date: null,
    },
  };

  assert.deepEqual(validateManifest(manifest), {
    valid: true,
    errors: [],
    warnings: [],
  });
});

test("clean manifest passes when every example is null", () => {
  assert.deepEqual(validateManifest(makeManifest()), {
    valid: true,
    errors: [],
    warnings: [],
  });
});

test("example without author or source fails exactly EXAMPLE_MISSING_ATTRIBUTION", () => {
  const manifest = makeManifest();
  manifest.words[0].example = {
    text: "The acquaint appears in this synthetic sentence.",
    kind: "vis",
    form_matched: "acquaint",
    attribution: {
      author: null,
      source: null,
      date: null,
    },
  };

  const result = validateManifest(manifest);
  assert.equal(result.valid, false);
  assert.deepEqual(codes(result), [VALIDATION_CODES.EXAMPLE_MISSING_ATTRIBUTION]);
});

test("detects missing, unexpected, and duplicate words against the locked corpus", () => {
  const missing = makeManifest();
  const missingWord = missing.words.pop().word;
  const missingResult = validateManifest(missing);
  assert.ok(missingResult.errors.some(
    (error) => error.code === VALIDATION_CODES.CORPUS_MISSING_WORD
      && error.details.word === missingWord,
  ));

  const unexpected = makeManifest();
  unexpected.words.push(makeRecord("intruder"));
  const unexpectedResult = validateManifest(unexpected);
  assert.ok(unexpectedResult.errors.some(
    (error) => error.code === VALIDATION_CODES.CORPUS_UNEXPECTED_WORD
      && error.details.word === "intruder",
  ));

  const duplicate = makeManifest();
  duplicate.words[duplicate.words.length - 1] = makeRecord(LOCKED_WORDS[0]);
  const duplicateResult = validateManifest(duplicate);
  assert.ok(duplicateResult.errors.some(
    (error) => error.code === VALIDATION_CODES.CORPUS_DUPLICATE_WORD
      && error.details.word === LOCKED_WORDS[0],
  ));
  assert.ok(duplicateResult.errors.some(
    (error) => error.code === VALIDATION_CODES.CORPUS_MISSING_WORD,
  ));
});

test("word_count cannot conceal a corpus mismatch", () => {
  const manifest = makeManifest();
  manifest.words.pop();
  manifest.word_count = 105;

  const result = validateManifest(manifest);
  assert.ok(codes(result).includes(VALIDATION_CODES.CORPUS_MISSING_WORD));
});

test("clue containing the exact headword as a whole word fails", () => {
  const manifest = makeManifest();
  manifest.words[0].hints.clue.text = "You might acquaint two new colleagues.";

  const result = validateManifest(manifest);
  assert.ok(codes(result).includes(VALIDATION_CODES.CLUE_CONTAINS_HEADWORD));
});

test("five-character clue prefix produces only a warning", () => {
  const manifest = makeManifest();
  manifest.words[0].hints.clue.text = "Someone acquainted with an unusual custom.";

  const result = validateManifest(manifest);
  assert.equal(result.valid, true);
  assert.deepEqual(codes(result), []);
  assert.deepEqual(
    result.warnings.map(({ code }) => code),
    [VALIDATION_CODES.CLUE_SHARES_HEADWORD_PREFIX],
  );
});

test("unresolved MW markup in runtime display text fails", () => {
  const manifest = makeManifest();
  manifest.words[0].definition.text = "A definition with {it}markup{/it}.";

  const result = validateManifest(manifest);
  assert.ok(codes(result).includes(VALIDATION_CODES.MW_MARKUP_REMAINS));
});

test("missing part of speech fails NO_PART_OF_SPEECH", () => {
  const manifest = makeManifest();
  manifest.words[0].definition.part_of_speech = "";

  const result = validateManifest(manifest);
  assert.ok(codes(result).includes(VALIDATION_CODES.NO_PART_OF_SPEECH));
});

test("form_matched must occur as a case-insensitive whole word", () => {
  const manifest = makeManifest();
  manifest.words[0].example = {
    text: "This sentence contains a different form.",
    kind: "vis",
    form_matched: "acquaint",
    attribution: {
      author: "Synthetic Author",
      source: null,
      date: "2026",
    },
  };

  const result = validateManifest(manifest);
  assert.ok(codes(result).includes(VALIDATION_CODES.EXAMPLE_HEADWORD_MISMATCH));
});

test("form_matched comparison is case-insensitive and respects boundaries", () => {
  const manifest = makeManifest();
  manifest.words[0].example = {
    text: "They ACQUAINT new colleagues, but acquaintances is not the match used.",
    kind: "vis",
    form_matched: "acquaint",
    attribution: {
      author: "Synthetic Author",
      source: null,
      date: null,
    },
  };

  assert.equal(validateManifest(manifest).valid, true);
});

test("image key must remain an R2 object key rather than a full URL", () => {
  const manifest = makeManifest();
  manifest.words[0].image.key = "https://images.example.test/paintings/acquaint.webp";

  const result = validateManifest(manifest);
  assert.ok(codes(result).includes(VALIDATION_CODES.IMAGE_KEY_INVALID));
});

test("exports the complete validator and future pipeline code contract", () => {
  for (const code of [
    "NO_MW_ENTRY",
    "AMBIGUOUS_ENTRY",
    "NO_DEFINING_TEXT",
    "SENSE_IS_ARCHAIC",
    "EXAMPLE_HEADWORD_MISMATCH",
    "EXAMPLE_MISSING_ATTRIBUTION",
    "CLUE_CONTAINS_HEADWORD",
    "MW_MARKUP_REMAINS",
    "MISSING_AUDIO",
    "AUDIO_404",
    "NO_PART_OF_SPEECH",
  ]) {
    assert.equal(VALIDATION_CODES[code], code);
  }
});
