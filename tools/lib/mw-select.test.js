import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { MwPipelineError, PIPELINE_CODES } from "./mw-errors.js";
import { MwStructureError } from "./mw-walk.js";
import {
  findExactMwEntries,
  selectMwEntryAndUnit,
  selectMwRecord,
} from "./mw-select.js";

const COMMITTED_OVERRIDES = JSON.parse(
  readFileSync(new URL("../mw-overrides.json", import.meta.url), "utf8"),
);

function sense(sn, text, { sls, vis } = {}) {
  return [
    "sense",
    {
      sn,
      ...(sls ? { sls } : {}),
      dt: [
        ["text", text],
        ...(vis ? [["vis", vis]] : []),
      ],
    },
  ];
}

function senseWithoutDefinition(sn, { sls } = {}) {
  return [
    "sense",
    {
      sn,
      ...(sls ? { sls } : {}),
      dt: [["uns", []]],
    },
  ];
}

function entry({
  word = "volume",
  id = `${word}:1`,
  stems = [word],
  hw = word,
  fl = "noun",
  prs = [{ mw: "synthetic-pronunciation", sound: { audio: `${word}001` } }],
  sseq = [[sense("1", "{bc}a synthetic definition")]],
  ...extra
} = {}) {
  return {
    meta: { id, stems },
    hwi: { hw, prs },
    fl,
    def: [{ sseq }],
    ...extra,
  };
}

function expectCode(code) {
  return (error) => error instanceof MwPipelineError && error.code === code;
}

test("suggestion-string-only response has no exact entry", () => {
  assert.throws(
    () => selectMwRecord("volume", ["voluminous", "volumetric"]),
    expectCode(PIPELINE_CODES.NO_MW_ENTRY),
  );
});

test("exact entry beats a compound containing the query text", () => {
  const compound = entry({
    word: "jerusalem artichoke",
    id: "jerusalem artichoke:1",
    stems: ["Jerusalem artichoke"],
    hw: "Jerusalem artichoke",
  });
  const exact = entry({
    word: "jerusalem",
    id: "Jerusalem:g",
    stems: ["Jerusalem"],
    hw: "Jer*u*sa*lem",
    prs: [{ mw: "synthetic", sound: { audio: "ggjeru01" } }],
  });

  assert.deepEqual(findExactMwEntries("jerusalem", [compound, exact]), [exact]);
  const record = selectMwRecord("jerusalem", [compound, exact]);
  assert.equal(record.mw_entry_id, "Jerusalem:g");
  assert.equal(
    record.pronunciation.audio_url,
    "https://media.merriam-webster.com/audio/prons/en/us/mp3/gg/ggjeru01.mp3",
  );
});

test("hwi.hw exact fallback removes MW syllable separators", () => {
  const candidate = entry({ stems: [], hw: "vol*u*me" });
  assert.deepEqual(findExactMwEntries("volume", [candidate]), [candidate]);
});

test("direct headword match excludes a different entry with only a matching stem", () => {
  const direct = entry({ word: "scared", id: "scared:1", hw: "scared" });
  const stemOnly = entry({
    word: "scare",
    id: "scare:1",
    hw: "scare",
    stems: ["scare", "scared"],
  });

  assert.deepEqual(findExactMwEntries("scared", [stemOnly, direct]), [direct]);
  assert.equal(selectMwRecord("scared", [stemOnly, direct]).mw_entry_id, "scared:1");
});

test("exact complete stem is a fallback when no direct headword exists", () => {
  const fallback = entry({ word: "scare", id: "scare:1", hw: "scare", stems: ["scared"] });
  const substring = entry({
    word: "scaredy-cat",
    id: "scaredy-cat:1",
    hw: "scaredy-cat",
    stems: ["scaredy-cat"],
  });

  assert.deepEqual(findExactMwEntries("scared", [substring, fallback]), [fallback]);
  assert.equal(selectMwRecord("scared", [substring, fallback]).mw_entry_id, "scare:1");
});

test("two exact homograph entries are ambiguous without override", () => {
  const response = [entry({ id: "volume:1" }), entry({ id: "volume:2" })];
  assert.throws(
    () => selectMwRecord("volume", response),
    expectCode(PIPELINE_CODES.AMBIGUOUS_ENTRY),
  );
});

test("direct entry without a usable definition does not compete with a usable entry", () => {
  const usable = entry({ id: "volume:1" });
  const crossReferenceOnly = entry({ id: "volume:2", def: [] });

  const selected = selectMwEntryAndUnit("volume", [crossReferenceOnly, usable]);
  assert.strictEqual(selected.entry, usable);
  assert.equal(selected.unit.id, "1");
});

test("structural failure in a direct candidate is surfaced instead of discarded", () => {
  const usable = entry({ id: "volume:1" });
  const structurallyInvalid = entry({
    id: "volume:2",
    sseq: [[['unknown-structure', {}]]],
  });

  assert.equal(selectMwRecord("volume", [usable]).mw_entry_id, "volume:1");
  assert.throws(
    () => selectMwEntryAndUnit("volume", [usable, structurallyInvalid]),
    (error) => error instanceof MwStructureError && /unknown-structure/.test(error.message),
  );
});

test("one exact entry with two eligible units is ambiguous", () => {
  const candidate = entry({
    sseq: [[sense("1", "first definition")], [sense("2", "second definition")]],
  });
  assert.throws(
    () => selectMwRecord("volume", [candidate]),
    expectCode(PIPELINE_CODES.AMBIGUOUS_UNIT),
  );
});

test("full entry and unit override resolves ambiguity", () => {
  const response = [
    entry({ id: "volume:1" }),
    entry({
      id: "volume:2",
      sseq: [[sense("1", "first definition")], [sense("2", "chosen definition")]],
    }),
  ];

  const record = selectMwRecord("volume", response, {
    override: { entry_id: "volume:2", unit: "2" },
  });
  assert.equal(record.mw_entry_id, "volume:2");
  assert.equal(record.mw_unit_id, "2");
  assert.equal(record.definition.text, "chosen definition");
});

test("committed melancholy and bituminous overrides still resolve", () => {
  const melancholyResponse = [
    entry({
      word: "melancholy",
      id: "melancholy:1",
      fl: "noun",
      sseq: [[sense("1 a", "chosen noun definition"), sense("b", "other noun definition")]],
    }),
    entry({ word: "melancholy", id: "melancholy:2", fl: "adjective" }),
  ];
  const bituminousResponse = [entry({
    word: "bituminous",
    id: "bituminous",
    fl: "adjective",
    sseq: [[sense("1", "chosen adjective definition"), sense("2", "other definition")]],
  })];

  const melancholy = selectMwRecord("melancholy", melancholyResponse, {
    override: COMMITTED_OVERRIDES.melancholy,
  });
  const bituminous = selectMwRecord("bituminous", bituminousResponse, {
    override: COMMITTED_OVERRIDES.bituminous,
  });

  assert.deepEqual([melancholy.mw_entry_id, melancholy.mw_unit_id], ["melancholy:1", "1a"]);
  assert.deepEqual([bituminous.mw_entry_id, bituminous.mw_unit_id], ["bituminous", "1"]);
});

test("partial or unresolved override fails without repair", () => {
  const candidate = entry();
  assert.throws(
    () => selectMwRecord("volume", [candidate], { override: { entry_id: "volume:1" } }),
    expectCode(PIPELINE_CODES.INVALID_OVERRIDE),
  );
  assert.throws(
    () => selectMwRecord("volume", [candidate], {
      override: { entry_id: "volume:1", unit: "9" },
    }),
    expectCode(PIPELINE_CODES.INVALID_OVERRIDE),
  );
});

test("archaic unit cannot be automatically or explicitly selected", () => {
  const candidate = entry({
    sseq: [[sense("1", "old definition", { sls: ["archaic"] })]],
  });
  assert.throws(
    () => selectMwRecord("volume", [candidate]),
    expectCode(PIPELINE_CODES.NO_DEFINING_TEXT),
  );
  assert.throws(
    () => selectMwRecord("volume", [candidate], {
      override: { entry_id: "volume:1", unit: "1" },
    }),
    expectCode(PIPELINE_CODES.INVALID_OVERRIDE),
  );
});

test("definition uses the selected unit and existing MW renderer", () => {
  const candidate = entry({
    fl: "adjective",
    sseq: [[sense(
      "1",
      "{bc}having great {a_link|volume} or bulk {bc}{sx|large||}",
    )]],
  });
  const record = selectMwRecord("volume", [candidate]);

  assert.deepEqual(record.definition, {
    text: "having great volume or bulk : large",
    part_of_speech: "adjective",
    source: "mw-collegiate",
  });
  assert.equal("shortdef" in record.definition, false);
});

test("uses one shortdef only for one eligible unit without dt text", () => {
  const candidate = entry({
    fl: "trademark",
    sseq: [[senseWithoutDefinition("1")]],
    shortdef: ["synthetic fallback definition"],
  });
  const record = selectMwRecord("volume", [candidate]);

  assert.equal(record.mw_entry_id, "volume:1");
  assert.equal(record.mw_unit_id, "1");
  assert.deepEqual(record.definition, {
    text: "synthetic fallback definition",
    part_of_speech: "trademark",
    source: "mw-collegiate",
  });
});

test("normal dt definition wins when shortdef is also present", () => {
  const candidate = entry({
    sseq: [[sense("1", "{bc}synthetic normal definition")]],
    shortdef: ["synthetic fallback definition"],
  });

  assert.equal(
    selectMwRecord("volume", [candidate]).definition.text,
    "synthetic normal definition",
  );
});

test("shortdef cannot choose among multiple eligible units", () => {
  const candidate = entry({
    sseq: [[senseWithoutDefinition("1"), senseWithoutDefinition("2")]],
    shortdef: ["synthetic fallback definition"],
  });

  assert.throws(
    () => selectMwRecord("volume", [candidate]),
    expectCode(PIPELINE_CODES.NO_DEFINING_TEXT),
  );
});

test("shortdef cannot choose among multiple exact entries", () => {
  const response = [
    entry({
      id: "volume:1",
      sseq: [[senseWithoutDefinition("1")]],
      shortdef: ["synthetic first entry fallback"],
    }),
    entry({
      id: "volume:2",
      sseq: [[senseWithoutDefinition("1")]],
      shortdef: ["synthetic second entry fallback"],
    }),
  ];

  assert.throws(
    () => selectMwRecord("volume", response),
    expectCode(PIPELINE_CODES.NO_DEFINING_TEXT),
  );
});

test("multiple shortdefs block fallback", () => {
  const candidate = entry({
    sseq: [[senseWithoutDefinition("1")]],
    shortdef: ["synthetic first", "synthetic second"],
  });

  assert.throws(
    () => selectMwRecord("volume", [candidate]),
    expectCode(PIPELINE_CODES.NO_DEFINING_TEXT),
  );
});

test("absent and empty shortdef values block fallback", () => {
  const candidates = [
    entry({ sseq: [[senseWithoutDefinition("1")]] }),
    entry({ sseq: [[senseWithoutDefinition("1")]], shortdef: [] }),
    entry({ sseq: [[senseWithoutDefinition("1")]], shortdef: [""] }),
    entry({ sseq: [[senseWithoutDefinition("1")]], shortdef: ["   "] }),
  ];

  for (const candidate of candidates) {
    assert.throws(
      () => selectMwRecord("volume", [candidate]),
      expectCode(PIPELINE_CODES.NO_DEFINING_TEXT),
    );
  }
});

test("shortdef fallback uses the existing MW renderer", () => {
  const candidate = entry({
    sseq: [[senseWithoutDefinition("1")]],
    shortdef: ["{bc}synthetic {it}fallback{/it} {bc}{sx|reference||}"],
  });

  assert.equal(
    selectMwRecord("volume", [candidate]).definition.text,
    "synthetic fallback : reference",
  );
});

test("unresolved markup in shortdef fallback remains an error", () => {
  const candidate = entry({
    sseq: [[senseWithoutDefinition("1")]],
    shortdef: ["{bc}synthetic {mystery} fallback"],
  });

  assert.throws(
    () => selectMwRecord("volume", [candidate]),
    expectCode(PIPELINE_CODES.MW_MARKUP_REMAINS),
  );
});

test("unresolved markup in selected definition fails", () => {
  const candidate = entry({ sseq: [[sense("1", "{bc}a {mystery} definition")]] });
  assert.throws(
    () => selectMwRecord("volume", [candidate]),
    expectCode(PIPELINE_CODES.MW_MARKUP_REMAINS),
  );
});

test("selected unit chooses first attributed matching vis", () => {
  const candidate = entry({
    sseq: [[sense("1", "definition", {
      vis: [
        { t: "volume without attribution" },
        {
          t: "A {it}volume{/it} rested on the shelf.",
          aq: { auth: "Synthetic Author", source: "{it}Synthetic Journal{/it}", aqdate: "2026" },
        },
        { t: "Another volume.", aq: { source: "Later Source" } },
      ],
    })]],
  });

  assert.deepEqual(selectMwRecord("volume", [candidate]).example, {
    text: "A volume rested on the shelf.",
    kind: "vis",
    form_matched: "volume",
    attribution: {
      author: "Synthetic Author",
      source: "Synthetic Journal",
      date: "2026",
    },
  });
});

test("unattributed vis yields a valid null example", () => {
  const candidate = entry({
    sseq: [[sense("1", "definition", {
      vis: [{ t: "A volume rested on the shelf." }],
    })]],
  });
  assert.equal(selectMwRecord("volume", [candidate]).example, null);
});

test("attributed inflected stem succeeds and records actual matched casing", () => {
  const candidate = entry({
    word: "instagram",
    stems: ["instagram", "instagramming"],
    prs: [{ mw: "synthetic", sound: { audio: "instag01" } }],
    sseq: [[sense("1", "definition", {
      vis: [{
        t: "She was Instagramming the synthetic event.",
        aq: { source: "Synthetic Journal" },
      }],
    })]],
  });

  const example = selectMwRecord("instagram", [candidate]).example;
  assert.equal(example.form_matched, "Instagramming");
});

test("attributed vis without a headword or stem match fails", () => {
  const candidate = entry({
    sseq: [[sense("1", "definition", {
      vis: [{ t: "An unrelated synthetic sentence.", aq: { auth: "Synthetic Author" } }],
    })]],
  });
  assert.throws(
    () => selectMwRecord("volume", [candidate]),
    expectCode(PIPELINE_CODES.EXAMPLE_HEADWORD_MISMATCH),
  );
});

test("example cannot leak from a sibling semantic unit", () => {
  const candidate = entry({
    sseq: [[
      sense("1", "selected definition"),
      sense("2", "sibling definition", {
        vis: [{ t: "A volume in the sibling.", aq: { source: "Synthetic Source" } }],
      }),
    ]],
  });

  const record = selectMwRecord("volume", [candidate], {
    override: { entry_id: "volume:1", unit: "1" },
  });
  assert.equal(record.example, null);
});

test("example cannot leak from uros, supplemental examples, or ldq", () => {
  const leaked = { t: "A volume outside the selected unit.", aq: { source: "Synthetic Source" } };
  const candidate = entry({
    uros: [{ utxt: [["vis", [leaked]]] }],
    suppl: { examples: [leaked], ldq: [leaked] },
    quotes: [leaked],
  });

  assert.equal(selectMwRecord("volume", [candidate]).example, null);
});

test("missing part of speech fails with its pipeline code", () => {
  const candidate = entry({ fl: "" });
  assert.throws(
    () => selectMwRecord("volume", [candidate]),
    expectCode(PIPELINE_CODES.NO_PART_OF_SPEECH),
  );
});

test("selection helper returns the exact entry and semantic unit", () => {
  const candidate = entry();
  const selected = selectMwEntryAndUnit("volume", [candidate]);
  assert.strictEqual(selected.entry, candidate);
  assert.equal(selected.unit.id, "1");
  assert.equal(selected.unit.dtText, "{bc}a synthetic definition");
});
