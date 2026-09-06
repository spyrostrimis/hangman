import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import sharp from "sharp";

import { prepareImages, WEBP_OPTIONS } from "./prepare-images.js";

async function fileHash(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

async function writeSyntheticPng(file, width, height, background) {
  await sharp({
    create: { width, height, channels: 3, background },
  }).png().toFile(file);
}

async function makeFixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "hangman-images-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const sourceDirectory = path.join(root, "source");
  const outputDirectory = path.join(root, "output", "paintings");
  const wordsPath = path.join(root, "words.json");
  const manifestPath = path.join(root, "manifest.json");
  const words = ["alpha", "beta"];
  await mkdir(sourceDirectory, { recursive: true });
  await writeSyntheticPng(path.join(sourceDirectory, "alpha.png"), 7, 5, "#336699");
  await writeSyntheticPng(path.join(sourceDirectory, "beta.png"), 4, 9, "#cc8844");
  await writeSyntheticPng(path.join(sourceDirectory, "retired.png"), 3, 3, "#111111");
  await writeFile(wordsPath, `${JSON.stringify(words, null, 2)}\n`);
  await writeFile(manifestPath, `${JSON.stringify({
    words: words.map((word) => ({
      word,
      image: { key: `paintings/${word}.webp` },
    })),
  }, null, 2)}\n`);

  return {
    root,
    sourceDirectory,
    outputDirectory,
    wordsPath,
    manifestPath,
    words,
  };
}

function runFixture(fixture, overrides = {}) {
  return prepareImages({
    sourceDirectory: fixture.sourceDirectory,
    outputDirectory: fixture.outputDirectory,
    wordsPath: fixture.wordsPath,
    manifestPath: fixture.manifestPath,
    expectedWordCount: fixture.words.length,
    ...overrides,
  });
}

test("prepares exactly the locked synthetic images and preserves dimensions", async (t) => {
  const fixture = await makeFixture(t);
  const sourceHashes = Object.fromEntries(await Promise.all(
    fixture.words.map(async (word) => [
      word,
      await fileHash(path.join(fixture.sourceDirectory, `${word}.png`)),
    ]),
  ));

  const summary = await runFixture(fixture);

  assert.deepEqual(WEBP_OPTIONS, {
    quality: 90,
    preset: "picture",
    smartSubsample: true,
    effort: 6,
  });
  assert.equal(summary.inputCount, 2);
  assert.equal(summary.outputCount, 2);
  assert.equal(summary.manifestKeysVerified, 2);
  assert.equal(summary.sourceHashesUnchanged, true);
  assert.deepEqual(
    (await readdir(fixture.outputDirectory)).sort(),
    ["alpha.webp", "beta.webp"],
  );
  assert.equal(
    await fileHash(path.join(fixture.sourceDirectory, "alpha.png")),
    sourceHashes.alpha,
  );
  assert.equal(
    await fileHash(path.join(fixture.sourceDirectory, "beta.png")),
    sourceHashes.beta,
  );

  const alpha = await sharp(path.join(fixture.outputDirectory, "alpha.webp")).metadata();
  const beta = await sharp(path.join(fixture.outputDirectory, "beta.webp")).metadata();
  assert.deepEqual([alpha.format, alpha.width, alpha.height], ["webp", 7, 5]);
  assert.deepEqual([beta.format, beta.width, beta.height], ["webp", 4, 9]);
  await assert.doesNotReject(
    sharp(path.join(fixture.outputDirectory, "alpha.webp")).raw().toBuffer(),
  );
  assert.equal(Boolean(alpha.exif || alpha.icc || alpha.xmp || alpha.iptc), false);
  assert.equal(await readdir(fixture.sourceDirectory).then((names) => names.includes("retired.png")), true);
  assert.equal(await readdir(fixture.outputDirectory).then((names) => names.includes("retired.webp")), false);
});

test("rejects a missing locked source before publishing output", async (t) => {
  const fixture = await makeFixture(t);
  await assert.doesNotReject(runFixture(fixture));

  await unlink(path.join(fixture.sourceDirectory, "beta.png"));
  const failedOutput = path.join(fixture.root, "missing", "paintings");
  await assert.rejects(
    runFixture(fixture, { outputDirectory: failedOutput }),
    /expected exactly one source file named beta\.png; found 0/,
  );
  await assert.rejects(readdir(failedOutput), /ENOENT/);
});

test("rejects content that is not PNG even when its filename ends in png", async (t) => {
  const fixture = await makeFixture(t);
  await assert.doesNotReject(runFixture(fixture));

  const disguisedWebp = await sharp({
    create: { width: 4, height: 9, channels: 3, background: "#cc8844" },
  }).webp().toBuffer();
  await writeFile(path.join(fixture.sourceDirectory, "beta.png"), disguisedWebp);
  await assert.rejects(
    runFixture(fixture, {
      outputDirectory: path.join(fixture.root, "wrong-format", "paintings"),
    }),
    /beta\.png detected as webp/,
  );
});

test("rejects duplicate locked words so a source cannot be reused", async (t) => {
  const fixture = await makeFixture(t);
  await assert.doesNotReject(runFixture(fixture));

  await writeFile(fixture.wordsPath, '["alpha", "alpha"]\n');
  await assert.rejects(runFixture(fixture), /duplicate locked word: alpha/);
});

test("rejects a missing source directory", async (t) => {
  const fixture = await makeFixture(t);
  await assert.doesNotReject(runFixture(fixture));

  await assert.rejects(
    runFixture(fixture, {
      sourceDirectory: path.join(fixture.root, "does-not-exist"),
    }),
    /source directory does not exist/,
  );
});

test("rejects a manifest image-key mismatch before publishing output", async (t) => {
  const fixture = await makeFixture(t);
  await assert.doesNotReject(runFixture(fixture));

  const manifest = JSON.parse(await readFile(fixture.manifestPath, "utf8"));
  manifest.words[0].image.key = "paintings/not-alpha.webp";
  await writeFile(fixture.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await assert.rejects(runFixture(fixture), /manifest image key mismatch for alpha/);
});

test("a failed rerun leaves the previous complete output set unchanged", async (t) => {
  const fixture = await makeFixture(t);
  await assert.doesNotReject(runFixture(fixture));
  const before = Object.fromEntries(await Promise.all(
    fixture.words.map(async (word) => [
      word,
      await fileHash(path.join(fixture.outputDirectory, `${word}.webp`)),
    ]),
  ));

  await writeFile(path.join(fixture.sourceDirectory, "beta.png"), "not an image");
  await assert.rejects(runFixture(fixture), /source image cannot be decoded: beta\.png/);

  assert.deepEqual(
    (await readdir(fixture.outputDirectory)).sort(),
    ["alpha.webp", "beta.webp"],
  );
  assert.equal(
    await fileHash(path.join(fixture.outputDirectory, "alpha.webp")),
    before.alpha,
  );
  assert.equal(
    await fileHash(path.join(fixture.outputDirectory, "beta.webp")),
    before.beta,
  );
});
