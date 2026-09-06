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
        source: "llm-generated",
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
  assert.equal(schema.$defs.example.properties.kind.const, "vis");
  assert.equal(schema.$defs.synonymHint.properties.source.const, "llm-generated");
  assert.equal(schema.$defs.clueHint.properties.source.const, "llm-generated");
  assert.deepEqual(schema.$defs.nullableString.oneOf, [
    { type: "null" },
    { $ref: "#/$defs/nonEmptyString" },
  ]);
});

test("schema nullable attribution strings exclude empty and whitespace-only strings", () => {
  const schema = JSON.parse(
    readFileSync(new URL("./schema/manifest.schema.json", import.meta.url), "utf8"),
  );
  const nullable = schema.$defs.nullableString;
  const nonEmpty = schema.$defs.nonEmptyString;

  assert.deepEqual(nullable.oneOf, [
    { type: "null" },
    { $ref: "#/$defs/nonEmptyString" },
  ]);
  assert.equal(new RegExp(nonEmpty.pattern).test("Synthetic Author"), true);
  assert.equal(new RegExp(nonEmpty.pattern).test(""), false);
  assert.equal(new RegExp(nonEmpty.pattern).test("   "), false);
  for (const field of ["author", "source", "date"]) {
    assert.equal(
      schema.$defs.attribution.properties[field].$ref,
      "#/$defs/nullableString",
    );
  }
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

test("v1 rejects quote examples instead of treating them as unit-level vis", () => {
  const manifest = makeManifest();
  manifest.words[0].example = {
    text: "The acquaint appears in this synthetic quotation.",
    kind: "quote",
    form_matched: "acquaint",
    attribution: {
      author: "Synthetic Author",
      source: null,
      date: null,
    },
  };

  const result = validateManifest(manifest);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(
    (error) => error.code === VALIDATION_CODES.SCHEMA_INVALID
      && error.path === "$.words[0].example.kind",
  ));
});

test("clean manifest passes when every example is null", () => {
  assert.deepEqual(validateManifest(makeManifest()), {
    valid: true,
    errors: [],
    warnings: [],
  });
});

test("synonym and clue provenance is LLM-generated only", () => {
  const oldThesaurus = makeManifest();
  oldThesaurus.words[0].hints.synonym.source = "mw-thesaurus";
  const oldThesaurusResult = validateManifest(oldThesaurus);
  assert.equal(oldThesaurusResult.valid, false);
  assert.ok(oldThesaurusResult.errors.some(
    (error) => error.code === VALIDATION_CODES.SCHEMA_INVALID
      && error.path === "$.words[0].hints.synonym.source",
  ));

  const wrongClueSource = makeManifest();
  wrongClueSource.words[0].hints.clue.source = "mw-collegiate";
  const wrongClueResult = validateManifest(wrongClueSource);
  assert.equal(wrongClueResult.valid, false);
  assert.ok(wrongClueResult.errors.some(
    (error) => error.code === VALIDATION_CODES.SCHEMA_INVALID
      && error.path === "$.words[0].hints.clue.source",
  ));
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

test("synonym equal to the NFKC-normalized headword fails", () => {
  const manifest = makeManifest();
  assert.equal(validateManifest(manifest).valid, true);

  manifest.words[0].hints.synonym.text = "ＡＣＱＵＡＩＮＴ";

  const result = validateManifest(manifest);
  assert.equal(result.valid, false);
  assert.deepEqual(codes(result), [VALIDATION_CODES.SYNONYM_EQUALS_HEADWORD]);
});

test("synonym containing the complete headword substring fails", async (t) => {
  const cases = {
    student: "students",
    contest: "contestant",
    playful: "playfully",
    legend: "legendary",
  };

  for (const [word, synonym] of Object.entries(cases)) {
    await t.test(`${word} -> ${synonym}`, () => {
      const manifest = makeManifest();
      assert.equal(validateManifest(manifest).valid, true);

      const record = manifest.words.find((candidate) => candidate.word === word);
      record.hints.synonym.text = synonym;

      const result = validateManifest(manifest);
      assert.equal(result.valid, false);
      assert.ok(codes(result).includes(VALIDATION_CODES.SYNONYM_CONTAINS_HEADWORD));
      assert.ok(!codes(result).includes(VALIDATION_CODES.SYNONYM_EQUALS_HEADWORD));
    });
  }
});

test("synonym spelling disclosure fails", () => {
  const manifest = makeManifest();
  assert.equal(validateManifest(manifest).valid, true);

  manifest.words[0].hints.synonym.text = "Starts with A";

  const result = validateManifest(manifest);
  assert.equal(result.valid, false);
  assert.ok(codes(result).includes(VALIDATION_CODES.SYNONYM_REVEALS_SPELLING));
});

test("clue containing the NFKC-normalized headword substring fails", () => {
  const manifest = makeManifest();
  assert.equal(validateManifest(manifest).valid, true);

  manifest.words[0].hints.clue.text = "This person became ＡＣＱＵＡＩＮＴＥＤ with the process.";

  const result = validateManifest(manifest);
  assert.equal(result.valid, false);
  assert.ok(codes(result).includes(VALIDATION_CODES.CLUE_CONTAINS_HEADWORD));
});

test("clue spelling-disclosure patterns fail", async (t) => {
  const numberWords = [
    "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
    "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen",
    "eighteen", "nineteen", "twenty",
  ];
  const patterns = [
    "This starts with A.",
    "This BEGINS WITH A.",
    "This ends with T.",
    "Its first letter is A.",
    "Its last letter is T.",
    "It is spelled using a hidden sequence.",
    "Its spelling is the main hint.",
    "It has 8 letters.",
    ...numberWords.map((number) => `It has ${number} letters.`),
    "It has eight syllables.",
    "It has 12 syllables.",
  ];

  for (const clue of patterns) {
    await t.test(clue, () => {
      const manifest = makeManifest();
      assert.equal(validateManifest(manifest).valid, true);

      manifest.words[0].hints.clue.text = clue;

      const result = validateManifest(manifest);
      assert.equal(result.valid, false);
      assert.ok(codes(result).includes(VALIDATION_CODES.CLUE_REVEALS_SPELLING));
    });
  }
});

test("a nineteen-word clue remains valid", () => {
  const manifest = makeManifest();
  manifest.words[0].hints.clue.text =
    "A deliberately extended synthetic hint can remain valid even when an editor chooses to use nineteen ordinary descriptive words.";

  assert.equal(validateManifest(manifest).valid, true);
});

test("five-character clue prefix produces only a warning", () => {
  const manifest = makeManifest();
  manifest.words[1].hints.clue.text = "Someone actively involved in an unusual custom.";

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
    "SYNONYM_EQUALS_HEADWORD",
    "SYNONYM_CONTAINS_HEADWORD",
    "SYNONYM_REVEALS_SPELLING",
    "CLUE_CONTAINS_HEADWORD",
    "CLUE_REVEALS_SPELLING",
    "MW_MARKUP_REMAINS",
    "MISSING_AUDIO",
    "AUDIO_404",
    "NO_PART_OF_SPEECH",
  ]) {
    assert.equal(VALIDATION_CODES[code], code);
  }
});
