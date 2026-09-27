# Illucia — Play vs AI: options, evidence and plan

Prepared 2026-09-27 against `0eec78a` (accounts, scores and Hall of Fame live). Planning only; nothing here is implemented. Items marked **DECIDE** need Spyros's call before the slice that depends on them.

## TL;DR

- **Build Illucia's brain as a local solver, not a language model.** It filters an English word list by what she can see, then guesses the letter most likely to hit. Instant, in-browser, $0, never fails, and far stronger than any small model at letter-level play.
- **Make difficulty = the size of her vocabulary.** Simulated: an Illucia who knows only common words wins ~94% against common words but only ~11% against less-common ones. To beat her, the player has to reach for rarer vocabulary, which is the whole point of an English-vocabulary game.
- **Let a model give her a voice, not her moves.** Optional Workers AI layer writes short in-character lines from the public board state. The solver still plays every letter. If the model is slow, broken, or the daily allowance runs out, she falls back to scripted lines and the game is unaffected.
- **Extract the shared game core first.** Illucia and Hangman should run the same pure rules module. That is the old Phase 2 item, now step 1 of this phase.
- **HARD RULES need one scoped exception** (v3 → v4): first-party Workers AI for Illucia only, public game state only, local fallback mandatory.

## 1. Game contract (unchanged from the account plan, tightened)

1. The player enters an English word: A–Z only, case-normalised, length 3–15, must be in Illucia's accepted word list, must not be on the blocklist.
2. The secret stays in the player's browser. Illucia's brain receives only the public state: length, revealed pattern, guessed letters, misses left. A test proves the solver never receives the secret ("no peeking").
3. One unused letter per turn. A hit reveals every occurrence and costs nothing; only a miss costs a chance. Six misses and the player wins; a fully revealed word and Illucia wins.
4. Game code adjudicates everything. A model never judges a rule, never sees the secret, and never picks a letter that code hasn't validated.
5. Stop after win/loss; restart cancels any pending turn or model request.
6. Results stay out of the +100 Hall of Fame in v1 (**DECIDE** later).

## 2. Evidence

### 2.1 Solver strength: literature

- A frequency solver on the ENABLE list with six misses wins 45.8% of 2-letter words, 68.6% of 5-letter, 86.1% of 6-letter, and 99.9–100% of 10+-letter words. Best opening letter: E for most lengths ([sharkfeeder](http://www.sharkfeeder.com/hangman/)).
- When the secret is **not** in the solver's dictionary, dictionary filtering collapses. On the Trexquant hangman challenge (training and test dictionaries disjoint), the baseline wins ~18%, and n-gram + BiLSTM ensembles reach ~50–60% ([techbhuvi04](https://github.com/techbhuvi04/Hangman-Challenge), [aghalandar](https://github.com/aghalandar/Hangman_solution), [simrann20](https://github.com/simrann20/Hangman_Game_Project)).
- Consequence: require player words to be in the list. Illucia then always has candidates, and the ML route is unnecessary.

### 2.2 Solver strength: our simulation (2026-09-27)

Node, SCOWL-derived list (English + American, levels ≤70, a–z only, ~111k words). Candidate filtering by pattern and misses, letter chosen by the number of remaining candidates containing it. 300 sample words per row, six misses. Ties and sampling move individual cells by up to ~10 points, so read these as ranges.

Illucia's win rate against **common** player words, by word length:

| Length | Naive (ETAOIN order, no filtering) | Count + 50% random among top 5 | Count | Count weighted to common words |
|---|---|---|---|---|
| 3 | 8% | 36% | 30–40% | ~40% |
| 4 | 5% | 41% | 44–53% | ~53% |
| 5 | 6% | 56% | 67–74% | ~75% |
| 6–7 | 7% | 80% | 84–92% | ~90% |
| 8–10 | 11% | 99% | 99% | 99% |
| 11–15 | 15% | 100% | 100% | 100% |

Vocabulary-size difficulty (player words 5–9 letters; Illucia knows only words up to a SCOWL level):

| Player word band | Illucia knows ≤35 (~38k) | ≤50 (~60k) | ≤70 (~111k) |
|---|---|---|---|
| Common (≤35) | 94% | 94% | 91% |
| Less common (40–50) | 11% | 92% | 90% |
| Rare (55–70) | 12% | 11% | 93% |

Also measured: all 105 manifest words vs the full list → Illucia wins 100/105. A full 14-letter game takes ~2.5 ms in Node.

What this means for design:

- Randomness barely weakens her on long words. Long words have too many letters to hide.
- Naive ETAOIN order is too weak to be fun.
- **Vocabulary size is a crisp, fair and thematic difficulty knob.** "She's still learning English; rare words fool her."
- At full vocabulary, the player's only route is short words with rare letters (JAZZ-type). That is a known and satisfying puzzle.

### 2.3 Language models at this task

- **LLMs cannot host hangman** without private state: a chat-only model cannot both hide and consistently keep a secret word. Vanilla self-consistency was 2–12% on GPT-OSS/Qwen3 models, 76–100% only with an external private-memory workflow ([arXiv 2601.06973](https://arxiv.org/html/2601.06973v1)). Our design never asks a model to host.
- **Character-level reasoning is weak**, even when a model only guesses letters. CharBench: 50.3% average on counting/indexing tasks; GPT-4o 70.7%, Mistral-7B 34.7%. Accuracy falls as the tokens containing the target letters get longer ([CharBench](https://arxiv.org/html/2508.02591)).
- Expectation, not yet measured: a small Workers AI model picking letters from `_ _ A _ E` plays worse than the solver and sometimes returns invalid or repeated letters. It would need the solver as a fallback anyway.

### 2.4 Workers AI facts (verified 2026-09-27)

- Free allowance **10,000 neurons/day**; on Workers Free, requests fail once it's used, with no overage ([pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)). As I read the pricing page, the allowance is per account, so it's shared with anything else on the same Cloudflare account.
- Paid-only models (excluded): Kimi K2.6/K2.7, GLM 5.2/5.3/5.3-flash, DeepSeek V4 flash/pro.
- Text-generation rate limit 300 requests/minute ([limits](https://developers.cloudflare.com/workers-ai/platform/limits/)).
- JSON mode is documented for older Llama 3.x, Hermes 2 Pro, DeepSeek Coder 6.7B and R1-distill only, and is "not guaranteed" ([JSON mode](https://developers.cloudflare.com/workers-ai/features/json-mode/)). For one-line outputs, plain text plus server-side validation is simpler.
- AI Gateway (caching, rate limiting, analytics) is free on all plans ([AI Gateway pricing](https://developers.cloudflare.com/ai-gateway/reference/pricing/)).

Cost per model call, assuming a ~400-token prompt and a ~40-token reply:

| Model (`@cf/…`) | Neurons per M in / out | ≈ neurons per line | ≈ lines/day on 10k |
|---|---|---|---|
| ibm `granite-4.0-h-micro` | 1,542 / 10,158 | ~1.0 | ~10,000 |
| meta `llama-3.2-3b-instruct` | 4,625 / 30,475 | ~3.1 | ~3,200 |
| google `gemma-4-26b-a4b-it` | 9,091 / 27,273 | ~4.7 | ~2,100 |
| openai `gpt-oss-20b` | 18,182 / 27,273 | ~8.4 | ~1,200 |
| meta `llama-3.3-70b-instruct-fp8-fast` | 26,668 / 204,805 | ~18.9 | ~530 |

With ~5 lines per game (start, first miss, big reveal, last chance, end), even a mid-size model covers hundreds of games a day. Quota is not the constraint; quality and latency are, so benchmark before choosing.

Voice (text-to-speech):

| Option | Cost | Notes |
|---|---|---|
| Browser `speechSynthesis` (Web Speech API) | $0, no server | Baseline since 2018 ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis)). Voices vary by device; a robotic voice suits a robot. |
| Workers AI `melotts` | 18.63 neurons per audio minute | Cheap; MP3 output. |
| Workers AI `aura-2-en` | 2,727 neurons per 1k characters | ~270 neurons per 100-character line → only ~36 lines/day. Too expensive for us. |

### 2.5 Ruled out, with reasons

- **Gemini API free tier.** Google's terms: "You may use only Paid Services when making API Clients available to users in the European Economic Area, Switzerland, or the United Kingdom" ([terms](https://ai.google.dev/gemini-api/terms)). This is a public site run from Greece, so the free tier isn't usable. Paid breaks $0.
- **Other third-party model APIs.** An external runtime dependency plus key management plus provider-specific costs; the HARD RULES keep third parties out.
- **Chrome built-in Prompt API (Gemini Nano).** Available to web pages from Chrome 148, with structured output via `responseConstraint`. But it needs 22 GB free disk, a GPU with >4 GB VRAM (or 16 GB RAM + 4 cores), is desktop-only, and has no Android/iOS ([Prompt API](https://developer.chrome.com/docs/ai/prompt-api)). At most a progressive enhancement; not a design basis.
- **WebLLM / Transformers.js in-browser models.** The smallest usable models need ~360 MB (SmolLM2-135M) to ~1.4 GB (Qwen3-0.6B) of VRAM ([WebLLM model config](https://raw.githubusercontent.com/mlc-ai/web-llm/main/src/config.ts)). WebGPU is still missing on Linux and on Firefox for Android ([web.dev](https://web.dev/blog/webgpu-supported-major-browsers)). That's a huge first load for a casual page. Possible later "local brain" experiment only.
- **Existing npm hangman engines.** None maintained (`hangman-engine` last published 2015; `hangman-js` 2023). The core is ~50 lines; we write it.

## 3. Options by layer

### 3.1 Game core (shared rules)

| Option | Verdict |
|---|---|
| **Extract a pure module from `App.js`** (`guess(state, letter) → state`, selectors `isWon`, `isLost`, `missesLeft`, `pattern`), characterization tests first, then both pages use it | **Recommended.** Removes the stale keyboard closure, `remainingTries`, and the transparent answer `<div>` along the way. |
| Separate Illucia-only engine | Rejected: two copies of the six-miss rule will drift. |
| State-machine library (XState etc.) | Overkill for a four-state game; a reducer is enough. |
| npm package | None suitable (see 2.5). |

Placement: `client/src/game/core.js`, following the `client/src/lib` pattern. It moves to `shared/` only if the Worker ever needs it; the model endpoint validates letters itself.

### 3.2 Illucia's brain (solver)

| Option | Strength | Cost | Verdict |
|---|---|---|---|
| Naive letter order | ~5–15% | trivial | Too weak. |
| **Candidate filtering, P(hit) count** | table 2.2 | ms per turn | **Recommended core.** |
| Frequency-weighted count | same or slightly better on short common words (tie-sensitive) | same | Optional "Master" flavour; benchmark first. |
| Entropy / information gain | no better in our run | slightly more CPU | Not worth it. |
| Expectimax / optimal search | best possible | exponential; needs pruning | Not needed; she's already near-perfect on long words. |
| n-gram / neural (out-of-vocabulary words) | 50–60% on unseen words | model files, training | Unneeded if player words must be in the list. |

Difficulty (**DECIDE**): vocabulary size, e.g. Apprentice ≤35 · Scholar ≤50 · Master ≤70. The **accepted-words** list is always the full ≤70 list, so any real word can be played at any level.

Optional v2, "she learns": a word that beats her joins her vocabulary for that player (stored per user). She can't be beaten twice by the same word.

### 3.3 Word list

| Source | Licence | Size | Notes |
|---|---|---|---|
| **SCOWL / ESDB** ([en-wl](https://github.com/en-wl/wordlist)) | MIT-like; copyright notice must be kept | ≤35: 38k words, 87 KB brotli · ≤50: 60k, 145 KB · ≤60: 74k, 188 KB · ≤70: 107–111k, 284 KB | **Recommended.** Frequency levels give the difficulty knob for free; offensive/vulgar entries are marked in the source data. |
| ENABLE | Public domain | 172k | No frequency levels; includes profanity. |
| wordfreq | Code Apache-2.0, data CC-BY-SA-4.0 | large | Share-alike data; sunset (frozen at ~2021). |
| `word-list` (npm, atebits) | MIT | 274k, 565 KB brotli | Bigger than needed; partial profanity filter. |

- Profanity: measured — the npm SCOWL build (`wordlist-english`) contains common profanity. Build our list from SCOWL with its offensive/vulgar markers removed, plus the LDNOOBW blocklist ([CC-BY-4.0](https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words)) as a second filter.
- A blocked word typed by the player gets a friendly refusal, e.g. "Illucia would rather not play with that word."
- Delivery: a deterministic `tools/` build script produces a static file, lazy-loaded only on `/illucia`. This is the project's first code-split.
- Credits: add the SCOWL notice and the LDNOOBW attribution to the README when it ships.

### 3.4 Model layer

| Option | What the model does | Verdict |
|---|---|---|
| **M0 Scripted lines** | Nothing; a JSON of lines per event (start, hit, miss, big reveal, last chance, win, loss, blocked word), several variants each, `{word}`/`{letter}` slots filled by code | **Required** (v1 voice and permanent fallback). |
| **M1 Workers AI voice** | Writes one short in-character line per key moment from public state; the solver still plays | **Recommended upgrade** after v1. |
| M2 Workers AI player | Proposes each letter; code validates; the solver takes over on invalid, slow or failed replies | Optional experiment, only after an offline benchmark shows it's fun. Label it honestly in the UI. |
| M3 In-browser model | Prompt API / WebLLM | Not now (2.5). |
| M4 External API | — | Ruled out (2.5). |

M1 design:

- Route `POST /user/illucia/line` on the existing Worker (the `/user/*` route is already there; session cookie and Origin checks reused). Signed-in players only.
- Request contains only `{ event, letter, hit, pattern, guessed, missesLeft, difficulty, candidateCount }`, where `letter` and `hit` describe the guess the solver has just made (public once played). Never the secret, the username, or any player-typed text.
- The line comments on a guess that has already happened. It must never announce a *next* guess, because the solver, not the model, chooses letters. The prompt says so, and the validator rejects lines that name a different unguessed letter as her next move.
- The prompt lives server-side. Reply is capped (e.g. 160 characters, one line), stripped of markup/URLs, and checked against the blocklist. On any failure: the scripted line.
- The client fires the request at the start of Illucia's "thinking" animation (~1 s), so latency is hidden. Hard timeout ~2.5 s.
- Per-user cap (e.g. 40 lines/day) via the existing rate-limit binding pattern, plus the account-wide allowance. When either is hit: scripted lines, silently.
- End-of-round lines that mention the actual word are **templates filled by code** ("{word}? Clever."), never model-written. The word never reaches the model.
- Model choice (**DECIDE** after a taste test): start with `llama-3.2-3b-instruct` or `granite-4.0-h-micro` (cheap); try `gemma-4-26b-a4b-it` for quality.

Voice toggle (optional, off by default): browser `speechSynthesis`, $0.

### 3.5 Page design

| Option | Description | Verdict |
|---|---|---|
| **P1 Mirror layout** | Reuse the Hangman page shell. Left panel: Illucia's portrait and her "mind" (candidate count). Right text panel: her lines and turn history. Bottom: word slots + a read-only keyboard lighting her guesses green/red; six-miss meter. | **Recommended.** Consistent, reuses components and CSS. |
| P2 Chat/duel transcript | Chat bubbles, board above | Weaker fit with the existing visual language. |
| **P3 "Illucia's mind" panel** (add-on to P1) | After each guess: "4,213 words… 212… 3". At the end: a few of the words she was considering (from the clean list). | **Recommended.** Explainable AI plus vocabulary teaching in one; a strong portfolio point. |

Flow:

1. Choose difficulty (Apprentice / Scholar / Master).
2. Enter the secret word. Masked input with a show toggle; checked against the list and the blocklist, with friendly errors.
3. Illucia thinks (~0.8–1.5 s animation), guesses, the board updates. `aria-live` announces each guess.
4. Win/loss screen: the word, her "suspects", Play again. If the word happens to be one of the 105 manifest words, show its manifest facts as a bonus (no live MW calls).

Secret entry (**DECIDE**): typed secret (recommended; honest by construction) vs "answer her" mode, where the player marks positions for each guess (more authentic; code catches lies when her candidates hit zero).

Art (**DECIDE**): no Illucia character art exists yet (`client/src/Images` has Han, Artsy and `bg-illucia.*` backgrounds only). Options: an animated CSS/SVG avatar (e.g. the glowing "AI" orb motif), a derivative of existing art, or new generated art (image-generation model and cost are still an open question).

Mobile: 15-letter boards must fit at 390 px; test the longest words.

### 3.6 Scoring (**DECIDE**, not v1)

None in v1. Later options: a separate "Illucia stumped" count on the Hall of Fame, or points scaled by difficulty. Forgeable by design either way.

## 4. Recommended build order (one verified slice each)

| # | Slice | Depends on |
|---|---|---|
| I0 | HARD RULES v4 in both mirrored copies (docs-only commit) | — |
| I1 | Extract game core; characterization tests first; Hangman switches to it; closure / `remainingTries` / answer `<div>` removed | — |
| I2 | Word-list build tool in `tools/` (SCOWL levels, offensive filter, blocklist), static output, licence notices, tests | — |
| I3 | Solver module + "no peeking" test + in-repo benchmark script reproducing table 2.2 | I1, I2 |
| I4 | Illucia page v1: P1 + P3, scripted lines (M0), difficulty, lazy-loaded list, a11y, mobile | I3 |
| I5 | M1 Workers AI voice behind the Worker route, caps, timeouts, fallback; Worker tests | I0, I4 |
| I6 | Optional: `speechSynthesis` voice toggle | I4 |
| I7 | Optional experiment: offline M2 benchmark (letter-picking by model vs solver), then decide | I0, I3 |

## 5. Decisions needed

1. Approve the order: core → solver + scripted → Workers AI voice (M1); M2 only as an experiment.
2. Difficulty = vocabulary size (Apprentice / Scholar / Master)?
3. Typed secret vs "answer her" mode.
4. Illucia's art source.
5. Scoring: none in v1?
6. Registered-only stays? (Required for M1; optional for the local game.)

## 6. Verification checklist

Repeated-letter reveals · hits cost nothing · six misses end the game · no repeated guesses · solver never receives the secret (test with a positive control) · stop after win/loss · restart cancels pending turn and model request · list rejects non-words and blocked words · model reply validation, timeout, per-user cap, quota exhaustion → scripted fallback · no player text, secret or username in the model request (assert on the request body) · `aria-live` announcements · 390 px layout with a 15-letter word · lazy list not in the main bundle.

## Sources

Solver: [sharkfeeder](http://www.sharkfeeder.com/hangman/) · [Trexquant-style solutions](https://github.com/techbhuvi04/Hangman-Challenge) · [LSTM/trie solution](https://github.com/aghalandar/Hangman_solution) · [n-gram solution](https://github.com/simrann20/Hangman_Game_Project) · [Evil Hangman complexity](https://arxiv.org/abs/2003.10000) · [ethan-schaffer/Hangman-Solver](https://github.com/ethan-schaffer/Hangman-Solver)
Models: [LLMs Can't Play Hangman](https://arxiv.org/html/2601.06973v1) · [CharBench](https://arxiv.org/html/2508.02591) · [Workers AI models](https://developers.cloudflare.com/workers-ai/models/) · [pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) · [limits](https://developers.cloudflare.com/workers-ai/platform/limits/) · [JSON mode](https://developers.cloudflare.com/workers-ai/features/json-mode/) · [AI Gateway pricing](https://developers.cloudflare.com/ai-gateway/reference/pricing/) · [Gemini API terms](https://ai.google.dev/gemini-api/terms) · [Prompt API](https://developer.chrome.com/docs/ai/prompt-api) · [WebLLM](https://webllm.mlc.ai/) · [WebGPU support](https://web.dev/blog/webgpu-supported-major-browsers) · [SpeechSynthesis](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis)
Word lists: [SCOWL/ESDB](https://github.com/en-wl/wordlist) · [ENABLE readme](http://wiki.puzzlers.org/dokuwiki/doku.php?id=solving:wordlists:about:enable_readme) · [wordfreq](https://github.com/rspeer/wordfreq) · [LDNOOBW](https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words) · [wordlist-js](https://github.com/jordanshatford/wordlist-js)
