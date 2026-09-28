# Illucia vocabulary tiers and fallback (I3b)

```sh
node tools/benchmark-illucia-tiers.js
```

Or run `npm run benchmark:illucia-tiers` from `tools/`. Node 24; no network.
The committed report is `tools/benchmarks/illucia-i3b.json`.

All three tiers use candidate hit-counting, identical game rules and deterministic
alphabetical tie-breaking. Apprentice knows size ≤35, Scholar ≤50, Master ≤70.
The full size ≤70 list still determines whether a player's word is accepted.

If feedback rules out every candidate at a lower tier, its next guess comes from
its **own** length bucket's precomputed word-presence frequencies. Guessed letters
are excluded. If all unused counts are zero (including an empty bucket), choose
alphabetically. No broader vocabulary, hard-coded ETAOIN ranking or random errors
are used. A word not known by a tier may still be solved before or during fallback.
Fallback is recomputed from public feedback each turn; no state survives a round.

An empty Master candidate set is a bug and throws. The simulator additionally
asserts that an answer in any tier's vocabulary never produces zero candidates.
Only out-of-tier answers at Apprentice/Scholar can produce expected zero events.

## Sample and interpretation

The benchmark samples up to 100 words without replacement from **each length ×
source-size band**, lengths 3–15. Bands: common =35, medium =40–50, rare =55–70.
Every tier plays the same samples. Small strata use all available words; actual
counts are recorded. The current corpus supplies 100 words in every stratum:
3,900 words per tier, 11,700 games in total.

Seed 20260928; the shared seeded shuffle uses seed + length ×3 + band index.
The report records source-manifest and sample SHA-256 hashes, environment,
per-length vocabulary sizes, overall metrics, bands, length × band metrics, and
a separate 5–9-letter comparison matching the length range in the planning table.

Zero-candidate **events** count decisions taken with no candidates, so one game
can contribute several. `gamesUsingFallback` counts affected games once.
`outOfVocabularyGames` includes out-of-tier answers even if the round ends before
the candidate set empties. Master-bug counts must remain zero; invariant errors
abort the run. Existing I3 timing/candidate-size definitions apply here too.

These rates describe a balanced random sample, not human-selected adversarial
words. Overall results are balanced across lengths and source-size bands, unlike
I3's length-only sampling. Do not compare the two overall percentages directly.
Larger vocabularies need not win more often on every individual word: extra
candidates can change guesses. Difficulty represents vocabulary knowledge, not
a promise of monotonically increasing success for every word.

Options: `--per-stratum N`, `--seed N`, `--output PATH`. A quick independent run:

```sh
node tools/benchmark-illucia-tiers.js --per-stratum 2 --output tools/output/illucia-tier-smoke.json
```

Tests cover distinct tier frequencies, word-presence counting, no vocabulary
widening, guessed-letter exclusion, empty buckets, terminal states, fallback wins
and losses, event-vs-game reporting, and deterministic band sampling. Five isolated
mutations were caught: widening the vocabulary, ignoring frequencies, repeating
guesses, disabling the Master guard, and counting letter occurrences instead of
word presence. Two independent real-corpus smoke runs produced identical
non-timing results. All 100 recorded hardest-game traces from I3 were replayed
without changing any Master guesses or outcomes.

## Recorded result and tier decision

The evidence supports Apprentice ≤35 / Scholar ≤50 / Master ≤70. These labels
and ceilings are now exported for the future I4 setup screen. Keep candidate
hit-counting for all three; there are no deliberate mistakes.

For the plan's 5–9-letter comparison, each cell uses the same 500 words in that
source-size band (100 per length). Values are **Illucia's** win rate:

| Player's word | Apprentice ≤35 | Scholar ≤50 | Master ≤70 |
| --- | --- | --- | --- |
| Common (=35) | 92.8% | 92.6% | 89.0% |
| Less common (40–50) | 9.8% | 91.8% | 89.6% |
| Rare (55–70) | 11.0% | 12.8% | 90.4% |

Across the full balanced 3–15-letter sample:

| Tier | Wins / 3,900 | Win rate | Games using fallback | Zero-candidate decisions |
| --- | --- | --- | --- | --- |
| Apprentice | 1,541 | 39.51% | 2,196 | 16,766 expected |
| Scholar | 2,454 | 62.92% | 1,054 | 7,893 expected |
| Master | 3,353 | 85.97% | 0 | 0 |

There were no in-tier zero-candidate failures. For the lower tiers, all fallback
events were on words outside their vocabulary. The tier labels describe breadth
of knowledge: the small decrease on common words at Master is consistent with
the larger candidate set. These sample results support distinct difficulty
choices, but do not establish universal win probabilities or strict per-word
ordering. They replace the plan's preliminary SCOWL v1 / ETAOIN tier estimates.
