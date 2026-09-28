# Illucia solver and benchmark (I3)

Run from the repository root with Node 24:

```sh
node tools/benchmark-illucia.js
```

This writes `tools/benchmarks/illucia-i3.json`. The default sample is 250 words
per length, lengths 3-15: 3,250 games per policy, 16,250 games total. Allow several
minutes. A small smoke run without overwriting the committed report:

```sh
node tools/benchmark-illucia.js --per-length 5 --output tools/output/illucia-smoke.json
```

Options: `--per-length N`, `--seed N` (default 20260928),
`--policies frequency,count,entropy,risk,lookahead`, `--output PATH`.
`npm run benchmark:illucia` from `tools/` runs the defaults.

## Runtime boundary

The modules live in `client/src/lib/illucia/` and have no React, network, Node,
model or DOM dependencies. No page imports them yet.

1. `parseLexicon(text, length)` validates one sorted I2 word file.
2. `isAcceptedWord(word, entries)` checks the full accepted vocabulary.
3. `createKnowledge(entries, maxSize)` chooses the solver's vocabulary separately
   and precomputes word-presence frequency. Default size is 70 (Master).
4. `toPublicState(round)` copies only length, pattern, guessed letters, missed
   letters and misses left. The snapshot and its arrays are frozen. A private
   WeakSet ensures callers cannot accidentally pass a round or an object with
   extra answer fields to the solver. Snapshots are process-local, not serialized.
5. `chooseLetter(publicState, knowledge)` uses candidate hit-counting and returns
   one lowercase letter, or `null` after the round ends.
6. The caller applies that letter through the existing `applyGuess` game core.

Candidate filtering requires exact revealed positions, excludes every guessed
letter from hidden positions, and requires the same length. With E guessed at
`E _ _ _ E`, EAGLE survives and EERIE does not. Input collections are never mutated.

`analyzeDecision` exposes candidate count and selected-letter hit count for
benchmarking and eventual explanations. Its optional policy parameter is for
the benchmark; `chooseLetter` always retains the agreed baseline.

Master's empty candidate set throws an invariant error. At lower tiers, an empty
set selects the unused letter with the highest precomputed word-presence count
in that tier's vocabulary of the same length. Counts never include higher-tier
words, and repeated occurrences in one word count once. Ties are alphabetical,
including when all remaining counts are zero or the tier's length bucket is empty.
No vocabulary widening is performed. `analyzeDecision` reports `fallback: true`,
zero candidates and zero candidate hits for fallback decisions.

The supported tiers are exported as `VOCABULARY_TIERS`: Apprentice (35),
Scholar (50), Master (70). See [the I3b measurements](ILLUCIA-TIERS.md).

## Precisely defined policies

All candidates have equal weight. Letters are examined alphabetically, with
alphabetical tie-breaking after the scores below.

| Policy | Score maximized |
| --- | --- |
| A `frequency` | Fixed word-presence count in the full knowledge vocabulary of this length, ignoring revealed feedback when ranking letters. |
| B `count` | Number of surviving candidate words containing the letter, counting each word once. Production baseline. |
| C `entropy` | Shannon entropy of complete position-mask outcomes, including a miss bucket; then hit count. |
| D `risk` | Entropy × (hit probability)²; then hit count. The exponent is fixed at 2. |
| E `lookahead` | D normally. With ≤12 candidates and ≤2 misses left, exact two-turn search maximizes probability of solving within the horizon, then probability of surviving it, then D's scores. |

The search branches on complete reveal masks, decrements lives only for a miss,
stops at solved/lost branches, excludes guessed letters, and chooses the best
second action separately for each observed first outcome. Survival includes
already-solved branches. This is a bounded endgame heuristic, not a claim of
optimal whole-game play. Risk and lookahead definitions here are explicit
benchmark candidates; no unspecified earlier simulation implementation is assumed.

## Reproducibility and report

Every length file is verified against the I2 manifest before use. A seeded
Mulberry32 generator drives a Fisher-Yates shuffle of the canonical sorted
entries; seed + length provides independent deterministic samples. All policies
play exactly the same words, without replacement, using the shared game core.
The report records manifest and sample SHA-256 hashes and Node/platform details.

The report includes overall and per-length win rates, average misses/turns,
decision p50/p95 milliseconds, candidate-size mean/p50/p95/max, and difficult
groups by distinct-letter count and source vocabulary size, plus 20 hardest
individual words (losses first, then misses, then turns). Source-size groups
describe the player's sampled word, not a lower-tier solver.

Candidate counts are measured before each guess. Decision timing includes
filtering and ranking, excludes file parsing, knowledge setup and adjudication,
and is measured on the current desktop without a warmup phase. Timing fields
vary between runs and are not a phone-performance measurement. Equal samples
per length mean the overall rate is length-balanced, not dictionary-weighted or
representative of adversarial human choices.

Zero-candidate counts are split into expected low-tier and Master-bug fields.
Expected low-tier events are zero in I3 because it runs only Master. A Master
invariant failure aborts the benchmark rather than silently reporting a completed
run. The shared simulator also asserts that in-tier answers never lose all
candidates. Current reports additionally count out-of-vocabulary games and games
that enter fallback. The committed I3 report was regenerated after the
lemma-form profanity filter changed the vocabulary, so it uses the current schema.

Tests: `npm test` in `client/` and `tools/`. Coverage includes secret isolation,
exact repeated-letter positions, whole-word hit counts, ties, policy differences,
no repeated guesses, stopping after either result, deterministic sampling,
six-miss adjudication, and report arithmetic. Six isolated code mutations were
detected: hidden-hit acceptance, answer leakage, occurrence counting, removal of
terminal checks, removal of the risk penalty, and disabling lookahead.

I3b implements the lower-tier fallback and measurements; I4 adds asset loading and UI.

## Recorded I3 result

The committed `benchmarks/illucia-i3.json` contains the full 16,250-game run.
All policies had zero Master invariant failures.

| Policy | Solved / 3,250 | Win rate | Mean misses | Decision p50 / p95 (ms) |
| --- | --- | --- | --- | --- |
| Global frequency | 485 | 14.92% | 5.6680 | 1.18 / 5.53 |
| Count (baseline) | 2,796 | 86.03% | 2.0554 | 1.39 / 10.28 |
| Entropy | 2,788 | 85.78% | 2.1052 | 1.40 / 12.46 |
| Risk-adjusted entropy | 2,799 | 86.12% | 2.0298 | 1.43 / 13.01 |
| Risk + lookahead | 2,792 | 85.91% | 2.0317 | 1.45 / 13.34 |

Count remains the production choice. The best challenger gained only three wins
(0.09 percentage points) on this fixed sample, insufficient evidence of a clear
improvement. No statistical significance or optimality is claimed.

Count's win rates by length 3 through 9 were 27.2%, 40.8%, 67.6%, 89.6%, 94.8%,
98.8% and 99.6%. It solved all 250 sampled words at each length 10 through 15; that is
sample evidence, not a guarantee for every word. I3b will measure how the lower
knowledge ceilings change these results with the required fallback.
