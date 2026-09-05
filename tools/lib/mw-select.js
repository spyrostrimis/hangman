import { extractFirstPronunciation } from "./mw-audio.js";
import { PIPELINE_CODES, pipelineError } from "./mw-errors.js";
import { MW_MARKUP_REMAINS, renderMwMarkup } from "./mw-render.js";
import { walkMwEntry } from "./mw-walk.js";

function nonEmpty(value) {
  return typeof value === "string" && value.trim() !== "";
}

function normalized(value) {
  return value.toLowerCase();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findWholeWord(text, form) {
  if (!nonEmpty(text) || !nonEmpty(form)) {
    return null;
  }
  const pattern = new RegExp(
    `(?<![A-Za-z0-9_])${escapeRegExp(form)}(?![A-Za-z0-9_])`,
    "i",
  );
  return text.match(pattern)?.[0] ?? null;
}

function renderDisplay(value, field) {
  const rendered = renderMwMarkup(value);
  if (MW_MARKUP_REMAINS.test(rendered)) {
    throw pipelineError(
      PIPELINE_CODES.MW_MARKUP_REMAINS,
      `Unresolved Merriam-Webster markup remains in ${field}`,
    );
  }
  return rendered;
}

function entryId(entry) {
  return entry?.meta?.id;
}

export function isExactMwEntry(word, candidate) {
  if (!nonEmpty(word) || !candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return false;
  }

  const requested = normalized(word.trim());
  const stems = Array.isArray(candidate.meta?.stems) ? candidate.meta.stems : [];
  if (stems.some((stem) => nonEmpty(stem) && normalized(stem.trim()) === requested)) {
    return true;
  }

  const headword = candidate.hwi?.hw;
  return nonEmpty(headword) && normalized(headword.replaceAll("*", "").trim()) === requested;
}

export function findExactMwEntries(word, response) {
  if (!Array.isArray(response)) {
    throw new TypeError("Merriam-Webster Collegiate response must be an array");
  }
  return response.filter((candidate) => isExactMwEntry(word, candidate));
}

function validateOverride(override) {
  if (!override || typeof override !== "object" || Array.isArray(override)) {
    throw pipelineError(PIPELINE_CODES.INVALID_OVERRIDE, "Override must be an object");
  }
  const keys = Object.keys(override);
  if (
    keys.length !== 2
    || !keys.includes("entry_id")
    || !keys.includes("unit")
    || !nonEmpty(override.entry_id)
    || !nonEmpty(override.unit)
  ) {
    throw pipelineError(
      PIPELINE_CODES.INVALID_OVERRIDE,
      "Override must contain non-empty entry_id and unit fields only",
    );
  }
}

function selectable(unit) {
  return unit.eligible === true && nonEmpty(unit.dtText);
}

export function selectMwEntryAndUnit(word, response, { override } = {}) {
  const entries = findExactMwEntries(word, response);
  if (entries.length === 0) {
    throw pipelineError(
      PIPELINE_CODES.NO_MW_ENTRY,
      `No exact Merriam-Webster Collegiate entry found for ${word}`,
    );
  }

  if (override !== undefined) {
    validateOverride(override);
    const matchingEntries = entries.filter((entry) => entryId(entry) === override.entry_id);
    if (matchingEntries.length !== 1) {
      throw pipelineError(
        PIPELINE_CODES.INVALID_OVERRIDE,
        "Override entry_id does not identify exactly one exact entry candidate",
      );
    }

    const entry = matchingEntries[0];
    const matchingUnits = walkMwEntry(entry).filter((unit) => unit.id === override.unit);
    if (matchingUnits.length !== 1 || !selectable(matchingUnits[0])) {
      throw pipelineError(
        PIPELINE_CODES.INVALID_OVERRIDE,
        "Override unit is missing, ineligible, or has no defining text",
      );
    }
    return { entry, unit: matchingUnits[0] };
  }

  if (entries.length > 1) {
    throw pipelineError(
      PIPELINE_CODES.AMBIGUOUS_ENTRY,
      `Multiple exact Merriam-Webster Collegiate entries found for ${word}`,
      { entry_ids: entries.map(entryId) },
    );
  }

  const entry = entries[0];
  const units = walkMwEntry(entry).filter(selectable);
  if (units.length === 0) {
    throw pipelineError(
      PIPELINE_CODES.NO_DEFINING_TEXT,
      `Exact Merriam-Webster entry has no eligible defining unit for ${word}`,
    );
  }
  if (units.length > 1) {
    throw pipelineError(
      PIPELINE_CODES.AMBIGUOUS_UNIT,
      `Exact Merriam-Webster entry has multiple eligible defining units for ${word}`,
      { unit_ids: units.map((unit) => unit.id) },
    );
  }

  return { entry, unit: units[0] };
}

function renderNullableAttribution(value, field) {
  if (!nonEmpty(value)) {
    return null;
  }
  const rendered = renderDisplay(value, field);
  return nonEmpty(rendered) ? rendered : null;
}

function extractExample(word, entry, unit) {
  const attributed = unit.vis.filter(
    (item) => item && typeof item === "object"
      && (nonEmpty(item.aq?.auth) || nonEmpty(item.aq?.source)),
  );
  if (attributed.length === 0) {
    return null;
  }

  const forms = [word, ...(Array.isArray(entry.meta?.stems) ? entry.meta.stems : [])]
    .filter(nonEmpty)
    .filter((form, index, all) => all.findIndex(
      (candidate) => normalized(candidate) === normalized(form),
    ) === index);

  for (const item of attributed) {
    if (typeof item.t !== "string") {
      continue;
    }
    const text = renderDisplay(item.t, "example text");
    let formMatched = null;
    for (const form of forms) {
      formMatched = findWholeWord(text, form);
      if (formMatched !== null) {
        break;
      }
    }
    if (formMatched === null) {
      continue;
    }

    const attribution = {
      author: renderNullableAttribution(item.aq.auth, "example author"),
      source: renderNullableAttribution(item.aq.source, "example source"),
      date: renderNullableAttribution(item.aq.aqdate, "example date"),
    };
    if (attribution.author === null && attribution.source === null) {
      continue;
    }

    return { text, kind: "vis", form_matched: formMatched, attribution };
  }

  throw pipelineError(
    PIPELINE_CODES.EXAMPLE_HEADWORD_MISMATCH,
    `Attributed examples do not contain ${word} or an exact entry stem`,
  );
}

export function selectMwRecord(word, response, options = {}) {
  const { entry, unit } = selectMwEntryAndUnit(word, response, options);
  const mwEntryId = entryId(entry);
  if (!nonEmpty(mwEntryId)) {
    throw pipelineError(
      PIPELINE_CODES.NO_MW_ENTRY,
      "Selected Merriam-Webster entry has no entry id",
    );
  }

  const definitionText = renderDisplay(unit.dtText, "definition text");
  if (!nonEmpty(definitionText)) {
    throw pipelineError(
      PIPELINE_CODES.NO_DEFINING_TEXT,
      "Selected semantic unit renders to empty defining text",
    );
  }
  if (!nonEmpty(entry.fl)) {
    throw pipelineError(
      PIPELINE_CODES.NO_PART_OF_SPEECH,
      "Selected Merriam-Webster entry has no part of speech",
    );
  }

  return {
    word,
    mw_entry_id: mwEntryId,
    mw_unit_id: unit.id,
    definition: {
      text: definitionText,
      part_of_speech: entry.fl,
      source: "mw-collegiate",
    },
    pronunciation: extractFirstPronunciation(entry),
    example: extractExample(word, entry, unit),
  };
}
