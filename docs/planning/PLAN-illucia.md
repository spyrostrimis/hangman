# Illucia — Play vs AI: plan (v2, merged)

Version 2, 2026-09-28. This merges Claude's plan (v1, 2026-09-27) with ChatGPT's Phase 4 plan and its review, and with Spyros's decisions. Checked against `main` at `f9d685a`.

Status legend: ✅ done · ▶ next · ☐ planned · ◇ optional/later · **OPEN** = still needs a decision.

## 0. Where we are

| Slice | What                                                                                                                                                                                | Status                                                                                    |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| I0    | HARD RULES v4 in both mirrored copies                                                                                                                                               | ✅ `2c4317a`                                                                              |
| I1    | Shared pure game core (`client/src/lib/hangman-core.js`); `/hangman` switched to it; stale keyboard closure, `remainingTries` and the answer `<div>` removed; Caps Lock fix flagged | ✅ `b482b9b` — reviewed: characterization tests first, mutation-checked, browser-verified |
| MOB   | Phone pass on the existing pages, **before** the Illucia page (see §7)                                                                                                              | ▶                                                                                         |
| I2 | Word-list build tool | ✅ `2fad03f` — pinned, filtered, reproducible ESDB vocabulary |
| I3 | Solver + benchmark harness | ✅ implemented and locally verified — [results](../../tools/ILLUCIA-SOLVER.md#recorded-i3-result); count retained |
| I3b | Zero-candidate fallback + tier benchmark | ✅ implemented and locally verified — [11,700-game results](../../tools/ILLUCIA-TIERS.md#recorded-result-and-tier-decision) |
| I4 | Illucia page v1 | ▶ next, after confirming MOB completion |
| I5    | Workers AI commentary                                                                                                                                                               | ◇                                                                                         |
| I6    | Text-to-speech toggle                                                                                                                                                               | ◇                                                                                         |
| I7    | "Which Illucia can beat your word?" race experiment                                                                                                                                 | ◇                                                                                         |

History note: `238db29` shipped a complete, unplanned Illucia (unfiltered ENABLE1 list, "REVEAL WORD" counted as a player win, no browser check). It was reverted in `b6a2fd9`. Nothing from it is carried forward.

## 1. Decisions (agreed 2026-09-28)

1. **Illucia's moves come from a local solver, never a model.** In-browser, deterministic, tested, $0.
2. **V1 policy is candidate hit-counting.** Guess the unused letter that appears in the most remaining candidate words. Entropy, risk-adjusted entropy and lookahead must _beat it in the committed benchmark_ before replacing it (§3.3). Changed from ChatGPT's first proposal, on measured evidence.
3. **Uniform candidate weights.** The player picks the word to beat her, so "prefer common words" is the wrong assumption.
4. **A `chooseLetter(publicState, knowledge)` boundary from day one.** A `toPublicState(round)` function is the only way into it, so no strategy can ever receive the answer.
5. **Difficulty is vocabulary tiers:** Apprentice ≤35 / Scholar ≤50 / Master ≤70. I3b measured and retained these ceilings with own-tier zero-candidate fallback ([results](../../tools/ILLUCIA-TIERS.md#recorded-result-and-tier-decision)). Tiers differ in vocabulary, never deliberate random mistakes; success need not increase for every individual word.
6. **Word list: ESDB/SCOWL v2** (successor to SCOWL). "Is this an accepted word?" and "does this Illucia know it?" are separate questions with separate names in the code.
7. **Profanity filtering is mandatory**, both from ESDB's own flags and the LDNOOBW blocklist. It happens at build time and matches normalised _whole words_ only (no Scunthorpe problem).
8. **Words are 3–15 letters.** 20 is revisited only after the board passes the phone check.
9. **One file per word length**, each word tagged with its tier. Loading the `/illucia` page fetches only the length the player picked.
10. **The player types the secret word**, validated in the browser. The input is cleared once the round starts. Setup copy: "Your secret word never leaves your browser."
11. **Commentary layers:** M0 scripted (v1, permanent fallback) → M1 Workers AI _commentary_ (later) → M2 model _picks letters_ (only inside the I7 race experiment) → TTS (optional presentation).
12. **No Hall of Fame points for Illucia in v1.** She stays for signed-in players only.
13. **UI reuses the Hangman look, not its components.** New components; `Keyboard.js` isn't reused (it mixes navigation, hints, the flip effect and a page reload).
14. **No browser background thread (Web Worker) for the solver until profiling on a phone shows it's needed.**
15. **The phone pass comes before the Illucia page.**

**OPEN:** Illucia's art (a CSS/SVG avatar, a derivative of existing art, or new generated art; image-generation model and cost are undecided).

## 2. Game contract

1. The player enters an English word: A–Z only, lower-cased, 3–15 letters, in the **accepted** list (tier ≤70), not blocked.
2. The secret lives only in the browser's round state (`createRound(answer)` from `hangman-core`). Strategies see `toPublicState(round)`: length, pattern, guessed letters, missed letters, misses left.
3. `applyGuess(round, letter)` is the only way a guess happens, for the human in Hangman and for Illucia here. `MAX_MISSES = 6`.
4. A hit reveals every occurrence and costs nothing; only a miss costs a chance. All letters revealed → Illucia wins; six misses → the player wins.
5. Game code adjudicates everything. A model never judges a rule, never sees the secret, and never supplies a letter that code hasn't validated.
6. Restart resets state without a page reload and cancels any pending "thinking" timer or model request.

## 3. Illucia's brain

### 3.1 Candidate filtering (the "exact positions" rule)

A word survives only if, for every position:

- a revealed position holds exactly the revealed letter, and
- an unrevealed position holds **no guessed letter at all** (hit or miss).

Hangman reveals _every_ occurrence of a guessed letter. So with `E` guessed and the board at `E _ _ _ E`, the word `EERIE` is impossible because it has an E in an unrevealed position. Required tests: this EERIE case, plus a positive control (a word that should survive does).

### 3.2 Zero candidates (ChatGPT's catch, now a first-class rule)

At Master, the secret is always in her candidate set, so zero candidates means a **bug**; test and assert it. At Apprentice or Scholar, a valid rarer word can legitimately leave zero candidates. Then:

- **Fallback:** pick the unused letter most common in _her own tier's_ words of that length (precomputed per length; per-position counts optional). No n-grams or neural models in v1.
- **Never** quietly widen her vocabulary to a higher tier. That would make the difficulty a lie.
- The simulation behind the v1 tier numbers fell back to plain ETAOIN order. That's weaker than this fallback, so those numbers **overstate** how easily rare words beat a low tier. I3b re-measures them.

### 3.3 Evidence so far (Node simulations, SCOWL v1 via npm `wordlist-english`, ~111k words; re-measure on ESDB v2 in I3)

Policy comparison, full vocabulary, uniform weights, 250 words per length. Illucia's win %:

| Length | Count | Entropy | Risk-adjusted entropy (k=2) |
| ------ | ----- | ------- | --------------------------- |
| 3      | 32    | 33      | 32                          |
| 4      | 46    | 48      | 47                          |
| 5      | 68    | 67      | 68                          |
| 6      | 84    | 80      | 85                          |
| 7      | 94    | 89      | 94                          |

Rare words (tiers 55–70) score within a few points of these. **At full vocabulary, rarity doesn't hurt her; only word structure does.** That's why the vocabulary tiers exist.

Tier effect (5–9-letter words, ETAOIN fallback, so optimistic for the player):

| Player's word       | Knows ≤35 | ≤50 | ≤70 |
| ------------------- | --------- | --- | --- |
| Common (≤35)        | 94%       | 94% | 91% |
| Less common (40–50) | 11%       | 92% | 90% |
| Rare (55–70)        | 12%       | 11% | 93% |

Random mistakes don't work as difficulty. 50% random picks among the top five letters still win ~99% of 8–10-letter words.

Literature: dictionary solvers reach 99–100% on 10+ letters ([sharkfeeder](http://www.sharkfeeder.com/hangman/)); on words _outside_ the dictionary they drop to ~18%, and n-gram/neural models reach ~50–60% on the Trexquant benchmark ([example](https://github.com/techbhuvi04/Hangman-Challenge)). Neither is needed for v1: every accepted word is in the full Master lexicon, while lower tiers handle out-of-tier words with the explicit zero-candidate fallback in §3.2 .

### I3b measured tier results

The committed ESDB v2 benchmark uses the actual own-tier fallback and supersedes the preliminary SCOWL v1 / ETAOIN estimates above. Across the same 500 sampled 5–9-letter words per band, Illucia wins:

| Player word band | Apprentice ≤35 | Scholar ≤50 | Master ≤70 |
| --- | --- | --- | --- |
| Common (=35) | 92.8% | 92.6% | 89.0% |
| Less common (40–50) | 9.8% | 91.8% | 89.6% |
| Rare (55–70) | 11.0% | 12.8% | 90.4% |

The full 3–15-letter run covers 11,700 games, with zero Master or in-tier candidate failures. [Method, limitations, and full results](../../tools/ILLUCIA-TIERS.md).

### 3.4 Benchmark harness (I3, committed in `tools/`)

Same `hangman-core`, fixed deterministic sample, seeded. For each policy it reports:

- win rate, overall and by length;
- average misses and average turns;
- the hardest word groups;
- time per decision (p50/p95);
- candidate-set sizes;
- zero-candidate events, split into expected (low tier) vs bug (Master).

Policies: A global frequency · B **count (baseline)** · C entropy · D risk-adjusted entropy · E D + 2-move endgame lookahead · later: F n-gram, G character model, H Workers AI models (I7). Any challenger replaces B only by beating it clearly on the same sample.

## 4. Word list (I2)

- **Source:** ESDB/SCOWL v2 ([en-wl/wordlist](https://github.com/en-wl/wordlist)), American English, normal variants, special categories excluded, A–Z only, 3–15 letters, lower-cased, sorted, de-duplicated. Pin the ESDB release and record a checksum.
- **Tiers** stored per word. Working set: 35 / 50 / 70. Verify that ESDB v2's size levels match these before the tier names are locked.
- **Filtering (build time):** drop ESDB `offensive-*` / `vulgar-*` entries, then drop exact normalised matches from the LDNOOBW English list ([CC BY 4.0](https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words)). ESDB itself says its flags cover only the worst cases, hence both filters. Verified: the npm SCOWL build contains common profanity.
- **Output:** `client/public/illucia/words/3.txt` … `15.txt`, one `word tier` per line (e.g. `abandon 35`). A deterministic `tools/` script produces them, with tests (no blocked word survives; every line is valid; same input gives the same bytes).
- **Credits:** ESDB copyright notice and LDNOOBW attribution in the README and an in-app credits line.
- Rough sizes from SCOWL v1 (all lengths, brotli): ≤35 ≈ 87 KB, ≤50 ≈ 145 KB, ≤70 ≈ 284 KB. Per-length files are a fraction of that.

## 5. Commentary

| Layer                      | What                                                                                                                                                                                                                                                                                                                                                                                                                             | When                           |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| **M0 scripted commentary** | Lines per event (opening, first hit, first miss, three misses, one life left, rare-letter guess, Illucia wins, player wins, blocked word), several variants each; `{letter}`/`{word}` filled in by code                                                                                                                                                                                                                          | v1, and the permanent fallback |
| M1 Workers AI commentary   | One short line after a move, from public state only (`event, letter, hit, pattern, guessed, missesLeft, tier, candidateCount`). Comments on the guess just made, never announces a next one. Server-side prompt; reply capped, stripped, blocklist-checked; ~2.5 s timeout; per-user cap; scripted fallback. Route under the existing `/user/*`. Lines that name the actual word are code-filled templates, never model-written. | ◇ after v1 feels good          |
| M2 model picks letters     | Only as an alternative `chooseLetter()` inside the I7 race; validated, one bounded retry, solver fallback                                                                                                                                                                                                                                                                                                                        | ◇ experiment                   |
| TTS                        | Browser `speechSynthesis`, off by default                                                                                                                                                                                                                                                                                                                                                                                        | ◇                              |

Workers AI facts (verified 2026-09-27):

- 10,000 neurons/day free, and requests fail once it's used.
- Paid-only models are excluded.
- JSON mode is documented only for older models and is not guaranteed, so replies are treated as untrusted plain text.
- A short line costs about 1–5 neurons on small/mid models.

## 6. Page (I4)

States: **setup → playing → finished**.

```
IlluciaPage
├─ IlluciaSetup     tier choice · masked word input · trust line · validation messages
├─ IlluciaGame
│  ├─ IlluciaStage     portrait + "mind": candidate count 4,213 → 612 → 37 → 3
│  ├─ TurnLog          "Turn 4 · R · HIT · 2 positions"
│  ├─ Pattern          the blanks
│  ├─ MissMeter        six-slot meter (shared design with the main game's future six-guess visual)
│  ├─ LetterBoard      read-only A–Z: hit / miss / unused, new guess pulses
│  └─ AnalysisDrawer   "How Illucia thinks": "R appears in 72% of the words I'm still considering"
└─ IlluciaResult    outcome · her top suspects (from the clean list) · play again
```

Non-React code: `lib/hangman-core.js` (exists), `lib/illucia/candidates.js`, `lib/illucia/strategy.js`, `lib/illucia/lexicon.js`, `lib/illucia/lines.js`.

- Candidate _words_ are hidden during play (counts only) and revealed as "suspects" at the end.
- If the secret is one of the 105 manifest words, its facts may appear as a bonus. No live Merriam-Webster calls.
- A "thinking" delay of ~0.8–1.5 s; respect `prefers-reduced-motion`.
- `aria-live` announces each guess.
- The layout inherits the phone rules from MOB.

## 7. Phone pass (MOB) — before I4

Why first: Illucia copies the Hangman layout. Fixing Hangman on phones first means Illucia starts phone-friendly instead of needing a second mobile pass.

- **Audit before code:** screenshots of every page at **360 × 800 and 390 × 844**, and check one landscape phone size. Pages: navbar, Home (intro pop-ups), Hangman (two panels, word, keyboard, win/loss screens), Hall of Fame, Login, Signup, Illucia placeholder. A written defect list; each slice fixes listed defects only.
- **Test words:** the longest manifest words (`cardiovascular`, `correspondence`, `existentialism`, all 14 letters) must fit without horizontal scrolling. This also closes the old open question about 12–14-letter words on mobile.
- **Rules worth checking for:**
  - no horizontal page scroll;
  - tap targets ≥44 px;
  - form inputs ≥16 px font (below that, iOS Safari zooms in);
  - dynamic viewport units (`dvh`) instead of `100vh`;
  - pop-ups fit inside the screen and can be closed;
  - keyboard keys stay tappable at 360 px.
- **Likely slices:** (1) navbar + page shell; (2) Hangman page; (3) Home pop-ups + Hall of Fame + forms. One commit each, verified in the browser at both widths before commit.
- **Also on a real phone:** time the login PBKDF2 stretching. It's still unmeasured, per `server/RELEASE.md`.

## 8. Verification checklist (Illucia)

- EERIE exact-position test with a positive control.
- `chooseLetter` never receives the answer: `toPublicState` test with a positive control.
- Zero candidates is expected at low tiers and a failing assertion at Master.
- Repeated-letter reveal · hits free · sixth miss ends the round · no repeated guesses · stop after win/loss.
- Restart cancels pending work.
- The list rejects non-words and blocked words; whole-word matching (a word that merely contains a blocked string still passes).
- The secret is cleared from the input and DOM after start.
- Tier numbers are reproduced by the committed harness.
- The word list is not in the main bundle, and only one length file is fetched per round.
- 390 px and 360 px with a 15-letter word · `aria-live` · reduced motion.
- M1 only: public-state-only request body (asserted), timeout, per-user cap, quota exhaustion → scripted line.

## 9. Repo hygiene (small docs-only commit)

- Replace `PLAN-illucia-byCLAUDEchat.md` with this file as `PLAN-illucia.md`.
- Move `phase-4-illucia-plan-by*.md` and `walkthrough-byANTIGRAVITYgemini.md` to `docs/planning/`.
- Delete `state(6).md`. `state.md` lives in the claude.ai Project, and a copy frozen in the public repo will go stale.
- Point the Phase 4 section of `PLAN-accounts-and-illucia.md` at this file.

## Sources

Solvers: [sharkfeeder](http://www.sharkfeeder.com/hangman/) · [Trexquant-style solution](https://github.com/techbhuvi04/Hangman-Challenge) · [LSTM/trie solution](https://github.com/aghalandar/Hangman_solution) · [ethan-schaffer/Hangman-Solver](https://github.com/ethan-schaffer/Hangman-Solver)
Models: [LLMs Can't Play Hangman](https://arxiv.org/html/2601.06973v1) · [CharBench](https://arxiv.org/html/2508.02591) · [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) · [limits](https://developers.cloudflare.com/workers-ai/platform/limits/) · [JSON mode](https://developers.cloudflare.com/workers-ai/features/json-mode/) · [Gemini API terms](https://ai.google.dev/gemini-api/terms) · [Chrome Prompt API](https://developer.chrome.com/docs/ai/prompt-api) · [SpeechSynthesis](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis)
Word lists: [ESDB/SCOWL](https://github.com/en-wl/wordlist) · [LDNOOBW](https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words)
