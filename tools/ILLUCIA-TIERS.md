# Illucia vocabulary tiers and fallback (I3b)

```sh
node tools/benchmark-illucia-tiers.js
```

Or run `npm run benchmark:illucia-tiers` from `tools/`. Node 24; no network.
The committed report is `tools/benchmarks/illucia-i3b.json`.

All three tiers use candidate hit-counting weighted by commonness (v2 A1: size
≤35 → 10, 40–50 → 3, 55–70 → 1) and identical game rules. Apprentice knows size ≤35,
Scholar ≤50, Master ≤70. Apprentice knows only size-35 words, so for her the
weighting changes nothing. The fallback below stays unweighted.

Since v2 A2 the benchmark plays her temperament (seeded; see
[docs/ILLUCIA-STRENGTH.md](../docs/ILLUCIA-STRENGTH.md)): every sampled word is played
with 8 seeds, the same at every tier, and rates are over all games. The strict A1
figures (one deterministic game per word, alphabetical ties) are kept in brackets.
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
source-size band**, lengths 4–15. Bands: common =35, medium =40–50, rare =55–70.
Every tier plays the same samples. Small strata use all available words; actual
counts are recorded. The current corpus supplies 100 words in every stratum:
3,600 words per tier, 10,800 games in total.

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
source-size band (100 per length). Values are **Illucia's** win rate, with
commonness weighting (v2 A1); the unweighted figures are in brackets:

| Player's word | Apprentice ≤35 | Scholar ≤50 | Master ≤70 |
| --- | --- | --- | --- |
| Common (=35) | 93.4% | 93.4% (90.8%) | 93.0% (88.4%) |
| Less common (40–50) | 9.4% | 88.4% (92.0%) | 88.2% (90.4%) |
| Rare (55–70) | 9.0% | 9.2% (11.4%) | 83.6% (90.6%) |

Weighting removes the inversion on common words and costs the higher tiers some
strength on the rarer words they know.

With her temperament (v2 A2, 8 seeds per word) the same cells read: common 92.0% /
91.7% / 91.6%, less common 9.4% / 88.3% / 88.8%, rare 9.0% / 9.8% / 83.3%
(Apprentice / Scholar / Master).

Across the full balanced 4–15-letter sample:

| Tier | Wins / 28,800 games | Win rate (A1) | Games using fallback | Zero-candidate decisions |
| --- | --- | --- | --- | --- |
| Apprentice | 11,678 | 40.55% (40.56%) | 17,246 | 132,422 expected |
| Scholar | 18,740 | 65.07% (65.03%) | 8,335 | 62,577 expected |
| Master | 25,912 | 89.97% (89.97%) | 0 | 0 |

Temperament (v2 A2), 3,600 words × 8 seeds. A1 played each word once, weighted;
unweighted, Scholar solved 65.69% and Master 91.00%. Distinct guess sequences per word
over its 8 seeds: Apprentice 5.96, Scholar 6.33, Master 6.56; distinct opening letters
6 / 4 / 4.

Regenerated after the lemma-form profanity filter changed the vocabulary
(see [ILLUCIA-WORDS.md](ILLUCIA-WORDS.md)); the seeded samples changed with it.
Regenerated again on 2026-10-02 after 3-letter words were removed (v2 A1). Each
stratum's seed depends only on seed, length and band, so the samples for lengths
4–15 and every length's results are unchanged; only the 300 three-letter words per
tier are gone. The unweighted 5–9-letter figures were identical.

There were no in-tier zero-candidate failures. For the lower tiers, all fallback
events were on words outside their vocabulary. The tier labels describe breadth
of knowledge: the small decrease on common words at Master is consistent with
the larger candidate set. These sample results support distinct difficulty
choices, but do not establish universal win probabilities or strict per-word
ordering. They replace the plan's preliminary SCOWL v1 / ETAOIN tier estimates.
