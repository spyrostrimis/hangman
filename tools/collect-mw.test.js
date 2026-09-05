import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { runMwProbe } from "./collect-mw.js";
import { MwPipelineError, PIPELINE_CODES } from "./lib/mw-errors.js";

const LOCKED = ["gemstone", "melancholy"];

function sense(sn, text, vis = []) {
  return ["sense", { sn, dt: [["text", text], ...(vis.length ? [["vis", vis]] : [])] }];
}

function entry({
  word = "gemstone",
  id = `${word}:1`,
  sseq = [[sense("1", "{bc}a synthetic definition")]],
} = {}) {
  return {
    meta: { id, stems: [word] },
    hwi: {
      hw: word,
      prs: [{ mw: "synthetic", sound: { audio: `${word}001` } }],
    },
    fl: "noun",
    def: [{ sseq }],
  };
}

async function withTempReport(run) {
  const directory = await mkdtemp(join(tmpdir(), "hangman-mw-probe-"));
  const reportPath = join(directory, "nested", "mw-probe.json");
  try {
    return await run(reportPath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function quietOptions(reportPath, extra = {}) {
  return {
    lockedWords: LOCKED,
    overrides: {},
    reportPath,
    log: () => {},
    now: () => new Date("2026-01-02T03:04:05Z"),
    ...extra,
  };
}

test("requires explicit words instead of defaulting to the locked corpus", async () => {
  await withTempReport(async (reportPath) => {
    await assert.rejects(
      () => runMwProbe([], quietOptions(reportPath)),
      /At least one explicit word is required/,
    );
  });
});

test("rejects a requested word outside words.locked.json before collection", async () => {
  await withTempReport(async (reportPath) => {
    let fetchCalls = 0;
    await assert.rejects(
      () => runMwProbe(["outsider"], quietOptions(reportPath, {
        fetchCollegiateImpl: async () => {
          fetchCalls += 1;
          return [];
        },
      })),
      /not in tools\/words\.locked\.json/,
    );
    assert.equal(fetchCalls, 0);
  });
});

test("continues requested words after one pipeline failure", async () => {
  await withTempReport(async (reportPath) => {
    const report = await runMwProbe(["melancholy", "gemstone"], quietOptions(reportPath, {
      fetchCollegiateImpl: async (word) => (
        word === "melancholy" ? ["suggestion"] : [entry()]
      ),
      verifyAudioImpl: async () => ({ ok: true, status: 200 }),
    }));

    assert.deepEqual(report.words.map(({ word, status }) => ({ word, status })), [
      { word: "melancholy", status: "failed" },
      { word: "gemstone", status: "success" },
    ]);
    assert.equal(report.words[0].error.code, PIPELINE_CODES.NO_MW_ENTRY);
  });
});

test("successful word performs exactly one HEAD verification", async () => {
  await withTempReport(async (reportPath) => {
    const calls = [];
    const report = await runMwProbe(["gemstone"], quietOptions(reportPath, {
      fetchCollegiateImpl: async () => [entry()],
      verifyAudioImpl: async (url, options) => {
        calls.push({ url, options });
        return { ok: true, status: 204 };
      },
    }));

    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /gemstone001\.mp3$/);
    assert.equal(typeof calls[0].options.fetchImpl, "function");
    assert.deepEqual(report.words[0].audio_verification, { ok: true, status: 204 });
  });
});

test("AMBIGUOUS_ENTRY report contains concise candidate entries and units", async () => {
  await withTempReport(async (reportPath) => {
    const response = [entry({ id: "gemstone:1" }), entry({ id: "gemstone:2" })];
    const report = await runMwProbe(["gemstone"], quietOptions(reportPath, {
      fetchCollegiateImpl: async () => response,
    }));
    const result = report.words[0];

    assert.equal(result.status, "needs_curation");
    assert.equal(result.error.code, PIPELINE_CODES.AMBIGUOUS_ENTRY);
    assert.deepEqual(result.candidates.map(({ entry_id }) => entry_id), [
      "gemstone:1",
      "gemstone:2",
    ]);
    assert.deepEqual(result.candidates[0].units.map(({ id }) => id), ["1"]);
    assert.equal(result.candidates[0].units[0].rendered_definition, "a synthetic definition");
    assert.equal(result.candidates[0].diagnostic_error, null);
    assert.equal(result.candidates[1].diagnostic_error, null);
    assert.equal("rawResponse" in result, false);
  });
});

test("AMBIGUOUS_UNIT report includes ids, rendered definitions, labels, and vis counts", async () => {
  await withTempReport(async (reportPath) => {
    const attributed = { t: "a gemstone", aq: { source: "Synthetic Source" } };
    const response = [entry({
      sseq: [[
        sense("1", "{bc}first definition", [attributed]),
        sense("2", "{bc}second definition"),
      ]],
    })];
    const report = await runMwProbe(["gemstone"], quietOptions(reportPath, {
      fetchCollegiateImpl: async () => response,
    }));
    const result = report.words[0];

    assert.equal(result.status, "needs_curation");
    assert.equal(result.error.code, PIPELINE_CODES.AMBIGUOUS_UNIT);
    assert.equal(result.candidates[0].diagnostic_error, null);
    assert.deepEqual(result.candidates[0].units, [
      {
        id: "1",
        eligible: true,
        sls: [],
        rendered_definition: "first definition",
        attributed_vis_count: 1,
        total_vis_count: 1,
      },
      {
        id: "2",
        eligible: true,
        sls: [],
        rendered_definition: "second definition",
        attributed_vis_count: 0,
        total_vis_count: 0,
      },
    ]);
  });
});

test("candidate diagnostic failure stays secondary and does not stop later words", async () => {
  await withTempReport(async (reportPath) => {
    const previous = process.env.MW_KEY;
    const secret = ["diagnostic", "secret"].join("-");
    const rawMarker = "SYNTHETIC_RAW_RESPONSE_MARKER";
    const structuralType = `unknown?key=${secret}`;
    process.env.MW_KEY = secret;

    try {
      const failingCandidate = entry({ id: "gemstone:1" });
      let definitionReads = 0;
      Object.defineProperty(failingCandidate, "def", {
        enumerable: true,
        get() {
          definitionReads += 1;
          if (definitionReads === 1) {
            return [{ sseq: [[sense("1", "{bc}synthetic first candidate")] ] }];
          }
          return [{ sseq: [[
            [structuralType, { rawMarker }],
          ]] }];
        },
      });

      const report = await runMwProbe(
        ["gemstone", "melancholy"],
        quietOptions(reportPath, {
          fetchCollegiateImpl: async (word) => (
            word === "gemstone"
              ? [failingCandidate, entry({ id: "gemstone:2" })]
              : [entry({ word: "melancholy", id: "melancholy:1" })]
          ),
          verifyAudioImpl: async () => ({ ok: true, status: 200 }),
        }),
      );
      const [ambiguous, laterSuccess] = report.words;
      const [failedDiagnostic, normalDiagnostic] = ambiguous.candidates;
      const serialized = JSON.stringify(report);

      assert.deepEqual(report.words.map(({ word, status }) => ({ word, status })), [
        { word: "gemstone", status: "needs_curation" },
        { word: "melancholy", status: "success" },
      ]);
      assert.equal(ambiguous.error.code, PIPELINE_CODES.AMBIGUOUS_ENTRY);
      assert.deepEqual(failedDiagnostic.units, []);
      assert.equal(failedDiagnostic.diagnostic_error.type, "structural");
      assert.equal(failedDiagnostic.diagnostic_error.code, "WALKER_STRUCTURAL_ERROR");
      assert.match(failedDiagnostic.diagnostic_error.message, /\?key=\[REDACTED\]/);
      assert.deepEqual(normalDiagnostic.units.map(({ id }) => id), ["1"]);
      assert.equal(normalDiagnostic.diagnostic_error, null);
      assert.equal(laterSuccess.record.word, "melancholy");

      assert.equal(structuralType.includes(secret), true);
      assert.equal(serialized.includes(secret), false);
      assert.equal(rawMarker.length > 0, true);
      assert.equal(serialized.includes(rawMarker), false);
      assert.equal(Object.hasOwn(ambiguous, "candidates"), true);
      assert.equal("raw_response" in ambiguous, false);
    } finally {
      if (previous === undefined) {
        delete process.env.MW_KEY;
      } else {
        process.env.MW_KEY = previous;
      }
    }
  });
});

test("report redacts API key material and omits full raw responses", async () => {
  await withTempReport(async (reportPath) => {
    const previous = process.env.MW_KEY;
    const secret = ["synthetic", "secret"].join("-");
    process.env.MW_KEY = secret;
    try {
      const report = await runMwProbe(["gemstone"], quietOptions(reportPath, {
        fetchCollegiateImpl: async () => {
          throw new Error(`failure ?key=${secret}`);
        },
      }));
      const serialized = JSON.stringify(report);
      const written = await readFile(reportPath, "utf8");

      assert.equal(serialized.includes(secret), false);
      assert.equal(written.includes(secret), false);
      assert.equal(written.includes("?key=" + secret), false);
      assert.equal("raw_response" in report.words[0], false);
    } finally {
      if (previous === undefined) {
        delete process.env.MW_KEY;
      } else {
        process.env.MW_KEY = previous;
      }
    }
  });
});

test("creates the output directory and delegates cache behavior to mw-client", async () => {
  await withTempReport(async (reportPath) => {
    const collectionCalls = [];
    const report = await runMwProbe(["gemstone"], quietOptions(reportPath, {
      fetchCollegiateImpl: async (word, options) => {
        collectionCalls.push({ word, options });
        return [entry()];
      },
      verifyAudioImpl: async () => ({ ok: true, status: 200 }),
    }));

    assert.equal((await stat(reportPath)).isFile(), true);
    assert.equal(collectionCalls.length, 1);
    assert.equal(collectionCalls[0].word, "gemstone");
    assert.equal(typeof collectionCalls[0].options.fetchImpl, "function");
    assert.equal(report.new_collegiate_get_requests, 0);
    assert.equal(report.cache_hits, 1);
  });
});

test("does not invent or write an override", async () => {
  await withTempReport(async (reportPath) => {
    const overrideUrl = new URL("./mw-overrides.json", import.meta.url);
    const before = await readFile(overrideUrl, "utf8");
    const report = await runMwProbe(["gemstone"], quietOptions(reportPath, {
      fetchCollegiateImpl: async () => [entry({
        sseq: [[sense("1", "first")], [sense("2", "second")]],
      })],
    }));
    const after = await readFile(overrideUrl, "utf8");

    assert.equal(report.words[0].status, "needs_curation");
    assert.equal(report.words[0].error.code, PIPELINE_CODES.AMBIGUOUS_UNIT);
    assert.equal(after, before);
  });
});

test("technical errors remain distinct from pipeline curation failures", async () => {
  await withTempReport(async (reportPath) => {
    const report = await runMwProbe(["gemstone"], quietOptions(reportPath, {
      fetchCollegiateImpl: async () => { throw new Error("synthetic transport failure"); },
    }));

    assert.deepEqual(report.words[0].error, {
      type: "technical",
      code: "TECHNICAL_ERROR",
      message: "synthetic transport failure",
    });
  });
});

test("pipeline errors are identified by type rather than guessed from a code string", async () => {
  await withTempReport(async (reportPath) => {
    const report = await runMwProbe(["gemstone"], quietOptions(reportPath, {
      fetchCollegiateImpl: async () => {
        throw new MwPipelineError(PIPELINE_CODES.NO_DEFINING_TEXT, "synthetic pipeline failure");
      },
    }));

    assert.equal(report.words[0].error.type, "pipeline");
    assert.equal(report.words[0].error.code, PIPELINE_CODES.NO_DEFINING_TEXT);
  });
});
