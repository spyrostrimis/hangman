import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { verifyAudioUrl } from "./lib/mw-audio.js";
import { fetchCollegiate } from "./lib/mw-client.js";
import { MwPipelineError, PIPELINE_CODES } from "./lib/mw-errors.js";
import { MW_MARKUP_REMAINS, renderMwMarkup } from "./lib/mw-render.js";
import { findExactMwEntries, selectMwRecord } from "./lib/mw-select.js";
import { MwStructureError, walkMwEntry } from "./lib/mw-walk.js";

const DEFAULT_REPORT_PATH = fileURLToPath(new URL("./output/mw-probe.json", import.meta.url));
const LOCKED_WORDS_PATH = new URL("./words.locked.json", import.meta.url);
const OVERRIDES_PATH = new URL("./mw-overrides.json", import.meta.url);
const CURATION_CODES = new Set([
  PIPELINE_CODES.AMBIGUOUS_ENTRY,
  PIPELINE_CODES.AMBIGUOUS_UNIT,
]);

function nonEmpty(value) {
  return typeof value === "string" && value.trim() !== "";
}

function sanitizedMessage(error) {
  let message = error instanceof Error ? error.message : String(error);
  const apiKey = process.env.MW_KEY;
  if (nonEmpty(apiKey)) {
    message = message.replaceAll(apiKey, "[REDACTED]");
    message = message.replaceAll(encodeURIComponent(apiKey), "[REDACTED]");
  }
  return message.replace(/([?&]key=)[^&\s]+/gi, "$1[REDACTED]");
}

async function readJson(url) {
  return JSON.parse(await readFile(url, "utf8"));
}

async function writeJsonAtomically(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    await rename(temporaryPath, path);
  } catch (error) {
    await unlink(temporaryPath).catch(() => {});
    throw error;
  }
}

function attributedVisCount(vis) {
  return vis.filter(
    (item) => item && typeof item === "object"
      && (nonEmpty(item.aq?.auth) || nonEmpty(item.aq?.source)),
  ).length;
}

function diagnosticError(error) {
  const structural = error instanceof MwStructureError;
  const message = structural
    ? String(error.message).replace(/; raw structural shape:.*$/s, "")
    : error;

  if (error instanceof MwPipelineError) {
    return { type: "pipeline", code: error.code, message: sanitizedMessage(message) };
  }
  if (structural) {
    return {
      type: "structural",
      code: "WALKER_STRUCTURAL_ERROR",
      message: sanitizedMessage(message),
    };
  }
  return {
    type: "technical",
    code: "TECHNICAL_ERROR",
    message: sanitizedMessage(message),
  };
}

export function buildAmbiguityCandidates(word, rawResponse) {
  return findExactMwEntries(word, rawResponse).map((entry) => {
    const candidate = {
      entry_id: entry.meta?.id ?? null,
      part_of_speech: entry.fl ?? null,
    };

    try {
      return {
        ...candidate,
        units: walkMwEntry(entry).map((unit) => {
          const renderedDefinition = nonEmpty(unit.dtText) ? renderMwMarkup(unit.dtText) : null;
          return {
            id: unit.id,
            eligible: unit.eligible,
            sls: unit.sls,
            rendered_definition: renderedDefinition,
            attributed_vis_count: attributedVisCount(unit.vis),
            total_vis_count: unit.vis.length,
            ...(renderedDefinition && MW_MARKUP_REMAINS.test(renderedDefinition)
              ? { unresolved_markup: true }
              : {}),
          };
        }),
        diagnostic_error: null,
      };
    } catch (error) {
      return {
        ...candidate,
        units: [],
        diagnostic_error: diagnosticError(error),
      };
    }
  });
}

function pipelineFailure(word, error, rawResponse) {
  const needsCuration = CURATION_CODES.has(error.code);
  return {
    word,
    status: needsCuration ? "needs_curation" : "failed",
    record: null,
    audio_verification: null,
    error: {
      type: "pipeline",
      code: error.code,
      message: sanitizedMessage(error),
    },
    candidates: needsCuration ? buildAmbiguityCandidates(word, rawResponse) : [],
  };
}

function technicalFailure(word, error) {
  return {
    word,
    status: "failed",
    record: null,
    audio_verification: null,
    error: {
      type: "technical",
      code: "TECHNICAL_ERROR",
      message: sanitizedMessage(error),
    },
    candidates: [],
  };
}

function printWordResult(result, log) {
  log(`\n${result.word}: ${result.status}`);
  if (result.error) {
    log(`  ${result.error.type} error: ${result.error.code} — ${result.error.message}`);
  }

  if (result.record) {
    const { record, audio_verification: audio } = result;
    log(`  entry: ${record.mw_entry_id}`);
    log(`  unit: ${record.mw_unit_id}`);
    log(`  part of speech: ${record.definition.part_of_speech}`);
    log(`  definition: ${record.definition.text}`);
    log(`  pronunciation: ${record.pronunciation.mw}`);
    log(`  audio file: ${record.pronunciation.audio_file}`);
    log(`  audio URL: ${record.pronunciation.audio_url}`);
    log(`  audio HEAD: ${audio.status}`);
    log(`  example present: ${record.example ? "yes" : "no"}`);
    if (record.example) {
      log(`  form matched: ${record.example.form_matched}`);
      log(`  attribution author: ${record.example.attribution.author ?? "null"}`);
      log(`  attribution source: ${record.example.attribution.source ?? "null"}`);
      log(`  attribution date: ${record.example.attribution.date ?? "null"}`);
    }
  }

  for (const candidate of result.candidates) {
    log(`  candidate entry: ${candidate.entry_id} (${candidate.part_of_speech ?? "unknown"})`);
    if (candidate.diagnostic_error) {
      const error = candidate.diagnostic_error;
      log(`    ${error.type} diagnostic error: ${error.code} — ${error.message}`);
    }
    for (const unit of candidate.units) {
      log(`    unit ${unit.id}; eligible=${unit.eligible}; sls=${JSON.stringify(unit.sls)}`);
      log(`      definition: ${unit.rendered_definition ?? "null"}`);
      log(`      vis: attributed=${unit.attributed_vis_count}, total=${unit.total_vis_count}`);
    }
  }
}

export async function runMwProbe(
  requestedWords,
  {
    lockedWords,
    overrides,
    reportPath = DEFAULT_REPORT_PATH,
    fetchCollegiateImpl = fetchCollegiate,
    verifyAudioImpl = verifyAudioUrl,
    fetchImpl = globalThis.fetch,
    now = () => new Date(),
    log = console.log,
  } = {},
) {
  if (!Array.isArray(requestedWords) || requestedWords.length === 0) {
    throw new Error("At least one explicit word is required; the CLI never defaults to all words");
  }

  const canonicalWords = lockedWords ?? await readJson(LOCKED_WORDS_PATH);
  const lockedSet = new Set(canonicalWords);
  const normalizedWords = requestedWords.map((word) => word.toLowerCase());
  for (const word of normalizedWords) {
    if (!lockedSet.has(word)) {
      throw new Error(`Requested word is not in tools/words.locked.json: ${word}`);
    }
  }

  const curatedOverrides = overrides ?? await readJson(OVERRIDES_PATH);
  let newGetRequests = 0;
  const countedFetch = async (...args) => {
    newGetRequests += 1;
    return fetchImpl(...args);
  };
  let cacheHits = 0;
  const results = [];

  for (const word of normalizedWords) {
    let rawResponse;
    try {
      const requestsBeforeFetch = newGetRequests;
      rawResponse = await fetchCollegiateImpl(word, { fetchImpl: countedFetch });
      if (newGetRequests === requestsBeforeFetch) {
        cacheHits += 1;
      }
      const override = curatedOverrides[word];
      const record = selectMwRecord(word, rawResponse, { override });
      const audioVerification = await verifyAudioImpl(record.pronunciation.audio_url, {
        fetchImpl,
      });
      results.push({
        word,
        status: "success",
        record,
        audio_verification: audioVerification,
        error: null,
        candidates: [],
      });
    } catch (error) {
      if (error instanceof MwPipelineError) {
        results.push(pipelineFailure(word, error, rawResponse ?? []));
      } else {
        results.push(technicalFailure(word, error));
      }
    }
  }

  const report = {
    generated_at: now().toISOString(),
    new_collegiate_get_requests: newGetRequests,
    cache_hits: cacheHits,
    words: results,
  };
  await writeJsonAtomically(reportPath, report);

  for (const result of results) {
    printWordResult(result, log);
  }
  log(`\nNew Collegiate GET requests: ${report.new_collegiate_get_requests}`);
  log(`Cache hits: ${report.cache_hits}`);
  log(`Report: ${reportPath}`);
  return report;
}

async function main() {
  try {
    await runMwProbe(process.argv.slice(2));
  } catch (error) {
    console.error(sanitizedMessage(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
