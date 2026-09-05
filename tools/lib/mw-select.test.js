import test from "node:test";
import assert from "node:assert/strict";

import { MwPipelineError, PIPELINE_CODES } from "./mw-errors.js";
import {
  findExactMwEntries,
  selectMwEntryAndUnit,
  selectMwRecord,
} from "./mw-select.js";

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

test("two exact homograph entries are ambiguous without override", () => {
  const response = [entry({ id: "volume:1" }), entry({ id: "volume:2" })];
  assert.throws(
    () => selectMwRecord("volume", response),
    expectCode(PIPELINE_CODES.AMBIGUOUS_ENTRY),
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
