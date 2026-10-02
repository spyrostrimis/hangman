# Illucia's questions: how much they help her (B2)

Measured 2026-10-02 with her strict `'count'` policy, which is A1's play (commonness-weighted
count, no round seed). A2's temperament is now on `main` but is not measured here; that
re-run comes with the follow-up. Measurement only; no page uses the questions yet (E2).

- Module: `client/src/lib/illucia/questions.js` (`chooseQuestion`, `narrowKnowledge`,
  `checkAnswer`, `parseLabels`, `parseCategories`)
- Script: `tools/benchmark-illucia-bets.js` (questions are an optional bet; D1's model
  runner has the `-questions` name). Report: `tools/benchmarks/illucia-bets.json`
- Run: `npm run benchmark:illucia-bets` from `tools/` (3 seeds, about 23 minutes on
  16 cores). For a check, use `node benchmark-illucia-bets.js --quick --output <file>`
  (about a minute).

## How she asks

- **Split rule.** A question qualifies if each answer rules out at least 25% of her
  candidate weight. The weights are the commonness weights (10/3/1), and words WordNet
  doesn't know count in the total. She asks the qualifying question whose worse answer
  rules out the most; ties go by category order.
- **When.** Not before her third guess (`earliestTurn` 2). She makes at most 2 offers per
  round, and a declined offer counts. She never asks about a category twice. By default
  she asks noun categories only.
- **Answers.** YES keeps her candidates labelled with the category; NO keeps those
  without it. Unknown words stay on both sides. A decline tells her nothing.
- **Boundary.** She sees the public board, her vocabulary, the public labels and the
  answers. Only `checkAnswer`, which is game code, sees the secret word.

## Benchmark design

- **Words.** The strength sets: a (manifest), b (common 4–6 letters), c (trickster) and
  d (balanced, 4–15 letters). Each is played at every tier, in eleven arms.
- **Arms.** One arm declines every question (the control). Eight answer the first
  question only, or both. Each uses one of two timings (first chance, or not before her
  third guess) and one of two category sets (nouns, or all 41). Two more are selective
  players, for pricing (see below).
- **Paired.** Every arm plays the same words, and each is compared with the decline arm
  word by word, using an exact two-sided McNemar test.
- **The player** answers honestly with the true WordNet label (any meaning counts). If
  WordNet doesn't know the word, the player declines, because no bonus is possible.
- **Seeds.** 3 seeds (20260928, +7919, +15838). Sets b and d are resampled per seed;
  sets a and c are played once. Question statistics cover lengths 4–10. The tier-order
  gate uses the full cells (4–15) on the first seed, comparable with A1's gate.
- **Positive control.** The decline arm must equal the strength benchmark's own play,
  move for move: **15,723 of 15,723 games match.**

## Results

### How much answering helps her

These are her win rates, with the decline arm first and the answer arm second. The
timing is "not before her third guess", over all sets at lengths 4–10, pooled over 3
seeds (10,920 rounds per tier). Every change has p < 0.0001.

| Tier | Declined | One answered (nouns) | Two answered (nouns) | One answered (all) | Two answered (all) |
|---|---:|---:|---:|---:|---:|
| Apprentice | 51.1% | 55.3% (+4.1) | 57.7% (+6.6) | 55.7% (+4.6) | 58.9% (+7.8) |
| Scholar | 65.6% | 70.0% (+4.4) | 72.5% (+6.9) | 70.4% (+4.8) | 73.9% (+8.3) |
| Master | 78.6% | 83.4% (+4.7) | 85.7% (+7.0) | 84.0% (+5.4) | 87.3% (+8.6) |

Misses saved per round, nouns: about 0.20 with one answer and 0.32 with two. With all
categories: about 0.25 and 0.44.

The help is concentrated on short words. Change in her win rate by length (nouns, third
guess; one / two answered, in points):

| Tier | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|
| Apprentice | +10.2 / +17.0 | +6.1 / +9.4 | +2.2 / +3.2 | +0.4 / +0.3 | +0.1 / +0.0 | −0.2 / −0.3 | −0.1 / −0.1 |
| Scholar | +10.7 / +17.1 | +7.1 / +10.3 | +2.0 / +3.3 | +1.0 / +1.3 | −0.1 / −0.1 | −0.1 / −0.1 | +0.0 / +0.0 |
| Master | +11.2 / +17.1 | +7.5 / +10.4 | +2.0 / +3.4 | +1.4 / +1.6 | +0.3 / +0.3 | +0.0 / +0.0 | +0.0 / +0.0 |

On 4-letter words, two answered questions raise her win rate by 17 points. From 8
letters up they make no difference: she already wins those.

### How often she asks

With nouns and the third-guess rule, she asks in 70% / 65% / 63% of rounds (Apprentice /
Scholar / Master), and twice in 37% / 31% / 29%. With all categories she asks in
91% / 87% / 85% of rounds. Players whose word WordNet doesn't know declined 1,730 /
1,364 / 1,211 offers.

### Timing: first chance vs "not before her third guess"

Her win rate under the third-guess rule minus first chance, word by word:

| Tier | One (nouns) | Two (nouns) | One (all) | Two (all) |
|---|---|---|---|---|
| Apprentice | −0.1 (p 0.42) | −0.2 (p 0.07) | 0.0 (p 1) | −0.1 (p 0.61) |
| Scholar | −0.1 (p 0.52) | −0.2 (p 0.006) | −0.1 (p 0.46) | −0.2 (p 0.005) |
| Master | 0.0 (p 1) | −0.2 (p 0.008) | 0.0 (p 1) | −0.2 (p 0.003) |

The third-guess rule costs her at most 0.2 points. That is statistically detectable
for two questions at Scholar and Master, but it is a twentieth of what a question is
worth to her. **The rule does not remove the broad opener:**

| Tier | Broad first question, first chance → third guess | "Man-made object" first, first chance → third guess | Median candidates at the first question |
|---|---|---|---|
| Apprentice | 98.9% → 98.4% | 84.3% → 76.1% | 1,859 → 93 |
| Scholar | 98.6% → 98.4% | 78.1% → 74.0% | 510 → 117 |
| Master | 98.3% → 98.0% | 77.9% → 74.1% | 700 → 182 |

"Broad" means a whole WordNet lexicographer file (person, animal, man-made object, …),
not a "kind of" class such as bird. Even with far fewer candidates, the question that
splits them evenly is still almost always a broad one. Narrow classes cover too few
words to reach a 25% share. With all categories, "a describing word (an adjective)" and
the verb questions take over much of the opening.

### Nouns vs all categories

All 41 categories beat nouns only by 0.4–0.7 points with one answer and 1.1–1.6 points
with two (p < 0.02 throughout). The extra wins come mostly from the adjective and verb
questions, which are the ones most likely to catch a player out with a meaning they
never thought of.

### Tier-order gate with questions answered

Every answer-both arm passes: 0 of 171 comparisons fail, the same as declining (A1's
gate). The near misses are all at 4 letters, and all have Apprentice ahead of Scholar:
set b (280 vs 267 of 500) when declining; set d's rare band (6 or 5 vs 0 of 100) in every
answer-both arm; and, under third-noun-2, also set d's common band (76 vs 68 of 100).
Holm's correction clears them all.

| Arm | Gate | Failures | Near misses | Lower tier ahead |
|---|---|---|---|---|
| decline (A1) | PASS | 0 of 171 | 1 | 22 |
| first chance, nouns, two | PASS | 0 of 171 | 1 | 26 |
| first chance, all, two | PASS | 0 of 171 | 1 | 18 |
| third guess, nouns, two | PASS | 0 of 171 | 2 | 23 |
| third guess, all, two | PASS | 0 of 171 | 1 | 18 |

### Are the multipliers fairly priced?

Owner decision (2026-10-02): answered questions multiply stump points by **×1.5 for one
and ×2.0 for two**, replacing ×1.25 and ×1.5. Both sets are priced below, from the same
games.

Stump points are tier base × min(length − 3, 3), paid only for in-tier words; the base
cancels in these ratios. The rounds counted are in-tier rounds whose word WordNet knows,
because only those can earn a bonus. The **points ratio** is the player's expected points
under a strategy, divided by their points when they decline every question, with a
bootstrap 95% interval. Above 1, the strategy pays. The **break-even multiplier** is the
bonus that would make answering exactly as good as declining, on rounds where the player
answered at least once.

The players (nouns, third-guess rule):
- **answers the first question** and declines the second;
- **answers both**;
- **answers only on 7+ letters**, where questions barely help her;
- **answers only while at most one letter shows**: early, when a question narrows little;
- **hindsight bound**: per round, the best of declining, answering one or answering both,
  chosen after seeing the result. No real player can reach it; it is the ceiling for
  selective play.

| Tier | Player | Rounds answered | Player wins, declining → answering | Old ×1.25/×1.5 | **New ×1.5/×2.0** | Break-even |
|---|---|---:|---|---:|---:|---:|
| Apprentice | answers the first question | 4,945 of 6,622 | 22.4% → 15.6% | 0.82 (0.78–0.86) | **0.95** (0.90–0.99) | 1.61 |
| Apprentice | answers both | 4,945 of 6,622 | 22.4% → 11.6% | 0.65 (0.61–0.69) | **0.77** (0.72–0.81) | 2.45 |
| Apprentice | only on 7+ letters | 548 of 6,622 | 22.4% → 22.3% | 0.99 (0.99–1.00) | **0.99** (0.99–1.00) | 6.00 |
| Apprentice | only while ≤1 letter shows | 2,821 of 6,622 | 22.4% → 17.1% | 0.89 (0.85–0.92) | **0.99** (0.95–1.03) | 1.55 |
| Apprentice | hindsight bound | — | — | 1.26 | **1.43** | — |
| Scholar | answers the first question | 5,449 of 7,987 | 21.0% → 15.0% | 0.84 (0.80–0.87) | **0.96** (0.92–1.00) | 1.59 |
| Scholar | answers both | 5,449 of 7,987 | 21.0% → 11.7% | 0.68 (0.64–0.71) | **0.79** (0.75–0.83) | 2.32 |
| Scholar | only on 7+ letters | 915 of 7,987 | 21.0% → 20.9% | 0.99 (0.98–1.00) | **0.99** (0.98–1.00) | 3.60 |
| Scholar | only while ≤1 letter shows | 2,698 of 7,987 | 21.0% → 17.0% | 0.93 (0.90–0.96) | **1.03** (0.99–1.06) | 1.44 |
| Scholar | hindsight bound | — | — | 1.26 | **1.42** | — |
| Master | answers the first question | 5,940 of 9,038 | 21.0% → 15.3% | 0.85 (0.82–0.89) | **0.98** (0.94–1.02) | 1.55 |
| Master | answers both | 5,940 of 9,038 | 21.0% → 12.6% | 0.73 (0.70–0.76) | **0.85** (0.81–0.90) | 2.09 |
| Master | only on 7+ letters | 1,196 of 9,038 | 21.0% → 20.8% | 0.99 (0.98–1.00) | **0.99** (0.98–1.01) | 2.29 |
| Master | only while ≤1 letter shows | 2,749 of 9,038 | 21.0% → 17.3% | 0.94 (0.91–0.97) | **1.03** (1.00–1.06) | 1.42 |
| Master | hindsight bound | — | — | 1.26 | **1.43** | — |

At ×1.5 / ×2.0:

- **Answering everything still loses.** Answering only the first question loses slightly:
  2–5% of stump points, with the 95% interval reaching 1.0 at Scholar and Master.
  Answering both loses clearly: 15–23%. The second question is the expensive one. Two
  answers would need about ×2.1–2.45 to break even.
- **Simple selective answering is about even.** Answering only while at most one letter
  shows earns 3% more than declining at Scholar and Master (intervals 0.99–1.06 and
  1.00–1.06) and 1% less at Apprentice. It is not a clear win.
- **Answering only on long words gains nothing.** Players rarely beat her on 7+ letters,
  so the bonus has little to multiply.
- **Skilled selective play has room.** A player who knew which rounds to answer could
  earn up to 1.42–1.43 times the decline strategy's points. Real players sit between the
  simple rules and that bound; how far up depends on how well they read the board.

By set, at the new values (points ratio):

| Tier | Set (rounds) | Answer both | 7+ letters only | ≤1 letter showing | Hindsight |
|---|---|---:|---:|---:|---:|
| Apprentice | b common (4,454) | 0.79 | 1.00 | 1.00 | 1.45 |
| Apprentice | d balanced (2,077) | 0.65 | 0.97 | 0.96 | 1.32 |
| Scholar | b common (4,454) | 0.79 | 1.00 | 1.02 | 1.44 |
| Scholar | d balanced (3,419) | 0.80 | 0.96 | 1.03 | 1.38 |
| Master | b common (4,454) | 0.81 | 1.00 | 1.02 | 1.45 |
| Master | d balanced (4,468) | 0.92 | 0.98 | 1.04 | 1.40 |

Sets a (65–81 rounds) and c (26–35 rounds) are too small to price. The selective arms
also change her strength: answering early raises her win rate by about 3 points
(p < 10⁻⁴²); answering on 7+ letters changes it by at most 0.2 points.

**Cautious case.** "Answer everything" is the cautious pricing case. Real players choose
after seeing the question and the board, and selective players gain more. That holds even
at the new values, where only the simplest rules were measured.

## Caveats

- These are her win rates against fixed word lists, not against real players. Set b's
  "common" words are a seeded sample of ESDB size-35 words.
- The strict policy has no randomness within a round, so the seeds vary only the word
  samples. Under A2's temperament, each seed will also drive her round randomness.
- The re-run with ×1.5 / ×2.0 reproduced the first run (×1.25 / ×1.5) exactly: all 10,397
  shared values, including the old pricing, are identical.
- The honest player answers by WordNet's any-meaning rule. A real player who answers by
  the meaning they had in mind may be corrected. Her information is the same either way
  (she filters on the true label), but that player loses the bonus.
- She picks the best split with no randomness. The same board always gets the same
  question until the planned follow-up adds seeded variety among nearly-best questions.
