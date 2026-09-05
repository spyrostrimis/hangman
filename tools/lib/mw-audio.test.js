import test from "node:test";
import assert from "node:assert/strict";

import {
  MwAudioVerificationError,
  buildMwAudioUrl,
  extractFirstPronunciation,
  getMwAudioSubdirectory,
  verifyAudioUrl,
} from "./mw-audio.js";
import { MwPipelineError, PIPELINE_CODES } from "./mw-errors.js";

test("constructs documented audio subdirectories", () => {
  const cases = [
    ["bixbite01", "bix"],
    ["ggjeru01", "gg"],
    ["3d000001", "number"],
    ["_example", "number"],
    ["volume01", "v"],
  ];

  for (const [audioFile, subdirectory] of cases) {
    assert.equal(getMwAudioSubdirectory(audioFile), subdirectory);
    assert.equal(
      buildMwAudioUrl(audioFile),
      `https://media.merriam-webster.com/audio/prons/en/us/mp3/${subdirectory}/${audioFile}.mp3`,
    );
  }
});

test("ggjeru01 uses the gg regression path", () => {
  assert.equal(
    buildMwAudioUrl("ggjeru01"),
    "https://media.merriam-webster.com/audio/prons/en/us/mp3/gg/ggjeru01.mp3",
  );
});

test("extracts prs[0] only even when prs[1] looks better", () => {
  const entry = {
    hwi: {
      prs: [
        { mw: "first", sound: { audio: "first001", ref: "c", stat: "1" } },
        { mw: "second", sound: { audio: "ggbetter01" } },
      ],
    },
  };

  assert.deepEqual(extractFirstPronunciation(entry), {
    mw: "first",
    audio_file: "first001",
    audio_url: "https://media.merriam-webster.com/audio/prons/en/us/mp3/f/first001.mp3",
  });
});

test("never falls through when prs[0] lacks written pronunciation", () => {
  assert.throws(
    () => extractFirstPronunciation({
      hwi: { prs: [{ sound: { audio: "first001" } }, { mw: "second", sound: { audio: "second" } }] },
    }),
    (error) => error instanceof MwPipelineError
      && error.code === PIPELINE_CODES.MISSING_PRONUNCIATION,
  );
});

test("never falls through when prs[0] lacks audio", () => {
  assert.throws(
    () => extractFirstPronunciation({
      hwi: { prs: [{ mw: "first" }, { mw: "second", sound: { audio: "second" } }] },
    }),
    (error) => error instanceof MwPipelineError && error.code === PIPELINE_CODES.MISSING_AUDIO,
  );
});

test("audio verifier uses HEAD and accepts 2xx", async () => {
  let received;
  const result = await verifyAudioUrl("https://audio.example.test/file.mp3", {
    fetchImpl: async (...args) => {
      received = args;
      return { ok: true, status: 204 };
    },
  });

  assert.deepEqual(received, ["https://audio.example.test/file.mp3", { method: "HEAD" }]);
  assert.deepEqual(result, { ok: true, status: 204 });
});

test("audio verifier labels only HTTP 404 as AUDIO_404", async () => {
  await assert.rejects(
    () => verifyAudioUrl("https://audio.example.test/missing.mp3", {
      fetchImpl: async () => ({ ok: false, status: 404 }),
    }),
    (error) => error instanceof MwPipelineError && error.code === PIPELINE_CODES.AUDIO_404,
  );

  await assert.rejects(
    () => verifyAudioUrl("https://audio.example.test/error.mp3", {
      fetchImpl: async () => ({ ok: false, status: 503 }),
    }),
    (error) => error instanceof MwAudioVerificationError
      && error.status === 503
      && error.code === undefined,
  );

  await assert.rejects(
    () => verifyAudioUrl("https://audio.example.test/transport.mp3", {
      fetchImpl: async () => { throw new Error("offline"); },
    }),
    (error) => error instanceof MwAudioVerificationError && error.code === undefined,
  );
});
