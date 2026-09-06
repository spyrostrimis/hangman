import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const LOCKED_WORDS_PATH = new URL("./words.locked.json", import.meta.url);
const MW_REPORT_PATH = new URL("./output/mw-probe.json", import.meta.url);
const ENRICHMENT_PATH = new URL("./enrichment.json", import.meta.url);
const MANIFEST_PATH = new URL("../client/src/data/words.json", import.meta.url);

const ENRICHMENT_FIELDS = Object.freeze(["clue", "explanation", "synonym"]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function assertLockedWords(lockedWords) {
  if (
    !Array.isArray(lockedWords)
    || lockedWords.length === 0
    || new Set(lockedWords).size !== lockedWords.length
    || lockedWords.some((word) => !isNonEmptyString(word))
  ) {
    throw new Error("Locked words must be a non-empty array of unique strings");
  }
}

function indexMwResults(lockedWords, mwReport) {
  if (!isObject(mwReport) || !Array.isArray(mwReport.words)) {
    throw new Error("MW report must contain a words array");
  }

  const lockedSet = new Set(lockedWords);
  const resultsByWord = new Map();
  const problems = [];

  if (mwReport.words.length !== lockedWords.length) {
    problems.push(
      `expected ${lockedWords.length} MW results, received ${mwReport.words.length}`,
    );
  }

  for (const [index, result] of mwReport.words.entries()) {
    if (!isObject(result) || !isNonEmptyString(result.word)) {
      problems.push(`MW result ${index} has no usable word`);
      continue;
    }
    if (!lockedSet.has(result.word)) {
      problems.push(`unexpected MW word: ${result.word}`);
    }
    if (resultsByWord.has(result.word)) {
      problems.push(`duplicate MW word: ${result.word}`);
    } else {
      resultsByWord.set(result.word, result);
    }
    if (result.status !== "success") {
      problems.push(`MW result for ${result.word} has status ${JSON.stringify(result.status)}`);
    }
    if (!isObject(result.record)) {
      problems.push(`MW result for ${result.word} has no record`);
    } else if (result.record.word !== result.word) {
      problems.push(
        `MW record word mismatch for ${result.word}: ${JSON.stringify(result.record.word)}`,
      );
    }
  }

  for (const word of lockedWords) {
    if (!resultsByWord.has(word)) {
      problems.push(`missing MW word: ${word}`);
    }
  }

  if (problems.length > 0) {
    throw new Error(`Invalid MW report: ${problems.join("; ")}`);
  }
  return resultsByWord;
}

function validateEnrichment(lockedWords, enrichment) {
  if (!isObject(enrichment)) {
    throw new Error("Enrichment must be an object keyed by locked word");
  }

  const lockedSet = new Set(lockedWords);
  const enrichmentWords = Object.keys(enrichment);
  const problems = [];

  if (enrichmentWords.length !== lockedWords.length) {
    problems.push(
      `expected ${lockedWords.length} enrichment words, received ${enrichmentWords.length}`,
    );
  }

  for (const word of lockedWords) {
    if (!Object.hasOwn(enrichment, word)) {
      problems.push(`missing enrichment word: ${word}`);
    }
  }
  for (const word of enrichmentWords) {
    if (!lockedSet.has(word)) {
      problems.push(`unexpected enrichment word: ${word}`);
      continue;
    }

    const entry = enrichment[word];
    if (!isObject(entry)) {
      problems.push(`enrichment for ${word} must be an object`);
      continue;
    }
    const fields = Object.keys(entry).sort();
    if (JSON.stringify(fields) !== JSON.stringify(ENRICHMENT_FIELDS)) {
      problems.push(`enrichment for ${word} must contain exactly synonym, clue, explanation`);
      continue;
    }
    for (const field of ENRICHMENT_FIELDS) {
      if (!isNonEmptyString(entry[field])) {
        problems.push(`enrichment ${word}.${field} must be a non-empty string`);
      }
    }
  }

  if (problems.length > 0) {
    throw new Error(`Invalid enrichment: ${problems.join("; ")}`);
  }
}

export function buildManifest({ lockedWords, mwReport, enrichment, generatedAt }) {
  assertLockedWords(lockedWords);
  const resultsByWord = indexMwResults(lockedWords, mwReport);
  validateEnrichment(lockedWords, enrichment);

  if (!isNonEmptyString(generatedAt) || Number.isNaN(Date.parse(generatedAt))) {
    throw new Error("generatedAt must be an RFC3339-compatible timestamp string");
  }

  const words = lockedWords.map((word) => {
    const record = resultsByWord.get(word).record;
    const authored = enrichment[word];
    return {
      word: record.word,
      mw_entry_id: record.mw_entry_id,
      mw_unit_id: record.mw_unit_id,
      definition: record.definition,
      hints: {
        synonym: {
          text: authored.synonym,
          source: "llm-generated",
        },
        clue: {
          text: authored.clue,
          source: "llm-generated",
        },
      },
      pronunciation: record.pronunciation,
      example: record.example,
      explanation: {
        text: authored.explanation,
        provenance: "llm-generated",
      },
      image: {
        key: `paintings/${word}.webp`,
        origin: "2023-dalle2",
        provenance: "recovered",
        generation: null,
      },
    };
  });

  return {
    schema_version: 1,
    generated_at: generatedAt,
    word_count: lockedWords.length,
    words,
  };
}

async function readJson(url) {
  return JSON.parse(await readFile(url, "utf8"));
}

async function runCli() {
  const [lockedWords, mwReport, enrichment] = await Promise.all([
    readJson(LOCKED_WORDS_PATH),
    readJson(MW_REPORT_PATH),
    readJson(ENRICHMENT_PATH),
  ]);
  if (lockedWords.length !== 105) {
    throw new Error(`Expected the canonical 105 locked words, received ${lockedWords.length}`);
  }

  const manifest = buildManifest({
    lockedWords,
    mwReport,
    enrichment,
    generatedAt: new Date().toISOString(),
  });
  const outputPath = fileURLToPath(MANIFEST_PATH);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Wrote ${manifest.word_count} words to ${outputPath}`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
