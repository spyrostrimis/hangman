import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { MW_MARKUP_REMAINS } from "./lib/mw-render.js";

export const VALIDATION_CODES = Object.freeze({
  NO_MW_ENTRY: "NO_MW_ENTRY",
  AMBIGUOUS_ENTRY: "AMBIGUOUS_ENTRY",
  NO_DEFINING_TEXT: "NO_DEFINING_TEXT",
  SENSE_IS_ARCHAIC: "SENSE_IS_ARCHAIC",
  EXAMPLE_HEADWORD_MISMATCH: "EXAMPLE_HEADWORD_MISMATCH",
  EXAMPLE_MISSING_ATTRIBUTION: "EXAMPLE_MISSING_ATTRIBUTION",
  CLUE_CONTAINS_HEADWORD: "CLUE_CONTAINS_HEADWORD",
  MW_MARKUP_REMAINS: "MW_MARKUP_REMAINS",
  MISSING_AUDIO: "MISSING_AUDIO",
  AUDIO_404: "AUDIO_404",
  NO_PART_OF_SPEECH: "NO_PART_OF_SPEECH",
  CORPUS_MISSING_WORD: "CORPUS_MISSING_WORD",
  CORPUS_UNEXPECTED_WORD: "CORPUS_UNEXPECTED_WORD",
  CORPUS_DUPLICATE_WORD: "CORPUS_DUPLICATE_WORD",
  WORD_COUNT_MISMATCH: "WORD_COUNT_MISMATCH",
  SCHEMA_INVALID: "SCHEMA_INVALID",
  IMAGE_KEY_INVALID: "IMAGE_KEY_INVALID",
  CLUE_SHARES_HEADWORD_PREFIX: "CLUE_SHARES_HEADWORD_PREFIX",
});

export const LOCKED_WORDS = Object.freeze(
  JSON.parse(readFileSync(new URL("./words.locked.json", import.meta.url), "utf8")),
);

function assertLockedCorpus(words) {
  const sorted = [...words].sort();
  if (
    !Array.isArray(words)
    || words.length !== 105
    || new Set(words).size !== words.length
    || words.some((word) => typeof word !== "string" || word !== word.toLowerCase())
    || words.some((word, index) => word !== sorted[index])
  ) {
    throw new Error("tools/words.locked.json is not the canonical sorted 105-word corpus");
  }
}

assertLockedCorpus(LOCKED_WORDS);

function addIssue(collection, code, path, message, details) {
  collection.push({ code, path, message, ...(details === undefined ? {} : { details }) });
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function checkObjectShape(value, path, required, allowed, errors) {
  if (!isObject(value)) {
    addIssue(errors, VALIDATION_CODES.SCHEMA_INVALID, path, "Expected an object");
    return false;
  }

  for (const key of required) {
    if (!Object.hasOwn(value, key)) {
      addIssue(
        errors,
        VALIDATION_CODES.SCHEMA_INVALID,
        `${path}.${key}`,
        "Required property is missing",
      );
    }
  }

  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      addIssue(
        errors,
        VALIDATION_CODES.SCHEMA_INVALID,
        `${path}.${key}`,
        "Unexpected property",
      );
    }
  }

  return true;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function requireString(value, path, errors, { nullable = false } = {}) {
  if (nullable && value === null) {
    return true;
  }
  if (!isNonEmptyString(value)) {
    addIssue(errors, VALIDATION_CODES.SCHEMA_INVALID, path, "Expected a non-empty string");
    return false;
  }
  return true;
}

function requireConstant(value, expected, path, errors) {
  if (value !== expected) {
    addIssue(
      errors,
      VALIDATION_CODES.SCHEMA_INVALID,
      path,
      `Expected ${JSON.stringify(expected)}`,
    );
    return false;
  }
  return true;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsWholeWord(text, word) {
  if (!isNonEmptyString(text) || !isNonEmptyString(word)) {
    return false;
  }
  const escaped = escapeRegExp(word);
  return new RegExp(`(?<![A-Za-z0-9_])${escaped}(?![A-Za-z0-9_])`, "i").test(text);
}

function checkMarkup(value, path, errors) {
  if (typeof value === "string" && MW_MARKUP_REMAINS.test(value)) {
    addIssue(
      errors,
      VALIDATION_CODES.MW_MARKUP_REMAINS,
      path,
      "Unresolved Merriam-Webster display markup remains",
    );
  }
}

function validateDefinition(definition, path, errors) {
  if (!checkObjectShape(
    definition,
    path,
    ["text", "part_of_speech", "source"],
    ["text", "part_of_speech", "source"],
    errors,
  )) {
    return;
  }

  if (!isNonEmptyString(definition.text)) {
    addIssue(
      errors,
      VALIDATION_CODES.NO_DEFINING_TEXT,
      `${path}.text`,
      "Definition text is required",
    );
  }
  if (!isNonEmptyString(definition.part_of_speech)) {
    addIssue(
      errors,
      VALIDATION_CODES.NO_PART_OF_SPEECH,
      `${path}.part_of_speech`,
      "Part of speech is required",
    );
  }
  requireConstant(definition.source, "mw-collegiate", `${path}.source`, errors);
  checkMarkup(definition.text, `${path}.text`, errors);
}

function validateHint(hint, path, expectedSource, errors) {
  if (!checkObjectShape(hint, path, ["text", "source"], ["text", "source"], errors)) {
    return;
  }
  requireString(hint.text, `${path}.text`, errors);
  requireConstant(hint.source, expectedSource, `${path}.source`, errors);
}

function validateHints(hints, word, path, errors, warnings) {
  if (!checkObjectShape(hints, path, ["synonym", "clue"], ["synonym", "clue"], errors)) {
    return;
  }

  validateHint(hints.synonym, `${path}.synonym`, "mw-thesaurus", errors);
  validateHint(hints.clue, `${path}.clue`, "llm-generated", errors);
  checkMarkup(hints.synonym?.text, `${path}.synonym.text`, errors);

  const clue = hints.clue?.text;
  if (!isNonEmptyString(clue) || !isNonEmptyString(word)) {
    return;
  }

  if (containsWholeWord(clue, word)) {
    addIssue(
      errors,
      VALIDATION_CODES.CLUE_CONTAINS_HEADWORD,
      `${path}.clue.text`,
      "Clue contains the exact headword as a whole word",
    );
  }

  if (word.length >= 5) {
    const headword = word.toLowerCase();
    const prefix = headword.slice(0, 5);
    const matchingToken = clue.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)?.find((token) => {
      const normalized = token.toLowerCase();
      return normalized !== headword && normalized.length >= 5 && normalized.startsWith(prefix);
    });

    if (matchingToken) {
      addIssue(
        warnings,
        VALIDATION_CODES.CLUE_SHARES_HEADWORD_PREFIX,
        `${path}.clue.text`,
        "Clue token shares the headword's first five characters",
        { token: matchingToken, prefix },
      );
    }
  }
}

function validatePronunciation(pronunciation, path, errors) {
  if (!checkObjectShape(
    pronunciation,
    path,
    ["mw", "audio_file", "audio_url"],
    ["mw", "audio_file", "audio_url"],
    errors,
  )) {
    return;
  }

  requireString(pronunciation.mw, `${path}.mw`, errors);
  checkMarkup(pronunciation.mw, `${path}.mw`, errors);
  if (!isNonEmptyString(pronunciation.audio_file)) {
    addIssue(
      errors,
      VALIDATION_CODES.MISSING_AUDIO,
      `${path}.audio_file`,
      "First Merriam-Webster pronunciation must provide usable audio",
    );
  }
  if (
    !isNonEmptyString(pronunciation.audio_url)
    || !/^https:\/\/\S+$/i.test(pronunciation.audio_url)
  ) {
    addIssue(
      errors,
      VALIDATION_CODES.SCHEMA_INVALID,
      `${path}.audio_url`,
      "Expected an HTTPS audio URL",
    );
  }
}

function validateAttribution(attribution, path, errors) {
  if (!checkObjectShape(
    attribution,
    path,
    ["author", "source", "date"],
    ["author", "source", "date"],
    errors,
  )) {
    return false;
  }

  requireString(attribution.author, `${path}.author`, errors, { nullable: true });
  requireString(attribution.source, `${path}.source`, errors, { nullable: true });
  requireString(attribution.date, `${path}.date`, errors, { nullable: true });

  const hasAuthor = isNonEmptyString(attribution.author);
  const hasSource = isNonEmptyString(attribution.source);
  if (!hasAuthor && !hasSource) {
    addIssue(
      errors,
      VALIDATION_CODES.EXAMPLE_MISSING_ATTRIBUTION,
      path,
      "Example requires a non-empty author or source",
    );
  }

  checkMarkup(attribution.author, `${path}.author`, errors);
  checkMarkup(attribution.source, `${path}.source`, errors);
  checkMarkup(attribution.date, `${path}.date`, errors);
  return true;
}

function validateExample(example, path, errors) {
  if (example === null) {
    return;
  }
  if (!checkObjectShape(
    example,
    path,
    ["text", "kind", "form_matched", "attribution"],
    ["text", "kind", "form_matched", "attribution"],
    errors,
  )) {
    return;
  }

  requireString(example.text, `${path}.text`, errors);
  requireString(example.form_matched, `${path}.form_matched`, errors);
  if (example.kind !== "vis") {
    addIssue(
      errors,
      VALIDATION_CODES.SCHEMA_INVALID,
      `${path}.kind`,
      "Expected example kind to be vis",
    );
  }
  validateAttribution(example.attribution, `${path}.attribution`, errors);
  checkMarkup(example.text, `${path}.text`, errors);

  if (
    isNonEmptyString(example.text)
    && isNonEmptyString(example.form_matched)
    && !containsWholeWord(example.text, example.form_matched)
  ) {
    addIssue(
      errors,
      VALIDATION_CODES.EXAMPLE_HEADWORD_MISMATCH,
      `${path}.form_matched`,
      "form_matched does not occur as a whole word in example.text",
    );
  }
}

function validateExplanation(explanation, path, errors) {
  if (!checkObjectShape(
    explanation,
    path,
    ["text", "provenance"],
    ["text", "provenance"],
    errors,
  )) {
    return;
  }
  requireString(explanation.text, `${path}.text`, errors);
  requireConstant(explanation.provenance, "llm-generated", `${path}.provenance`, errors);
}

function validateImage(image, path, errors) {
  if (!checkObjectShape(
    image,
    path,
    ["key", "origin", "provenance", "generation"],
    ["key", "origin", "provenance", "generation"],
    errors,
  )) {
    return;
  }

  if (!isNonEmptyString(image.key) || /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(image.key)) {
    addIssue(
      errors,
      VALIDATION_CODES.IMAGE_KEY_INVALID,
      `${path}.key`,
      "Image key must be a non-empty R2 object key, not a URL",
    );
  }
  requireConstant(image.origin, "2023-dalle2", `${path}.origin`, errors);
  requireConstant(image.provenance, "recovered", `${path}.provenance`, errors);
  requireConstant(image.generation, null, `${path}.generation`, errors);
}

function validateWordRecord(record, index, errors, warnings) {
  const path = `$.words[${index}]`;
  const fields = [
    "word",
    "mw_entry_id",
    "mw_unit_id",
    "definition",
    "hints",
    "pronunciation",
    "example",
    "explanation",
    "image",
  ];
  if (!checkObjectShape(record, path, fields, fields, errors)) {
    return;
  }

  if (typeof record.word !== "string" || !/^[a-z]+$/.test(record.word)) {
    addIssue(
      errors,
      VALIDATION_CODES.SCHEMA_INVALID,
      `${path}.word`,
      "Word must contain lowercase ASCII letters only",
    );
  }
  if (!isNonEmptyString(record.mw_entry_id)) {
    addIssue(errors, VALIDATION_CODES.NO_MW_ENTRY, `${path}.mw_entry_id`, "MW entry id is required");
  }
  requireString(record.mw_unit_id, `${path}.mw_unit_id`, errors);
  validateDefinition(record.definition, `${path}.definition`, errors);
  validateHints(record.hints, record.word, `${path}.hints`, errors, warnings);
  validatePronunciation(record.pronunciation, `${path}.pronunciation`, errors);
  validateExample(record.example, `${path}.example`, errors);
  validateExplanation(record.explanation, `${path}.explanation`, errors);
  validateImage(record.image, `${path}.image`, errors);
}

function validateCorpus(words, lockedWords, errors) {
  const lockedSet = new Set(lockedWords);
  const counts = new Map();

  for (const record of words) {
    if (isObject(record) && typeof record.word === "string") {
      counts.set(record.word, (counts.get(record.word) ?? 0) + 1);
    }
  }

  for (const word of lockedWords) {
    if (!counts.has(word)) {
      addIssue(
        errors,
        VALIDATION_CODES.CORPUS_MISSING_WORD,
        "$.words",
        `Locked word is missing: ${word}`,
        { word },
      );
    }
  }
  for (const [word, count] of counts) {
    if (!lockedSet.has(word)) {
      addIssue(
        errors,
        VALIDATION_CODES.CORPUS_UNEXPECTED_WORD,
        "$.words",
        `Unexpected word: ${word}`,
        { word },
      );
    }
    if (count > 1) {
      addIssue(
        errors,
        VALIDATION_CODES.CORPUS_DUPLICATE_WORD,
        "$.words",
        `Duplicate word: ${word}`,
        { word, count },
      );
    }
  }
}

export function validateManifest(manifest, { lockedWords = LOCKED_WORDS } = {}) {
  const errors = [];
  const warnings = [];
  const fields = ["schema_version", "generated_at", "word_count", "words"];

  if (!checkObjectShape(manifest, "$", fields, fields, errors)) {
    return { valid: false, errors, warnings };
  }

  requireConstant(manifest.schema_version, 1, "$.schema_version", errors);
  if (
    typeof manifest.generated_at !== "string"
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(manifest.generated_at)
    || Number.isNaN(Date.parse(manifest.generated_at))
  ) {
    addIssue(
      errors,
      VALIDATION_CODES.SCHEMA_INVALID,
      "$.generated_at",
      "generated_at must be an RFC 3339 date-time string",
    );
  }
  if (manifest.word_count !== lockedWords.length) {
    addIssue(
      errors,
      VALIDATION_CODES.WORD_COUNT_MISMATCH,
      "$.word_count",
      "Informational word_count does not match the locked corpus length",
      { expected: lockedWords.length, actual: manifest.word_count },
    );
  }
  if (!Array.isArray(manifest.words)) {
    addIssue(errors, VALIDATION_CODES.SCHEMA_INVALID, "$.words", "Expected an array");
    return { valid: false, errors, warnings };
  }

  manifest.words.forEach((record, index) => validateWordRecord(record, index, errors, warnings));
  validateCorpus(manifest.words, lockedWords, errors);

  return { valid: errors.length === 0, errors, warnings };
}

function runCli() {
  const manifestPath = process.argv[2];
  if (!manifestPath) {
    console.error("Usage: node validate.js <manifest.json>");
    process.exitCode = 2;
    return;
  }

  try {
    const manifest = JSON.parse(readFileSync(resolve(manifestPath), "utf8"));
    const result = validateManifest(manifest);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.valid ? 0 : 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runCli();
}
