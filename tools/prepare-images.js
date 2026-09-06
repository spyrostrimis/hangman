import { createHash, randomUUID } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import sharp from "sharp";

// Windows will not rename a staged directory while libvips caches open files.
sharp.cache({ files: 0 });

const TOOLS_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_WORDS_PATH = path.join(TOOLS_DIRECTORY, "words.locked.json");
const DEFAULT_MANIFEST_PATH = path.join(
  TOOLS_DIRECTORY,
  "..",
  "client",
  "src",
  "data",
  "words.json",
);
const DEFAULT_OUTPUT_DIRECTORY = path.join(
  TOOLS_DIRECTORY,
  "output",
  "paintings",
);

export const WEBP_OPTIONS = Object.freeze({
  quality: 90,
  preset: "picture",
  smartSubsample: true,
  effort: 6,
});

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function hashFile(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

function validateLockedWords(words, expectedWordCount) {
  if (!Array.isArray(words)) {
    throw new Error("locked corpus must be a JSON array");
  }
  if (words.length !== expectedWordCount) {
    throw new Error(
      `locked corpus must contain exactly ${expectedWordCount} words; found ${words.length}`,
    );
  }

  const seen = new Set();
  for (const word of words) {
    if (
      typeof word !== "string"
      || word.length === 0
      || path.basename(word) !== word
      || word !== word.toLowerCase()
    ) {
      throw new Error(`invalid locked word: ${JSON.stringify(word)}`);
    }
    if (seen.has(word)) {
      throw new Error(`duplicate locked word: ${word}`);
    }
    seen.add(word);
  }
}

function validateManifest(manifest, words) {
  if (!manifest || !Array.isArray(manifest.words)) {
    throw new Error("manifest must contain a words array");
  }

  const expectedWords = new Set(words);
  const records = new Map();
  for (const record of manifest.words) {
    if (!record || typeof record.word !== "string") {
      throw new Error("manifest contains a record without a word");
    }
    if (records.has(record.word)) {
      throw new Error(`duplicate manifest word: ${record.word}`);
    }
    records.set(record.word, record);
  }

  for (const word of words) {
    const record = records.get(word);
    if (!record) {
      throw new Error(`manifest is missing locked word: ${word}`);
    }
    const expectedKey = `paintings/${word}.webp`;
    if (record.image?.key !== expectedKey) {
      throw new Error(
        `manifest image key mismatch for ${word}: expected ${expectedKey}`,
      );
    }
  }

  for (const word of records.keys()) {
    if (!expectedWords.has(word)) {
      throw new Error(`manifest contains unexpected word: ${word}`);
    }
  }
}

function hasEmbeddedMetadata(metadata) {
  return Boolean(
    metadata.exif
    || metadata.icc
    || metadata.iptc
    || metadata.xmp
    || (Array.isArray(metadata.comments) && metadata.comments.length > 0),
  );
}

async function validateExistingOutput(outputDirectory, expectedNames) {
  if (!(await exists(outputDirectory))) {
    return;
  }
  if (!(await stat(outputDirectory)).isDirectory()) {
    throw new Error(`output path is not a directory: ${outputDirectory}`);
  }

  const entries = await readdir(outputDirectory, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !expectedNames.has(entry.name)) {
      throw new Error(
        `refusing to replace output directory containing unexpected entry: ${entry.name}`,
      );
    }
  }
}

async function inspectSources(sourceDirectory, words) {
  if (!(await exists(sourceDirectory)) || !(await stat(sourceDirectory)).isDirectory()) {
    throw new Error(`source directory does not exist: ${sourceDirectory}`);
  }

  const entries = await readdir(sourceDirectory, { withFileTypes: true });
  const sourceFiles = [];
  const reusedPaths = new Set();

  for (const word of words) {
    const expectedName = `${word}.png`;
    const matches = entries.filter(
      (entry) => entry.isFile() && entry.name === expectedName,
    );
    if (matches.length !== 1) {
      throw new Error(
        `expected exactly one source file named ${expectedName}; found ${matches.length}`,
      );
    }

    const file = path.resolve(sourceDirectory, matches[0].name);
    const reuseKey = process.platform === "win32" ? file.toLowerCase() : file;
    if (reusedPaths.has(reuseKey)) {
      throw new Error(`source file reused for multiple words: ${file}`);
    }
    reusedPaths.add(reuseKey);

    let metadata;
    try {
      metadata = await sharp(file, { failOn: "error" }).metadata();
      await sharp(file, { failOn: "error" }).raw().toBuffer();
    } catch (error) {
      throw new Error(`source image cannot be decoded: ${expectedName}`, {
        cause: error,
      });
    }
    if (metadata.format !== "png") {
      throw new Error(
        `source image must be PNG: ${expectedName} detected as ${metadata.format}`,
      );
    }

    const fileStat = await stat(file);
    sourceFiles.push({
      word,
      file,
      name: expectedName,
      bytes: fileStat.size,
      width: metadata.width,
      height: metadata.height,
      sha256: await hashFile(file),
    });
  }

  return sourceFiles;
}

async function verifyOutputs(directory, sourceFiles) {
  const expectedNames = new Set(
    sourceFiles.map(({ word }) => `${word}.webp`),
  );
  const entries = await readdir(directory, { withFileTypes: true });
  if (entries.length !== sourceFiles.length) {
    throw new Error(
      `expected exactly ${sourceFiles.length} WebP outputs; found ${entries.length}`,
    );
  }
  for (const entry of entries) {
    if (!entry.isFile() || !expectedNames.has(entry.name)) {
      throw new Error(`unexpected generated output: ${entry.name}`);
    }
  }

  const outputs = [];
  for (const source of sourceFiles) {
    const name = `${source.word}.webp`;
    const file = path.join(directory, name);
    let metadata;
    try {
      metadata = await sharp(file, { failOn: "error" }).metadata();
      await sharp(file, { failOn: "error" }).raw().toBuffer();
    } catch (error) {
      throw new Error(`generated image cannot be decoded: ${name}`, {
        cause: error,
      });
    }
    if (metadata.format !== "webp") {
      throw new Error(`generated image is not WebP: ${name}`);
    }
    if (metadata.width !== source.width || metadata.height !== source.height) {
      throw new Error(
        `generated dimensions differ from source for ${source.word}`,
      );
    }
    if (metadata.hasProfile || hasEmbeddedMetadata(metadata)) {
      throw new Error(`generated image retained metadata: ${name}`);
    }

    outputs.push({
      word: source.word,
      file,
      name,
      bytes: (await stat(file)).size,
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
    });
  }
  return outputs;
}

function assertManagedTemporaryPath(target, parent, outputBaseName, purpose) {
  const resolvedTarget = path.resolve(target);
  const resolvedParent = path.resolve(parent);
  const expectedPrefix = `.${outputBaseName}-${purpose}-`;
  if (
    path.dirname(resolvedTarget) !== resolvedParent
    || !path.basename(resolvedTarget).startsWith(expectedPrefix)
  ) {
    throw new Error(`refusing to manage unsafe temporary path: ${resolvedTarget}`);
  }
}

async function publishStagedOutput(stagingDirectory, outputDirectory) {
  const outputParent = path.dirname(outputDirectory);
  const outputBaseName = path.basename(outputDirectory);
  const backupDirectory = path.join(
    outputParent,
    `.${outputBaseName}-backup-${randomUUID()}`,
  );
  assertManagedTemporaryPath(
    stagingDirectory,
    outputParent,
    outputBaseName,
    "staging",
  );
  assertManagedTemporaryPath(
    backupDirectory,
    outputParent,
    outputBaseName,
    "backup",
  );

  const hadExistingOutput = await exists(outputDirectory);
  if (hadExistingOutput) {
    await rename(outputDirectory, backupDirectory);
  }

  try {
    await rename(stagingDirectory, outputDirectory);
  } catch (error) {
    if (hadExistingOutput && !(await exists(outputDirectory))) {
      await rename(backupDirectory, outputDirectory);
    }
    throw error;
  }

  if (hadExistingOutput) {
    await rm(backupDirectory, { recursive: true, force: true });
  }
}

export async function prepareImages({
  sourceDirectory,
  outputDirectory = DEFAULT_OUTPUT_DIRECTORY,
  wordsPath = DEFAULT_WORDS_PATH,
  manifestPath = DEFAULT_MANIFEST_PATH,
  expectedWordCount = 105,
}) {
  if (typeof sourceDirectory !== "string" || sourceDirectory.trim() === "") {
    throw new Error("source directory must be provided explicitly");
  }

  const resolvedSource = path.resolve(sourceDirectory);
  const resolvedOutput = path.resolve(outputDirectory);
  if (
    resolvedOutput === resolvedSource
    || resolvedOutput.startsWith(`${resolvedSource}${path.sep}`)
  ) {
    throw new Error("output directory must not be the source directory or inside it");
  }

  const words = await readJson(wordsPath);
  validateLockedWords(words, expectedWordCount);
  const manifest = await readJson(manifestPath);
  validateManifest(manifest, words);

  const expectedOutputNames = new Set(words.map((word) => `${word}.webp`));
  await validateExistingOutput(resolvedOutput, expectedOutputNames);
  const sourceFiles = await inspectSources(resolvedSource, words);

  const outputParent = path.dirname(resolvedOutput);
  const outputBaseName = path.basename(resolvedOutput);
  const stagingDirectory = path.join(
    outputParent,
    `.${outputBaseName}-staging-${randomUUID()}`,
  );
  assertManagedTemporaryPath(
    stagingDirectory,
    outputParent,
    outputBaseName,
    "staging",
  );
  await mkdir(outputParent, { recursive: true });
  await mkdir(stagingDirectory);

  let outputs;
  try {
    for (const source of sourceFiles) {
      await sharp(source.file, { failOn: "error" })
        .webp(WEBP_OPTIONS)
        .toFile(path.join(stagingDirectory, `${source.word}.webp`));
    }
    outputs = await verifyOutputs(stagingDirectory, sourceFiles);

    for (const source of sourceFiles) {
      if (await hashFile(source.file) !== source.sha256) {
        throw new Error(`source image changed during preparation: ${source.name}`);
      }
    }

    for (const record of manifest.words) {
      const outputName = path.basename(record.image.key);
      if (!expectedOutputNames.has(outputName) || !(await exists(path.join(stagingDirectory, outputName)))) {
        throw new Error(`manifest image key has no generated output: ${record.image.key}`);
      }
    }

    await publishStagedOutput(stagingDirectory, resolvedOutput);
  } catch (error) {
    if (await exists(stagingDirectory)) {
      try {
        await rm(stagingDirectory, { recursive: true, force: true });
      } catch {
        // Preserve the preparation failure rather than masking it with cleanup.
      }
    }
    throw error;
  }

  const inputBytes = sourceFiles.reduce((sum, source) => sum + source.bytes, 0);
  const outputBytes = outputs.reduce((sum, output) => sum + output.bytes, 0);
  const sortedBySize = [...outputs].sort((left, right) => left.bytes - right.bytes);
  return {
    sourceDirectory: resolvedSource,
    outputDirectory: resolvedOutput,
    inputCount: sourceFiles.length,
    outputCount: outputs.length,
    inputBytes,
    outputBytes,
    averageOutputBytes: outputBytes / outputs.length,
    reductionPercent: (1 - outputBytes / inputBytes) * 100,
    smallestOutput: {
      word: sortedBySize[0].word,
      bytes: sortedBySize[0].bytes,
    },
    largestOutput: {
      word: sortedBySize.at(-1).word,
      bytes: sortedBySize.at(-1).bytes,
    },
    manifestKeysVerified: manifest.words.length,
    sourceHashesUnchanged: true,
    webpOptions: WEBP_OPTIONS,
  };
}

function parseSourceDirectory(argv) {
  if (argv.length !== 2 || argv[0] !== "--source-dir" || argv[1].trim() === "") {
    throw new Error("usage: node prepare-images.js --source-dir <directory>");
  }
  return argv[1];
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  try {
    const summary = await prepareImages({
      sourceDirectory: parseSourceDirectory(process.argv.slice(2)),
    });
    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
