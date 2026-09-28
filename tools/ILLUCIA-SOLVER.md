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

Master's empty candidate set throws an invariant error. Lower-tier knowledge
can be constructed, but an empty lower-tier set explicitly throws until I3b
implements the specified fallback. I3 makes no difficulty/win-rate claims for
lower tiers. No vocabulary widening is performed.

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
Expected low-tier events are zero because I3 runs only Master. A Master invariant
failure aborts the benchmark rather than silently reporting a completed run.

Tests: `npm test` in `client/` and `tools/`. Coverage includes secret isolation,
exact repeated-letter positions, whole-word hit counts, ties, policy differences,
no repeated guesses, stopping after either result, deterministic sampling,
six-miss adjudication, and report arithmetic. Six isolated code mutations were
detected: hidden-hit acceptance, answer leakage, occurrence counting, removal of
terminal checks, removal of the risk penalty, and disabling lookahead.

I3b adds low-tier fallback and tier measurements; I4 adds asset loading and UI.

## Recorded I3 result

The committed `benchmarks/illucia-i3.json` contains the full 16,250-game run.
All policies had zero Master invariant failures.

| Policy | Solved / 3,250 | Win rate | Mean misses | Decision p50 / p95 (ms) |
| --- | --- | --- | --- | --- |
| Global frequency | 475 | 14.62% | 5.6723 | 1.21 / 5.58 |
| Count (baseline) | 2,769 | 85.20% | 2.0865 | 1.45 / 10.65 |
| Entropy | 2,762 | 84.98% | 2.1468 | 1.45 / 13.39 |
| Risk-adjusted entropy | 2,777 | 85.45% | 2.0615 | 1.44 / 13.16 |
| Risk + lookahead | 2,774 | 85.35% | 2.0615 | 1.45 / 13.64 |

Count remains the production choice. The best challenger gained only eight wins
(0.25 percentage points) on this fixed sample, insufficient evidence of a clear
improvement. No statistical significance or optimality is claimed.

Count's win rates by length 3 through 8 were 22.4%, 42.0%, 66.0%, 84.8%, 93.6%,
and 98.8%. It solved all 250 sampled words at each length 9 through 15; that is
sample evidence, not a guarantee for every word. I3b will measure how the lower
knowledge ceilings change these results with the required fallback.
