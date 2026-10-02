# Illucia v2 — decisions (2026-10-02)

Decided by Spyros in the planning chat on 2026-10-02, after Claude, ChatGPT, Codex and Code each proposed approaches. This is the agreed design for the next Illucia phase. It replaces the "current design" descriptions where they conflict. Numbers marked *(start)* are starting values to tune with the benchmark, not commitments.

Evidence it rests on: `docs/ILLUCIA-STRENGTH.md` (tier inversion on common short words; short words beat every tier; speed), the I3/I3b benchmarks, `tools/ILLUCIA-MODELS.md` (models alone lost 0/50), and the planning chat's simulation on SCOWL v1. That simulation found that weighting fixes the inversion: Master on common 4-letter words went from 46% to 57%, against Apprentice's 54%. Common-first only ties the tiers, and it's weaker on rare words (81% vs 85%). The real vocabulary must confirm this.

## 1. Her thinking (the brain)

1. **Weighted candidates.** Every candidate word counts by how common it is (ESDB size): ≤35 → 1, 40–50 → 0.3, 55–70 → 0.1 *(start)*. Each tier still knows only up to its own ceiling (35/50/70).
   - **Acceptance:** no tier wins less than a lower tier, beyond noise, at any length 4–15 or on any strength word set (a–d).
   - If weighting fails that, fall back to "common words first, then widen".
2. **Minimum word length 4**, for every tier: accepted words, setup validation, word files, benchmarks.
3. **Temperament (variety without stupidity):**
   - Seeded randomness: a fresh seed each round, recorded with the round; fixed in tests; many seeds in the benchmark.
   - No alphabetical tie-breaks.
   - While she has **3+ misses left**: a weighted random pick among letters within **10 percentage points** of her best, with better letters more likely. Never a letter far below the best.
   - With **1–2 misses left**: strictly the best letter.
   - A **small vowel bonus early in the round that fades** over her first turns. No permanent vowel rule.
   - Varied openings follow from the above; she shouldn't always open with E.
4. **Different temperament per tier:** Apprentice has the widest shortlist and the strongest early vowel lean; Master has the narrowest shortlist and is the most careful. Allowed only while the tier order from item 1 still holds.
5. **Information value** ("this letter splits the candidates better") is a **benchmark experiment only**: a weight inside the shortlist, never the decider. It ships only if it costs no strength beyond noise.
6. **Honest lines.** Her reasoning lines describe what she actually did ("B and I are tied; I have a feeling about I"). Remove any line that claims "more than any other letter" when that isn't true.
7. **Benchmark reports win rate and variety:** distinct guess sequences per word across seeds, distinct opening letters.
8. **Maths stays in code.** Letter choice is never delegated to a model.

## 2. Questions (normal mode: WordNet)

1. **Source: Open English WordNet 2025** (CC BY 4.0; attribution goes alongside the ESDB/LDNOOBW credits). Processed at build time into per-word category labels, served as static files like the word lists. No runtime WordNet service.
2. **Labels:** a word is YES for a category if **any** of its senses belongs to it ("crane" is a bird *and* a machine, so it's YES for bird). It's NO only if no sense ever belongs.
3. **When:** Illucia may ask **up to 2 questions per round**. A question uses her turn but **never costs a miss**. She asks when a question splits her candidates reasonably, e.g. 25–75% *(start)*.
4. **The player answers yes/no.**
   - If WordNet knows the player's word, the answer is checked. A contradicted answer is corrected ("My archive says otherwise…"), she filters on the true label, and that question's bonus is forfeited.
   - If WordNet doesn't know the word, the answer is accepted but earns **no bonus** (it can't be verified). Candidates without labels stay on both sides.
5. **Bonus (paid only if the player still wins the round):** +100 for answering the first question, +200 more for the second.

## 3. Points (normal mode only)

1. **Stumping her:** tier base × (word length − 3), with Apprentice 25, Scholar 50, Master 100 *(start)*. Example: a 4-letter Master win = 100; a 6-letter Master win = 300.
2. **Question bonus:** as in 2.5.
3. **Ladder:** win Apprentice, then *immediately* Scholar, then *immediately* Master. Each word must be at least 1 letter longer than the previous one (so at least 4 → 5 → 6). A loss or an abandoned round resets the ladder to Apprentice. Ladder bonus: 500 *(start)*.
4. **Once per word per player.** A second win with the same word earns 0 and shows: "You already beat me with this word, no more points from it."
5. **Goes through the server's round-ticket system** (`docs/SCORING.md`). How to verify an Illucia claim (full server replay vs ticket + floor + trust) is an **open technical question for the implementer**. Note the Workers Free 10 ms CPU limit; Master's first decision on 8 letters measured ~24 ms unthrottled in the browser.
6. **Experimental AI mode on → no points** for that round.
7. Points add to the same Hall of Fame total as Hangman points.

## 4. Memory and the player model

1. **Stored on the server (D1), per account:** the words a player plays against her, with counts (`player_words`), and which words beat her. **Global** `word_counts(word, count)` with no user and no timestamps. Account deletion removes the per-account rows (global counts stay; they were never linked to anyone). Disclosed on the `/privacy` page.
2. **She learns words that beat her:** for that player, a word that beat her joins her knowledge at every tier.
3. **Letter tendencies:** a small prior from the player's history (start at ≤5% weight and grow slowly with games played), so a few unusual words don't distort her.
4. **Personality seed:** a stable per-account seed for small temperament variations, so she has a recognisable style against each player.
5. **Stats screen** on `/illucia`: games, wins/losses per tier, words she learned from you, favourite lengths and letters.
6. **Brain vs voice.** Her *guessing* never receives the secret word. Her *commentary* may know the word and the player's history ("JAZZ… AGAIN??").

## 5. Experimental AI mode

1. A **toggle on `/illucia`**, off by default, labelled e.g. "Experimental: Illucia uses an AI model and can make mistakes." No points while it's on.
2. **The model handles meaning, not maths:** from her current candidates (only when there are **≤80**), it invents a yes/no question that isn't about letters, and sorts the candidates into YES and NO.
3. **Code validates** (both lists are subsets of the candidates; the split is reasonably even) and **falls back** to her normal move on any failure, timeout or exhausted budget. She may own the mistake in a line.
4. Workers AI free-allowance models only. A **site-wide daily cap (~50 requests, configurable)**, a per-user limit, and a hard timeout.
5. **First an offline test** (reuse the I7a runner): ~20 game states × 3 models, scored against the WordNet labels for question quality, sorting accuracy and split evenness. Pick the model from the results.

## 6. UI scope

- **Only `/illucia` gets new UI.** The Observatory (`/illucia-observatory`) stays and gets no new features. It shares the brain, so its copy that says "only her vocabulary changes" must be corrected.
- `docs/DESIGN-BRIEF.md` (redesign brief) exists. New `/illucia` UI should not contradict it.

## 7. Order and parallel work

| Track | Scope | Steps | Depends on |
|---|---|---|---|
| A — thinking | `client/src/lib/illucia/`, Illucia benchmarks in `tools/` | A1 weighting + minimum 4 · A2 temperament + per-tier styles (+ information-value experiment) | — |
| B — WordNet | new WordNet build script in `tools/`, new static label files | B1 labels + coverage report + credit · B2 question chooser (pure module) + benchmark | — |
| C — server | `server/`, `shared/`, D1 migrations from `0006` | C1 Illucia tickets + points + once-per-word + ladder · C2 player memory, word counts, learned words, priors, seed | — |
| D — experimental AI | I7a tooling, then Worker route | D1 offline model test · D2 Worker route, cap, timeout | B1 (D1); C1 (D2) |
| E — `/illucia` page | `client/src/Components/Illucia*` | E1 temperament + honest lines + min 4 · E2 questions + bonus · E3 points, ladder, "already won" · E4 stats + learned-word lines · E5 experimental toggle | A1–A2; B2 + C1; C1; C2; D2 |

A, B and C can run as **parallel sessions in separate clones**, each committing on `main` after `git pull --rebase`, one push at a time. A and B both touch `tools/`: different files, but possibly both edit `tools/package.json`.

## Amendments — 2026-10-02, after Track A's review

1. **Expectation on common words.** ESDB has a single level for every word up to size 35 (38,547 words), so weighting can bring Master *level* with Apprentice on common words, not above her. The planning chat's "57% vs 54%" was within noise. The gate stays the same: no tier below a lower one.
2. **Acceptance gate:**
   - Cells: set a overall; sets b and c overall and at each length 4–6; set d at each length 4–15, and per band at each length (including the common band).
   - Test: a one-sided exact McNemar test, word by word, Holm-corrected at 5%, with effect sizes reported for every cell.
   - Weights are the integers 10/3/1. The fallback stays unweighted.
3. **"Within 10 points"** (temperament, §1.3) means within 10 points of the best **weighted** share.
4. **Points only for in-tier words** (replaces the unrestricted §3.1). Stump points are paid only if the player's word is in that tier's vocabulary. Beating Apprentice with a word she doesn't know is allowed but earns 0. Master knows the whole accepted list, so any word counts. Base values are to be calibrated from the strength data, so the expected points per Illucia round are comparable to a Hangman round.
5. **Questions are an optional bet** (replaces "a question uses her turn", §2.3). When Illucia asks, the player may **answer** (it helps her; the bonus is paid if the player still wins) or **decline** (no information, no bonus). B2's benchmark measures how much an answered question helps her and re-checks the tier order with questions on; the bonus values are set from that.
6. **Claim verification (C1):** ticket + 5-second floor + a **rules check**. The server confirms the claimed guesses are legal and really reach six misses on the word. It does **not** replay her choices (that is over the Workers Free CPU limit; her first decision is ~24 ms). Her choices stay forgeable, as in Hangman's threat model.
7. **Brain location:** stays in `client/src/lib/illucia/` for now. A2 keeps it movable: an injected seeded random generator (never `Math.random`), integer scores, and the seed recorded with the round.
8. **3-letter words** are removed from the word files, validation and benchmarks. The committed I7a reports stay as historical records and are not re-run.

## Amendments 2 — 2026-10-02, after Track B's and Track C's reviews

1. **Questions are phrased "Can your word mean …?"** This makes the any-sense rule explicit. The category list is curated (Track B's list of 41) rather than WordNet's raw 45 lexicographer files. All categories ship as data; **v1 asks noun categories only** unless B2's benchmark shows the others are worth it.
2. **Words WordNet doesn't know:** the offer says "no bonus possible for this word" before the player chooses. Label files: a missing word = unknown; `-` = known but no category.
3. **Vulgar meanings:** a small reviewed exclusion list, with a reason per entry, removes categories that come only from vulgar meanings.
4. **Points, calibrated against what a cheater can earn** (replaces §3.1–3.3 values and Amendment 1.4's open calibration):
   - stump points = tier base × min(length − 3, 3), with Apprentice 30, Scholar 40, Master 50, and only for in-tier words;
   - answered questions **multiply** the stump points: ×1.25 for one, ×1.5 for two;
   - ladder bonus +100;
   - claim floor 12 s. That gives a cheater ceiling of ≈1,290 points/minute, close to Hangman's ≈1,200.
5. **Ladder and once-per-word:**
   - the word is committed at round start;
   - once-per-word applies across tiers;
   - only point-earning wins advance the ladder;
   - out-of-tier wins pay 0 and don't use up the word;
   - experimental rounds pay 0 and break the ladder.
6. **Separate Illucia tickets** (their own table and their own one-open-round rule), so Hangman and Illucia don't replace each other's rounds. This accepts roughly double the per-account ceiling across both modes.
7. **"Unrefused" = answered.** Questions and answers are client-reported and rules-checked only, like her moves.
8. **The server reads the word files** (as text modules, binary search). It deploys only after A1 has removed `3.txt`. The server issues a 32-bit seed per round; A2's random generator must accept it.
9. **Privacy:** `/privacy` states that words that beat her are kept per account until deletion, **before** C1's Worker deploys (Track C owns that copy change).
10. **Release record:** production already runs migrations 0001–0005 and the deletion/retention Worker; `CLAUDE.md` and `server/RELEASE.md` get corrected in a separate docs commit.

## Amendments 3 — 2026-10-02, after B2's measurements

1. **Question timing:** "not before her 3rd guess" stays the default. It costs her 0.1–0.2 points, detectable but immaterial next to a question's 4–9-point value; pacing wins.
2. **Broad-opener fix:** "man-made object" opens 74–76% of first questions. Fix it with seeded variety among nearly-best questions (after A2 is on main) plus a mild preference for narrow categories. Target: broad categories open well under half of first questions. Her strength cost is acceptable, because questions only happen when the player opts in.
3. **Multipliers raised:** ×1.5 for one answered question, ×2.0 for two (were ×1.25 / ×1.5). Measured break-even is ≈×1.6 and ≈×2.1–2.45, so a player who answers everything loses slightly and a selective player gains.
4. **Claim floor raised to 15 s** (was 12 s) to hold the cheater ceiling near Hangman's: ≈333 points per round max × 4 per minute ≈ 1,330 per minute.
5. **Nouns only in v1**, confirmed (all categories add 0.4–1.6 points for her, mostly from gotcha-prone adjective and verb questions).
