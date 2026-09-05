import test from "node:test";
import assert from "node:assert/strict";

import {
  MwStructureError,
  walkMwDefinitions,
  walkMwEntry,
  walkMwSseq,
} from "./mw-walk.js";

const sense = (sn, text, extra = {}) => [
  "sense",
  {
    ...(sn === undefined ? {} : { sn }),
    ...(text === undefined ? {} : { dt: [["text", text]] }),
    ...extra,
  },
];

test("normalizes ordinary numbered senses with elided parent numbers", () => {
  const units = walkMwSseq([
    [sense("1 a", "one-a"), sense("b", "one-b")],
    [sense("2 a", "two-a"), sense("b", "two-b")],
  ]);

  assert.deepEqual(
    units.map(({ id, dtText }) => ({ id, dtText })),
    [
      { id: "1a", dtText: "one-a" },
      { id: "1b", dtText: "one-b" },
      { id: "2a", dtText: "two-a" },
      { id: "2b", dtText: "two-b" },
    ],
  );
});

test("normalizes full and contextual hierarchical ordinary sense numbers", () => {
  const units = walkMwSseq([[
    sense("1 a", "parent"),
    sense("b (1)", "contextual child"),
    sense("1 c (1)", "full child"),
  ]]);

  assert.deepEqual(units.map(({ id }) => id), ["1a", "1b(1)", "1c(1)"]);
  assert.throws(
    () => walkMwSseq([[sense("b (1)", "missing major")]]),
    (error) => error instanceof MwStructureError && error.raw[1].sn === "b (1)",
  );
});

test("assigns id 1 to an unnumbered independently selectable sense", () => {
  assert.deepEqual(walkMwSseq([[sense(undefined, "only meaning")]]), [
    { id: "1", sls: [], eligible: true, dtText: "only meaning", vis: [] },
  ]);
});

test("emits an sdsense as a separate semantic unit with exact examples", () => {
  const parentVis = [{ t: "parent example" }];
  const dividedVis = [{ t: "divided example" }];
  const units = walkMwSseq([[
    sense("1 a", "parent definition", {
      dt: [["text", "parent definition"], ["vis", parentVis]],
      sls: ["parent label"],
      sdsense: {
        sd: "also",
        sls: ["divided label"],
        dt: [["text", "divided definition"], ["vis", dividedVis]],
      },
    }),
  ]]);

  assert.deepEqual(units, [
    {
      id: "1a",
      sls: ["parent label"],
      eligible: true,
      dtText: "parent definition",
      vis: parentVis,
    },
    {
      id: "1a:sd",
      sls: ["parent label", "divided label"],
      eligible: true,
      dtText: "divided definition",
      vis: dividedVis,
    },
  ]);
});

test("sen supplies numbering and archaic status to its child senses", () => {
  const units = walkMwSseq([[
    ["sen", { sn: "2", sls: ["ArChAiC"] }],
    sense("a", "old-a"),
    sense("b", "old-b"),
    sense("c", "old-c"),
  ]]);

  assert.deepEqual(
    units.map(({ id, sls, eligible }) => ({ id, sls, eligible })),
    [
      { id: "2a", sls: ["ArChAiC"], eligible: false },
      { id: "2b", sls: ["ArChAiC"], eligible: false },
      { id: "2c", sls: ["ArChAiC"], eligible: false },
    ],
  );
});

test("pseq and bs retain the binding parent in canonical ids", () => {
  const units = walkMwSseq([[
    sense("1 a", "first"),
    [
      "pseq",
      [
        ["bs", { sense: { sn: "c", dt: [["text", "binding definition"]] } }],
        sense("(1)", "child one"),
        sense("(2)", "child two"),
      ],
    ],
  ]]);

  assert.deepEqual(
    units.map(({ id, dtText }) => ({ id, dtText })),
    [
      { id: "1a", dtText: "first" },
      { id: "1c", dtText: "binding definition" },
      { id: "1c(1)", dtText: "child one" },
      { id: "1c(2)", dtText: "child two" },
    ],
  );
});

test("pseq accepts a full hierarchical number without a binding substitute", () => {
  const units = walkMwSseq([[["pseq", [
    sense("1 a (1)", "child one"),
  ]]]]);

  assert.deepEqual(units.map(({ id }) => id), ["1a(1)"]);
});

test("pseq resolves a contextual hierarchical number from the current major", () => {
  const units = walkMwSseq([[
    sense("1 a", "first"),
    ["pseq", [sense("b (1)", "child one")]],
  ]]);

  assert.deepEqual(units.map(({ id }) => id), ["1a", "1b(1)"]);
});

test("pseq full hierarchy establishes the base for a bare sibling", () => {
  const units = walkMwSseq([[["pseq", [
    sense("1 a (1)", "child one"),
    sense("(2)", "child two"),
  ]]]]);

  assert.deepEqual(units.map(({ id }) => id), ["1a(1)", "1a(2)"]);
});

test("pseq permits an ordinary full number used by a real structural wrapper", () => {
  const units = walkMwSseq([[["pseq", [sense("1 a", "wrapped ordinary sense")]]]]);
  assert.deepEqual(units.map(({ id }) => id), ["1a"]);
});

test("bare parenthesized number requires a base in the same structural group", () => {
  const related = [[
    sense("1 a", "parent"),
    ["pseq", [sense("(1)", "related child")]],
  ]];
  const unrelated = [
    [sense("1 a", "different group")],
    [["pseq", [sense("(1)", "unbound child")]]],
  ];
  const unrelatedDefinitions = [
    { sseq: [[sense("1 a", "different definition")]] },
    { sseq: [[["pseq", [sense("(1)", "unbound child")]]]] },
  ];

  assert.deepEqual(walkMwSseq(related).map(({ id }) => id), ["1a", "1a(1)"]);
  assert.throws(
    () => walkMwSseq(unrelated),
    (error) => error instanceof MwStructureError
      && /no binding parent/.test(error.message)
      && error.raw[1].sn === "(1)",
  );
  assert.throws(
    () => walkMwDefinitions(unrelatedDefinitions),
    (error) => error instanceof MwStructureError
      && /no binding parent/.test(error.message)
      && error.raw[1].sn === "(1)",
  );
});

test("rejects an unknown structural shape loudly and reports the raw tuple", () => {
  const reported = [];
  const raw = ["mystery", { payload: true }];

  assert.throws(
    () => walkMwSseq([[raw]], { onUnknownStructure: (shape) => reported.push(shape) }),
    (error) => {
      assert.ok(error instanceof MwStructureError);
      assert.match(error.message, /mystery/);
      assert.strictEqual(error.raw, raw);
      return true;
    },
  );
  assert.deepEqual(reported, [raw]);
});

test("reports ignored dt types without corrupting text and vis pairing", () => {
  const encountered = [];
  const ownVis = [{ t: "belongs to definition" }];
  const nestedVis = [{ t: "must not leak" }];
  const units = walkMwSseq([[[
    "sense",
    {
      sn: "1",
      dt: [
        ["text", "the definition"],
        ["snote", [["vis", nestedVis]]],
        ["ca", { intro: "called also" }],
        ["uns", [["text", "usage note"], ["vis", nestedVis]]],
        ["vis", ownVis],
      ],
    },
  ]]], { onDtType: (event) => encountered.push(event) });

  assert.equal(units[0].dtText, "the definition");
  assert.deepEqual(units[0].vis, ownVis);
  assert.deepEqual(
    encountered.map(({ type, unitId, known }) => ({ type, unitId, known })),
    [
      { type: "snote", unitId: "1", known: true },
      { type: "ca", unitId: "1", known: true },
      { type: "uns", unitId: "1", known: true },
    ],
  );
});

test("preserves a null dtText when a selectable sense has no definition", () => {
  assert.deepEqual(walkMwSseq([[sense("1", undefined, { dt: [["snote", {}]] })]]), [
    { id: "1", sls: [], eligible: true, dtText: null, vis: [] },
  ]);
});

test("entry walking excludes uros and supplemental examples and ldq", () => {
  const entry = {
    def: [{ sseq: [[sense("1", "headword definition")]] }],
    uros: [{ uref: "run-on", utxt: [["vis", [{ t: "uros leak" }]]] }],
    suppl: {
      examples: [{ t: "supplemental example leak" }],
      ldq: [{ t: "ldq leak" }],
    },
  };

  assert.deepEqual(walkMwEntry(entry), [
    { id: "1", sls: [], eligible: true, dtText: "headword definition", vis: [] },
  ]);
});

test("definition and sense labels combine and obsolete is ineligible", () => {
  const units = walkMwDefinitions([{
    sls: ["technical"],
    sseq: [[sense("1", "old meaning", { sls: ["OBSOLETE"] })]],
  }]);

  assert.deepEqual(units[0].sls, ["technical", "OBSOLETE"]);
  assert.equal(units[0].eligible, false);
});
