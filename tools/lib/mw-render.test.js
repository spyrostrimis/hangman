import test from "node:test";
import assert from "node:assert/strict";

import { MW_MARKUP_REMAINS, renderMwMarkup } from "./mw-render.js";

test("renders the dejection definition oracle", () => {
  assert.equal(
    renderMwMarkup(
      "{bc}a state of sadness {bc}depression of spirits {bc}{sx|dejection||}",
    ),
    "a state of sadness : depression of spirits : dejection",
  );
});

test("renders the volume definition oracle without losing link text", () => {
  assert.equal(
    renderMwMarkup(
      "{bc}having or marked by great {a\\_link|volume} or bulk {bc}{sx|large||}",
    ),
    "having or marked by great volume or bulk : large",
  );
});

test("strips a trailing sense suffix from displayed cross-reference text", () => {
  assert.equal(
    renderMwMarkup("{sx|dejected:1|dejected:1|}"),
    "dejected",
  );
});

test("preserves the contents of inline display wrappers", () => {
  assert.equal(renderMwMarkup("a {wi}marked{/wi} word"), "a marked word");
  assert.equal(renderMwMarkup("a {qword}quoted{/qword} word"), "a quoted word");
  assert.equal(renderMwMarkup("an {it}italic{/it} word"), "an italic word");
});

test("renders the supported formatting and word-marking families", () => {
  assert.equal(
    renderMwMarkup(
      "{ldquo}{sc}Alpha{/sc}{rdquo} H{inf}2{/inf} x{sup}2{/sup} "
        + "{parahw}headword{/parahw} {phrase}turn of phrase{/phrase} "
        + "{gloss}=meaning{/gloss}",
    ),
    "“Alpha” H2 x2 headword turn of phrase [=meaning]",
  );
});

test("renders link, directional-reference, and more-at families", () => {
  assert.equal(
    renderMwMarkup(
      "{et\\_link|root|root:1} {d\\_link|pensive|pensive} "
        + "{ma}more at {mat|mind|}{/ma} {dxt|draft:1||8}",
    ),
    "root pensive more at mind draft 8",
  );
});

test("renders date-sense tokens and omits an empty date sense", () => {
  assert.equal(
    renderMwMarkup("before 12th century{ds|t|1|a|1}"),
    "before 12th century in the meaning defined at transitive sense 1a(1)",
  );
  assert.equal(renderMwMarkup("before 12th century{ds||||}"), "before 12th century");
});

test("keeps unknown markup detectable instead of silently deleting it", () => {
  const known = renderMwMarkup("{it}known{/it}");
  const unknown = renderMwMarkup("before {mystery|payload} after");

  assert.doesNotMatch(known, MW_MARKUP_REMAINS);
  assert.match(unknown, MW_MARKUP_REMAINS);
  assert.equal(unknown, "before {mystery|payload} after");
});

test("can report unknown tokens while preserving them", () => {
  const encountered = [];
  const output = renderMwMarkup("{unknown}text{/unknown}", {
    onUnknown: (token) => encountered.push(token),
  });

  assert.equal(output, "{unknown}text{/unknown}");
  assert.deepEqual(encountered, ["{unknown}", "{/unknown}"]);
});
