import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const COLLEGIATE_ENDPOINT = "https://www.dictionaryapi.com/api/v3/references/collegiate/json/";
const DEFAULT_CACHE_DIR = fileURLToPath(new URL("../cache/collegiate/", import.meta.url));

function normalizeWord(word) {
  if (typeof word !== "string" || !/^[a-z]+$/i.test(word)) {
    throw new TypeError("Collegiate query word must contain letters only");
  }
  return word.toLowerCase();
}

function isCollegiateResponse(value) {
  return Array.isArray(value);
}

async function readValidCache(path) {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    return isCollegiateResponse(parsed) ? parsed : null;
  } catch (error) {
    if (error?.code === "ENOENT" || error instanceof SyntaxError) {
      return null;
    }
    throw error;
  }
}

async function writeCacheAtomically(path, value) {
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

export function collegiateCachePath(word, { cacheDir = DEFAULT_CACHE_DIR } = {}) {
  return join(cacheDir, `${normalizeWord(word)}.json`);
}

export async function fetchCollegiate(
  word,
  {
    cacheDir = DEFAULT_CACHE_DIR,
    fetchImpl = globalThis.fetch,
    refresh = false,
  } = {},
) {
  const normalizedWord = normalizeWord(word);
  const cachePath = collegiateCachePath(normalizedWord, { cacheDir });

  if (!refresh) {
    const cached = await readValidCache(cachePath);
    if (cached !== null) {
      return cached;
    }
  }

  const apiKey = process.env.MW_KEY;
  if (typeof apiKey !== "string" || apiKey.trim() === "") {
    throw new Error("MW_KEY is required for an uncached Collegiate request");
  }
  if (typeof fetchImpl !== "function") {
    throw new TypeError("A fetch implementation is required");
  }

  const url = new URL(`${COLLEGIATE_ENDPOINT}${encodeURIComponent(normalizedWord)}`);
  url.searchParams.set("key", apiKey);

  let response;
  try {
    response = await fetchImpl(url);
  } catch {
    throw new Error("MW Collegiate request failed during transport");
  }

  if (!response?.ok) {
    throw new Error(`MW Collegiate request failed with HTTP ${response?.status ?? "unknown"}`);
  }

  let raw;
  try {
    raw = await response.json();
  } catch {
    throw new Error("MW Collegiate response was not valid JSON");
  }
  if (!isCollegiateResponse(raw)) {
    throw new Error("MW Collegiate response must be an array");
  }

  await writeCacheAtomically(cachePath, raw);
  return raw;
}
