# CLAUDE.md — Hangman: Rescue Mission

PROJECT: Web-based Hangman word game for learning English vocabulary and pronunciation. Built 2023 as a MERN bootcamp project (Social Hackers Academy); rebuilt as a portfolio piece on Cloudflare's free tier. This file is auto-read at session start.

The rebuild is live. The project is now redesigning, reimagining, improving and inventing. Past decisions recorded below describe how things work today, not rules: only CONSTRAINTS bind. When a slice instruction changes something described here, update the description.

<!-- ┌─ SYNC v7 · CONSTRAINTS · mirrored in CLAUDE.md + project instructions -->
<!-- │  Edit one → edit the other → bump BOTH version numbers. -->

## CONSTRAINTS

- App UI language = English. This is an English-vocabulary learning game; all in-game text stays English. (A sibling project has the opposite rule — do not pattern-match Greek UI conventions across.)
- Running cost must stay $0. Cloudflare free tier only; free allowances are ceilings, never a reason to upgrade. Any proposal requiring a paid plan gets flagged for a decision, never implemented silently.
- Passwords: browser-side PBKDF2-HMAC-SHA-256 at 600,000 iterations with a random per-account salt; the Worker stores only an HMAC verifier under a separate secret pepper. The work factor only ever rises (through a new `kdf_version`); never lower it to fit a CPU limit. The raw password never leaves the browser, and the derived credential is never stored or logged.
- Secrets: never committed, never a literal in source. `tools/` reads a gitignored `.env`; the Worker's local secrets live in ignored `server/.dev.vars*`; production secrets go in via `wrangler secret` only. `*.zip`, `node_modules`, `.wrangler/` and build output are never staged.
- Every deploy is production; there is no staging. A push to `main` publishes the frontend to hangman.spyrostrimis.com, and `wrangler deploy` from `server/` publishes the API immediately. Treat both as deploys to a public URL.
- Merriam-Webster: use the Collegiate Dictionary API only. Non-commercial only, 1000 queries/day/key. Attribution required in UI and README. Wherever MW content is displayed, MW's official branding guidelines apply and are binding: feature the unmodified official Merriam-Webster logo (PNG on web, at 50×50, 100×100 or 125×125, with the ® kept visible at bottom right), and write the product title out in full as "Merriam-Webster's Collegiate® Dictionary with Audio" — the ® is required on the first use of "Collegiate" on a page. Never "Webster's" alone; always hyphenate Merriam-Webster.
- Example sentences must be REAL, sourced from Merriam-Webster with attribution. Never LLM-generated quotations attributed to real authors, works, or dates. The 2023 version did this and it was wrong.

<!-- └─ /SYNC v7 · CONSTRAINTS -->

## CURRENT REBUILD STATE

HEAD `a0fde5e` on `main` (2026-10-03), pushed; the commit updating this line follows it. Account implementation deployed and verified on 2026-09-27; see server/RELEASE.md for local and production evidence and remaining limitations.

- The static word-game and route-background/loading slices are rebuilt and live.
- The account/score slice is live: Hono Worker, D1 migrations, client-side PBKDF2 stretching, server HMAC verifiers, expiring cookie auth, connected forms, and cumulative scores. Live browser signup, login, logout, session persistence, and a winning round saving 100 points were verified. New usernames are 3–20 letters or digits (`shared/auth-protocol.js`); sign-in still accepts up to 35 so accounts made under the old limit are not locked out.
- The old Express/MongoDB/OpenAI server has been removed. server/ now contains the replacement Worker, tests, migrations, and deployment documentation.
- The browser uses relative /user/* API paths; Vite proxies these to the local Worker. JWTs and password-derived credentials are never stored in localStorage.
- Illucia (Play vs AI) is live for signed-in players on two pages: `/illucia`, a duel told as a scrolling conversation (`4148ce2`), and `/illucia-observatory` (`97f0a24`). Built on I1 shared game core (`b482b9b`), I2 vocabulary (`2fad03f`, profanity filter hardened in `41ad9fe`), I3 solver and policy benchmark (`4899677`) and I3b tier fallback and benchmark (`142d774`, regenerated in `601d02c`). Browser speech (I6) was built in `21572c6` and reverted in `ec388f5`. Her strength on the live pages is measured in `docs/ILLUCIA-STRENGTH.md` (`6acd239`). History and measurements: `docs/planning/PLAN-illucia.md`. Illucia v2 is agreed but not built: `docs/planning/ILLUCIA-V2-DECISIONS.md` (`e9d90c1`, 2026-10-02). See ILLUCIA below.
- Phone pass (MOB): complete, confirmed by Spyros 2026-09-28. Its slices included the Hangman page (`926f303`) and Hall of Fame (`df9ec04`).
- Round scoring is live (`f865419`, deployed 2026-10-01), and so is the five-second floor (`c25199d`; Worker and migration `0004` deployed 2026-10-01). See SCORING below.
- Illucia points (v2 Track C1) are deployed (2026-10-02: migration `0006`, Worker `d6721260`): committed word, rules-checked claims, once-per-word and the ladder (`c363ac1`, `fdffece`, `be62b76`), with the `/privacy` copy (`9deeced`). Since E3 (`9e4c8b3`, pushed 2026-10-03) the `/illucia` page starts and claims scored rounds, so players earn Illucia points; no authenticated production check of a claim is recorded yet. Production checks covered the unauthenticated surface only; see `server/RELEASE.md`. Player memory (C2: play history, per-tier stats, global word counts, personality seed, `brain`/`voice` memory on start, `GET /user/illucia/stats`) is deployed too (2026-10-02: migration `0007`, Worker `352bfbb2`; `ee5d50b`, `6108bc2`, `139a21e`, with the `/privacy` copy `281dad2`). `/illucia` uses it since E3/E4 (server seed and `brain` into her guessing, `voice` in her end-of-round lines, the stats panel). `GET /user/illucia/stats` also returns `ladder` and `spent` since `3a69270` (deployed 2026-10-03 as Worker `5c259e32`, recorded after the fact in `server/RELEASE.md`; unauthenticated checks only). See SCORING below.
- Privacy slice: account deletion (`b81f1a5`), round-record expiry with limited diagnostic logging (`a595383`) and a plain-language `/privacy` page (`5db5300`) are committed and pushed, so the frontend is published. Both are deployed: migrations `0003` and `0005` were applied remotely and Worker `d2999968` deployed on 2026-10-01, recorded after the fact in `server/RELEASE.md`. No production check of deletion or of a scheduled retention run is recorded.
- README.md describes the new architecture; server/README.md specifies the credential protocol, limitations, and release/rollback procedure.

The rebuild uses small verified slices on main. Every push publishes the frontend; the API is deployed separately. Preserve the distinction between implemented, tested locally, and verified live.

## TARGET STACK

- Client: React 18.2 + Vite 8.2.2 on Cloudflare Pages. CRA is gone. React 19 remains a later, separate upgrade.
- API: Hono on Cloudflare Workers, implemented in `server/src/`, routed under the site's `/user/*` path. See `server/RELEASE.md` for production status.
- Data: static JSON manifest (words) — BUILT AND LIVE at `client/src/data/words.json` · R2 (paintings) — LIVE, 105 objects in bucket `hangman-assets`, served from `https://assets.hangman.spyrostrimis.com` · D1 (users, scores) — schema and migrations implemented; remote provisioning status is recorded in `server/RELEASE.md`.
- Auth: `jose` JWTs expire after 24 hours in HttpOnly cookies. The user tested bcryptjs and confirmed the CPU problem, then approved browser Web Crypto PBKDF2-SHA-256 at 600,000 iterations with peppered HMAC-SHA-256 server verifiers. Stable secret-derived dummy salts and native HMAC verification are implemented. See `server/README.md` for the exact protocol and limitations. Initial deployed CPU measurements are recorded in server/RELEASE.md; do not weaken stretching.
- Word-data pipeline: `tools/`, Node, local-only. The one exception is the Illucia vocabulary build, `tools/build_illucia_words.py` (Python 3.12+, standard library only), because it runs ESDB's own Python query builder; `npm test` in `tools/` shells out to Python for its tests. MW Collegiate only, for definition, part of speech, written pronunciation, audio filename, and an optional attributed `vis` example. There is no Merriam-Webster Thesaurus API in this project.
- Enrichment (`hints.synonym`, `hints.clue`, `explanation`): **LLM-authored during planning conversation, human-reviewed, and committed as static data in `tools/enrichment.json`.** There is no enrichment generation harness and `tools/` never calls OpenAI. The `source` / `provenance` values stay `"llm-generated"` because that describes who produced the text, not how it was transported.
- Manifest assembly: `tools/build-manifest.js` is a small deterministic assembler, not a generator. Inputs `tools/words.locked.json` + `tools/output/mw-probe.json` + `tools/enrichment.json`; output `client/src/data/words.json`.
- Image generation, if it ever happens: paintings are square, so any new art sits beside the 512×512 originals (the 116 surviving 2023 DALL·E 2 paintings). Model, size and cost are undecided (earlier notes named `gpt-image-2` at 1024×1024; that is a candidate, not a decision). Not currently needed: all 105 shipping words already have a rescued painting.
- Illucia (live on `/illucia` and `/illucia-observatory`): local solver in `client/src/lib/illucia/` over a filtered ESDB/SCOWL v2 word list served as static per-length files from `client/public/illucia/words/`; scripted commentary. See ILLUCIA below.

Already removed: CRA, `mdb-react-ui-kit`, Font Awesome, client `axios` and `jwt-decode`, and the legacy server dependency set. `client/src/base.css` intentionally preserves only a small reset/popover subset. `read-more-react`, `web-vitals`, and `buffer` remain for separate cleanup. The account component tests now use Testing Library; do not remove its dependencies as CRA leftovers. Still used: `react-simple-typewriter` (Wordfacts). `react-bootstrap` and `react-tooltip` are no longer imported anywhere (Home's popovers became crew cards in `688d83b`; `react-tooltip` was only ever a commented-out import), and the popover rules in `base.css` are unused too; Spyros chose on 2026-09-28 to keep both packages. Verify actual imports before removing any other package.

## GIT

- Remote is `git@github.com:spyrostrimis/hangman.git` over SSH. Verify with `git remote -v` before any push — this repo has already had a stale remote once.
- `github.com/spyrostrimis/hangman` is the ONLY repo. No other remote exists, and no other copy of the 2023 history exists. Three 2023 merge-commit MESSAGES still name a retired repo; that is deliberate — rewriting them would rewrite every later hash in the history (101 commits at `3a4fa1d`, 60 of them from 2023) and destroy the preserved 2023 dates. Never offer to clean them.
- `main` only. No feature branches.
- `push.autoSetupRemote` is unset locally and globally on this machine. Any new branch starts with no upstream and `git status` then stays SILENT about unpushed commits on it. (Moot while we stay on `main`, but know it.)
- `core.autocrlf` is on. `.gitattributes` exists and contains exactly `* text=auto eol=lf`; watch for unexpected line-ending churn.
- Server secrets and runtime output are ignored by `server/.gitignore` (`.env`, `.dev.vars*`, `.wrangler/`). `tools/.gitignore` ignores `cache/`, `output/`, `.env` and `__pycache__/`. There is no root `.gitignore`, and the client still has the CRA ignore rules. Keep account deployment credentials inside the ignored server locations; never create plain secret files at the root or in the client.
- `../hangman-export/` is a SIBLING folder outside this repo — 203 MB of rescued 2023 data plus its own `node_modules`. It is not part of the repo and must never be moved into it or staged.

## WORD DATA — FILE MAP

Committed (tracked):

- `tools/words.locked.json` — canonical 105-word corpus. THE authority for validation; never a generated count.
- `tools/mw-overrides.json` — 76 explicit human `entry_id` + `unit` selections. Ambiguity is resolved here, never by hidden ranking.
- `tools/enrichment.json` — reviewed synonym / clue / explanation per word. Flat `word -> {synonym, clue, explanation}`; deliberately carries NO provenance wrappers, which the assembler assigns.
- `tools/schema/manifest.schema.json`, `tools/validate.js` — the manifest contract and its enforcement.
- `tools/build-manifest.js` — deterministic assembler.
- `tools/prepare-images.js` — deterministic PNG→WebP conversion. Requires an explicit `--source-dir`; publishes through a verified staging directory; excludes retired words; verifies output keys against the manifest. Owns `sharp` 0.35.3.
- `client/src/data/words.json` — the built runtime manifest, 105 records, validator-green.

Illucia vocabulary (committed; see `tools/ILLUCIA-WORDS.md`):

- `tools/illucia-sources.json` — ESDB release, commit and archive SHA-256, plus the LDNOOBW list and licence at an exact commit and SHA-256.
- `tools/illucia-filter.json` — reviewed project filter, one reason per entry. `block`: slurs and spelling variants neither upstream list catches (owner decisions 2026-09-28: block `chink` and `homo`; keep `retard`, `queer` and `gay`). `allow`: forms kept because they also belong to a clean lemma (`came`); a stale allow entry fails the build.
- `tools/build_illucia_words.py`, `tools/test_illucia_words.py` — deterministic build and its tests. A word is blocked if it or its ESDB lemma is a blocked term; `--check` rebuilds and compares byte for byte.
- `client/public/illucia/words/4.txt` … `15.txt` — sorted `word size` lines (135,897 words; 3-letter words were dropped in v2 A1), plus `manifest.json` (hashes, counts, policy), `CREDITS.txt` and both licence files. `client/public/illucia/credits.html` is the credits page.
- `tools/benchmark-illucia.js`, `tools/benchmark-illucia-tiers.js` — seeded I3/I3b harnesses; reports in `tools/benchmarks/`, results in `tools/ILLUCIA-SOLVER.md` and `tools/ILLUCIA-TIERS.md`. Regenerate the reports whenever the word files change.
- `tools/benchmark-illucia-models.js`, `tools/lib/illucia-model.js`, `tools/lib/illucia-dictionary-model.js` — the I7a model-versus-solver experiments (local research, not wired into any page). The offline run (`npm run benchmark:illucia-models`) needs no account; `--live --free-plan` runs call Workers AI over REST with credentials held in memory and a daily budget ledger and lock in ignored `tools/output/`. Reports in `tools/benchmarks/illucia-i7a*.json`, results in `tools/ILLUCIA-MODELS.md` and `tools/ILLUCIA-DICTIONARY.md`.
- `tools/benchmark-illucia-questions.js`, `tools/lib/illucia-question-model.js` — the v2 D1 offline test of Workers AI models for experimental mode (local research, no page or Worker route): a model invents a yes/no meaning question over ≤80 candidates and sorts them, or sorts under a WordNet question (control); code validates and scores against the B1 labels. Reuses the I7a live session (`openLiveSession`: credentials in memory, lock, shared daily ledger) and adds `--max-run-neurons`. D1 has its own model allowlist, `QUESTION_MODELS`. Frozen states, reports and the reviewed question mapping are in `tools/benchmarks/illucia-d1*.json`; results are in `tools/ILLUCIA-AI-QUESTIONS.md`.

Illucia question labels (committed, B1; see `tools/ILLUCIA-LABELS.md`; nothing reads them yet):

- `tools/illucia-wordnet-sources.json` — Open English WordNet 2025 (`english-wordnet-2025.xml.gz`) and both licence files, pinned by commit and SHA-256. Separate from `illucia-sources.json` on purpose.
- `tools/illucia-categories.json` — 41 reviewed categories (code, key, kind noun/verb/adjective, "Can your word mean …?" question, WordNet lexfiles or "kind of" synsets). `tools/illucia-wordnet-exclude.json` — reviewed senses (obscene terms, group slurs), one reason each.
- `tools/build_illucia_labels.py`, `tools/test_illucia_labels.py` — deterministic build (YES if ANY sense fits; inflections take their ESDB base word's senses in the inflected part of speech only; never through a blocked base) and its tests; `--check` as for the words.
- `client/public/illucia/labels/4.txt` … `15.txt` — sorted `word codes` lines; `-` = known to WordNet with no category; an absent word is unknown ("no bonus possible"). Plus `categories.json`, `manifest.json` (input word-file hashes, coverage), `CREDITS.txt` and both licence files. Rebuild whenever the word files change.

Illucia questions (committed, B2; see `tools/ILLUCIA-QUESTIONS.md`; `/illucia` asks them since E2, the Observatory since its slice 4; labels load through `client/src/lib/illucia-assets.js`):

- `client/src/lib/illucia/questions.js` — pure question chooser: `chooseQuestion` (public state, vocabulary, labels, offers and her round seed only; unknown words counted in the total; `QUESTION_RULES`: a broad category (whole lexicographer file) needs ≥25% per side and waits until ≤2 misses left, a narrow one ("kind of") needs ≥10% and gets +10 points; with a seed she picks among questions within 10 points of her best, without one strictly the best; each question tagged `early-narrow` / `late-broad` with her shortlist; nouns only and not before her third guess by default; at most 2 offers, declines included; `B2_RULES` keeps the first rules for comparison), `narrowKnowledge`, `checkAnswer` (game code's side, the only one that takes the secret), `parseLabels`, `parseCategories`.
- `tools/benchmark-illucia-bets.js` — paired benchmark (questions are an optional bet): decline vs answer one or both, by timing and category set, plus two selective players, per tier; pricing at ×1.5/×2.0 (and the old ×1.25/×1.5) with a hindsight bound; the tier-order gate with questions. Worker threads; the decline arm must equal the strength play. Report `tools/benchmarks/illucia-bets.json` (first rules, strict policy). `--brain temperament` (`npm run benchmark:illucia-bets-a2`) plays her A2 temperament, 8 seeds per word, B2's rules against the current ones; report `tools/benchmarks/illucia-bets-a2.json`. Not to be confused with D1's `benchmark-illucia-questions.js` (the model runner).

Local-only (gitignored, never committed):

- `tools/cache/collegiate/` — real MW responses. All 105 cached; reruns cost 0 GETs.
- `tools/output/mw-probe.json` — probe/report output. Report-only fields must never leak into the manifest.
- `tools/output/paintings/` — generated WebP delivery assets.
- `tools/.env` — `MW_KEY`.
- `tools/cache/illucia/` — checksum-verified ESDB and LDNOOBW downloads. The first build needs `--download`; later builds are offline.
- `tools/cache/illucia-wordnet/` — checksum-verified OEWN 2025 download and licence files for the label build (which also reads `tools/cache/illucia/`).

## HINT / UI SEMANTICS

How Hangman's word content works today; relevant to anything touching `hints`, `example`, or `explanation`:

- **HINT 1 is `synonym`** and is the HARDER hint — a short synonym or close semantic equivalent, deliberately not a giveaway. It need not be a strict dictionary synonym where English offers no useful exact one.
- **HINT 2 is `clue`** and is the friendlier fallback, a descriptive phrase giving more help after HINT 1.
- **The painting is a post-guess REWARD, not an aid.** It appears only after the player wins; a loss shows a Game Over screen instead. Hint text is not derived from the painting and does not describe it.
- **`explanation` and `example` are post-answer content**, shown after the word is solved. That is why answer-leak validation covers `synonym` and `clue` only.

## SCORING

How signed-in Hangman scoring works today (full design, release evidence and limits: `docs/SCORING.md`):

- The Worker issues account-bound round tickets and chooses the word. Gameplay stays local, with no per-guess requests.
- A winning claim sends the guesses; the Worker replays them through the shared rules in `shared/hangman-core.js` and awards 100 points at most once per round, including retries and concurrent claims.
- Five-second floor: a ticket cannot be consumed or awarded before `issued_at + 5,000 ms`. Early claims get HTTP 409 `ROUND_TOO_EARLY`; the client holds the win behind "Saving…" and silently waits and retries. With one outstanding round per account and issuance no earlier than the previous award, each account is bounded to 12 awards per minute. There is no daily cap.
- Illucia (API deployed 2026-10-02; `/illucia` calls it since E3): `/user/illucia/start` commits the player's word and issues a separate ticket with a 32-bit seed; `/user/illucia/claim` rules-checks that the guesses reach her sixth miss (her choices are not replayed), with a 15 s floor. Stump points = tier base 30/40/50 × min(length − 3, 3), ×1.5/×2 for one or two answered questions (client-reported); only in-tier, unspent words pay; experimental rounds pay 0. Ladder +100. Words that beat her are kept per account until deletion. Cheater ceilings per account: Hangman 1,200 and Illucia 1,300 points/minute. The 15 s floor and ×1.5/×2 multipliers (C3, `d0dc2e1`) are deployed (Worker `b5095175`, 2026-10-02).
- Answers are public by design: the round-start response carries the word. Scripts can manufacture valid histories, so validated submissions do not prove human or honest play, and the Hall of Fame is not a trusted competition ranking.

## FRONTEND DELIVERY / LOADING

- `App.js` owns a single `.page-shell`; `PageBackground.js` renders the route art in a separate isolated layer stack: the art on screen stays until the next image has loaded and decoded, then the new one crossfades over it (280 ms). Body-class effects and body background swapping were retired because the old approach flashed between routes and made blended backgrounds unstable while scrolling.
- `lib/page-art.js` is the routing authority for desktop/mobile background pairs. `/`, `/hangman`, `/illucia`, and `/hall-of-fame` have explicit art; login, signup, and unknown paths intentionally fall back to home art. Mobile selection is `(max-width: 800px)`.
- Background and character art are prefetched only after link intent (pointer over, focus, or touch). `preload-images.js` deduplicates pending/completed work, swallows speculative failures, and permits retry. `saveData` and 2G connections are respected; routes are not eagerly preloaded.
- TechnoBoard and Bruno Ace SC ship as local WOFF2 with `font-display: swap`; Roboto comes from local `@fontsource/roboto` package assets. There are no runtime web-font requests.
- Character images used on the first view have intrinsic dimensions to prevent layout shift. Keep dimensions accurate if those files change.
- `lib/leaderboard.js` validates `/user/get-best-scores`, forwards cancellation, and enforces a 10-second timeout through `lib/api.js`. `Halloffame.js` retains loading, empty, ready, and failure states.

## RUN / TEST

From `client/`, run `npm run dev` for the Vite development server, `npm run build` for a production build, and `npm run preview` to serve the production build locally. `.claude/launch.json` defines `client-preview` (vite preview on port 4173) for the desktop app's browser pane.

From `tools/`, run `npm test` (249 tests, 2026-10-03; needs Python 3.12+ on PATH) and `node validate.js ../client/src/data/words.json`. Illucia: `python tools/build_illucia_words.py --check` from the repo root (about a minute), `python tools/build_illucia_labels.py --check` (about 80 seconds), `npm run benchmark:illucia` and `npm run benchmark:illucia-tiers` (several minutes each). The pipeline is local-only and never runs in production.

From `client/`, run `npm test` (115 Node tests), `npm run test:ui` (101 React component tests), and `npm run build`. From `server/`, run `npm run setup:local`, `npm run types`, `npm run check`, `npm test` (81 Workers/D1 integration tests), and `npm run build` (dry run). User-visible CSS, responsive art, navigation, popovers, forms, and loading states still need manual browser verification in proportion to the change.

## DEPLOYMENT

- Cloudflare Pages project: `hangman`
- GitHub repo: `spyrostrimis/hangman`
- Production branch: `main`
- Root directory: `client`
- Build command: `npm run build`
- Build output directory: `dist`
- Pages URL: `https://hangman-caq.pages.dev`
- Production URL: `https://hangman.spyrostrimis.com`
- Git integration is active: pushes to `main` trigger production builds and deployments.
- API: Worker `hangman-api`, deployed separately with `wrangler deploy` from `server/` (straight to production), routed at `hangman.spyrostrimis.com/user/*`, D1 `hangman-accounts`. Setup, release and rollback: `server/README.md`, `server/RELEASE.md`.
- SPA fallback was manually verified with a direct nested route.
- Current production checks (2026-09-28): `/`, `/hangman` and `/illucia` return HTTP 200; the served `/illucia/words/manifest.json` reports 137,389 words. Production remains a single Vite bundle with no code splitting yet.
- `client/public/_headers` caches `/assets/*` (hashed build output) as `public, max-age=31536000, immutable`. Everything else, including the unhashed Illucia word files, revalidates. Pages redirects `/illucia/credits.html` to `/illucia/credits`.
- R2 bucket: `hangman-assets`, Standard class, EEUR. Custom asset domain `https://assets.hangman.spyrostrimis.com`, SSL active. **`r2.dev` is DISABLED** — never use an `r2.dev` URL. 105 objects at `paintings/<word>.webp`, all verified HTTP 200 / `image/webp` / `public, max-age=604800`.
- Client asset base defaults to the custom domain and can be overridden with `VITE_ASSET_BASE_URL`. There are no per-word hard-coded painting URLs.
- Note: wrangler's aggregate bucket-info metrics briefly reported 0 objects / 0 B after upload while direct enumeration proved all 105 present. Treat the aggregate as lagging analytics, not object absence.

<!-- ┌─ SYNC v3 · CHANGE DISCIPLINE · mirrored in CLAUDE.md + project instructions -->
<!-- │  Edit one → edit the other → bump BOTH version numbers. -->

## CHANGE DISCIPLINE

- Small, scoped, one concern per change. Reviewable diffs.
- Flag any bonus or adjacent fix explicitly. Never bundle silently.
- Multi-file or bug work: trace data flow directly across methods and files. No shape pattern-matching. Prefer direct file reads over subagent summaries that drop cross-method context.
- Before claiming done: show the real diff, run the tests and show real output, and call out anything still needing manual browser testing. Never assert "passes" without evidence.
- Tests must be proven non-vacuous: break the fix, confirm the test fails, restore. A green test never seen red proves nothing. Every negative assertion needs a positive control on the same fixture in the same run.
- When changing behaviour you mean to keep, write characterization tests first, passing against the unmodified code. Do not write them for code being deleted. New behaviour gets new tests written against the new behaviour.
- One commit per change; manual verification BEFORE the commit.
- CARVE-OUT: config removal and dead-code deletion can't be "seen working." The verification is the real diff plus a grep proving nothing references the removed thing. Say so in the commit message.

<!-- └─ /SYNC v3 · CHANGE DISCIPLINE -->

## REMAINING GAME LANDMINES

The account rebuild removed the legacy server, localStorage authentication, disconnected Hello/AuthWrapper files, signup error fall-through, and winner-score side effect from Word.js. I1 (`b482b9b`) moved the rules into `client/src/lib/hangman-core.js` (a round is `{ answer, guesses }`, `MAX_MISSES = 6`) and fixed the stale keyboard closure, the redundant `remainingTries` state, the answer in a transparent div, and case-sensitive physical keys. The old audit in Git history describes earlier trees, not the current implementation.

Still open:

- There is no gallows: the story is rescuing a robot. The old BODY_PARTS code was deleted from `Components/Figure.js`; Artsy's screen shows reboot progress instead.
- Header/Footer imports and commented render references remain. React StrictMode is still disabled in the app, but the score lifecycle is tested under StrictMode and must not depend on that setting.
- Game messages remain inline in App.js; the rules come from `hangman-core.js`.
- Scores are validated but still manufacturable: round tickets, shared-rule replay, one award per round and the five-second floor are deployed (2026-10-01, production API checks passed), yet a script that reads the public answer can still earn up to 12 awards per minute per account (see SCORING). Production browser verification of scoring was blocked by browser permissions. Evidence and limits: docs/SCORING.md.

## WHAT IS LIVE

The rebuilt word-game path is WIRED AND LIVE at `hangman.spyrostrimis.com/hangman`. The production game selects from `client/src/data/words.json`, makes no runtime word API request, derives painting URLs from `image.key` against `https://assets.hangman.spyrostrimis.com`, plays hotlinked MW audio, shows the painting on a win only, and displays MW branding.

**The old backend is not required for word gameplay.**

Also live from the current frontend pass: responsive route-specific backgrounds with crossfades, local fonts, intent-based image preloading, stable background blending during scroll, reserved character-image dimensions, SPA links between login/signup, bounded Hall of Fame loading/failure UI, and phone layouts for the Hangman page and Hall of Fame.

Illucia is live on `/illucia` and `/illucia-observatory` for signed-in players; both pages load the published per-length word files and link the credits page.

Accounts, Hall of Fame data, and winner-score handling are deployed and browser-verified. Initial Worker CPU measurements were 1.96 ms median and 3.56 ms P99 on the confirmed Free plan. See server/RELEASE.md for the small-sample qualification and full release evidence.

Keep three states apart when writing status: implemented/committed, agreed/planned, and actually wired/live. The word-game and frontend-loading slices are live; the account release record is the authority for the Cloudflare account layer.

## IMAGE ASSET CONVENTIONS

The durable convention is: **source painting → prepared WebP delivery asset → R2 key matching the manifest.** Source dimensions are not part of the contract.

Current rescued corpus only: source PNGs are 512×512, converted at quality 90, preset `picture`, smart subsampling on, effort 6. That q90 setting was chosen by manual review of q80/q85/q90 samples on these specific paintings — q80 and q85 were visibly inadequate.

Neither number is general. 512×512 describes the 2023 corpus, not a dimension contract. Any future generated paintings may use different and larger source dimensions, and their generation settings are explicitly undecided.

## ILLUCIA — PLAY VS AI (LIVE)

The reverse game: the player sets a secret word; Illucia guesses one letter at a time. A hit reveals every occurrence and costs nothing; six misses and the player wins. Same rules as the main game — one shared core (`hangman-core.js`), not a copy.

Two pages are live for signed-in players (guests see "Only for registered players"):

- `/illucia` — the duel, rebuilt as a scrolling conversation (`4148ce2`). Illucia asks for a letter and explains her guess; on a hit the player taps the grey tiles to reveal it, on a miss the player replies; game code decides every hit, tile position and miss. Scripted lines in `duel-lines.js`.
- `/illucia-observatory` (`97f0a24`) — Illucia's character art, a star field of the words she still considers and a letter-score analyser (since Observatory slice 2: her score per letter from the decision record's `letters`, her shortlist outlined above a dashed `cutoff`, a vowel's early lean as a violet top; the reasoning line `notebookLine` comes from the same record); pause, 2× speed and rematch at the next tier. Scripted lines in `observatory-lines.js`.

How it works today. `docs/planning/PLAN-illucia.md` holds the build history and measurements; `docs/ILLUCIA-I4.md` the first page's evidence; `docs/ILLUCIA-STRENGTH.md` her strength on both live pages. Bullets marked *(v2 replaces)* describe live code that the agreed v2 design changes; see ILLUCIA V2 below.

- **Moves come from a local solver** *(A2 replaces the tie-break)*. `client/src/lib/illucia/` (`candidates.js`, `strategy.js`, `lexicon.js`, `public-state.js`): filter the word list by length, revealed pattern and every guessed letter; guess the unused letter whose remaining candidates weigh most, each candidate counted by commonness (`commonnessWeight`: ESDB size ≤35 → 10, 40–50 → 3, 55–70 → 1; v2 A1), ties alphabetical. Pure, deterministic, tested. The I3 benchmark found no unweighted alternative policy that clearly beat plain counting.
- **The solver sees the board only** *(v2 replaces)*. `toPublicState(round)` is its only input: a frozen snapshot of length, pattern, guessed and missed letters and misses left, registered in a private WeakSet so the solver rejects anything else. A test proves it, with a positive control. v2 keeps the secret word out of her guessing but adds per-round and per-player inputs (seed, learned words, letter prior).
- **Difficulty is vocabulary size** *(v2 replaces)*: Apprentice ≤35 / Scholar ≤50 / Master ≤70 (ESDB sizes), confirmed by Spyros 2026-09-28 and exported as `VOCABULARY_TIERS` from `lexicon.js`. Since v2 A1 every tier weights its candidates by commonness (Apprentice, who knows only size-35 words, plays exactly as before); per-tier temperaments (A2) are still to come. Zero candidates at Master is a bug and throws, and the pages catch it so a bug can't crash the round. At Apprentice/Scholar it is expected for out-of-tier words, and the fallback picks the unused letter found in the most of that tier's own words of that length (unweighted).
- **Measured strength** (`docs/ILLUCIA-STRENGTH.md`, 2026-09-30, updated 2026-10-02): both pages match the benchmark move for move. Unweighted, **the tiers inverted on common short words** (4 letters: Apprentice 56% vs Scholar 46% vs Master 42%), because a bigger vocabulary holds more short look-alikes. With weighting (v2 A1) the tier-order gate in the strength script passes (0 of 171 comparisons fail; one-sided exact McNemar, Holm, 5%): on common 4–6-letter words the tiers are level (72.9 / 72.3 / 72.5%), at a cost on rare words Master knows (I3b rare band 92.1% → 87.2%). I3b's 5–9-letter figures: Apprentice ~93% against common words but ~9% against less-common ones; Master 93% / 88% / 84% on common / medium / rare (`tools/ILLUCIA-TIERS.md`). Her A2 temperament (8 shared seeds per word in the benchmarks) also passes the gate and the strength cap (≤2 points lost on sets b and d against strict A1; the largest loss is 0.75); about 6 distinct guess sequences per word over 8 seeds, openings still mostly E.
- **Player words come from the accepted list** (`isAcceptedWord`: A–Z, length 4–15 since v2 A1, size ≤70, profanity-filtered; the pages share its `isWordShape` check); out-of-list words would collapse the solver. Accepted list and tier knowledge are separate questions with separate functions. Each round fetches only the chosen length's file.
- **Word list:** built by `tools/build_illucia_words.py` from pinned ESDB/SCOWL v2 (MIT-like licence; keep its copyright notice): American English, normal variants, no special categories, one file per length, each word with its ESDB size. Blocked: ESDB offensive/vulgar groups, exact LDNOOBW (CC BY 4.0) matches, `tools/illucia-filter.json` block entries, and every word whose lemma is a blocked term. Whole-word matching only, so `class` and `cocktail` pass. The npm SCOWL build contains profanity, so it is not shipped unfiltered. README and `credits.html` credit both sources, and both pages link the credits page. When the word files change, rerun `--check` and both benchmarks.
- **Commentary is scripted**: per-event lines with `{letter}`/`{word}` filled in by code. Workers AI commentary and a model-driven contestant have been explored (PLAN-illucia I5/I7) but nothing model-driven is wired into a page.
- **No speech.** Browser speech (I6) was built in `21572c6` and reverted in `ec388f5`: Illucia and the player do not speak.
- **Points**: since E3, `/illucia` duels earn Hall of Fame points through the server's round tickets (see SCORING); since Observatory slice 3 the Observatory's duels do too (same session, tickets, ladder and claim).

## ILLUCIA V2 (AGREED; A1-A3 AND E1-E5 PUSHED)

Decided by Spyros on 2026-10-02; the full design, acceptance criteria and work tracks are in `docs/planning/ILLUCIA-V2-DECISIONS.md`. A1 (commonness weighting, 4-letter minimum), A2 (temperament) and A3 (memory) are pushed. Track E (the `/illucia` page) ran as one session on 2026-10-03, one commit per step, each pushed to `main` for Spyros to check on the live site: E1 honest reasoning lines (`7cf9144`), E2 WordNet questions and the answer/decline offer (`2cb341e`), E3 scored rounds, points, ladder and "already won" (`9e4c8b3`), E4 the record panel and memory lines (`2946891`), E5 experimental AI mode (`a0fde5e`). Live browser checks of each are Spyros's. Where it conflicts with the "how it works today" bullets above, it is the target; those bullets stay true of the live code until each slice lands. Values the decisions mark *(start)* are tuning starting points, not commitments.

- **Thinking:** *done in A1:* candidates weighted by ESDB size as the integers 10/3/1, each tier still limited to its own ceiling, fallback unweighted, minimum word length 4 everywhere; the acceptance gate (no tier below a lower tier beyond noise, `tools/lib/illucia-gate.js`) passes. *Built in A2:* both pages play her temperament with a per-round seed: `/illucia` uses the server's round seed since E3 (a local `newLocalSeed()` only when the start fails and the duel is unscored); the Observatory uses it too since its slice 3; `analyzeDecision` has no default, so every caller passes a strict policy name or `{ seed }`. Seeded per-round randomness (`random.js`, stateless per seed and turn), no alphabetical ties, a weighted pick within the tier's width (10/7/4 points) of her best weighted share while she has 3+ misses left and strictly the best at 1–2, a fading early vowel bonus (+6/+4/+2 over 3/2/1 turns), and a decision record (mode, best, tiedWith, vowelBonus, shortlist) for E1's lines. The benchmarks play 8 shared seeds per word; gate and strength cap pass. Letter choice stays in code, never a model.
- **Honest lines:** her reasoning lines must describe what she actually did. The Observatory's reasoning line now says "She weighs common words above rare ones, and X is on her shortlist" (A1's "no unused letter scores higher" became untrue once she explores), and its setup note says "Each level knows more words and plays a little more carefully" instead of "Only her vocabulary changes". Both are minimal A2 fixes; E1 writes her real lines from the decision record.
- **Questions:** up to 2 yes/no category questions per round from Open English WordNet 2025 labels (CC BY 4.0, credited alongside ESDB/LDNOOBW). B1 has built the labels (`client/public/illucia/labels/`, see `tools/ILLUCIA-LABELS.md`); `/illucia` asks from them since E2 (Yes / No / Decline; a known word's answer is checked and corrected; unknown words say "no bonus possible for this word"; curious early narrow, desperate late broad). B2 has built the chooser and measured it (`tools/ILLUCIA-QUESTIONS.md`). Current rules (2026-10-03), with her A2 temperament: a broad category opens 26–27% of first questions (was 98%; "man-made object" 22–23%, was 75%); one answered question raises her win rate by 2.5–3.0 points, two by 5.0–5.7 (1.5–1.8 less than B2's first rules); the tier order holds. At ×1.5/×2.0 answering both is about even (0.99–1.03 of declining), answering the first only earns 11–12% more, and simple selective play wins. A question uses her turn but never a miss; answers are checked where WordNet knows the word.
- **Points (normal mode only):** stump points for in-tier words, multiplied for answered questions, a +100 ladder bonus, once per word per player, through a separate round ticket into the same Hall of Fame total. The server side (C1) is deployed as described in `docs/SCORING.md`: claims are rules-checked, not replayed.
- **Memory (D1):** per-account words played and words that beat her (which she then knows at every tier), a small letter prior, a personality seed, and a global `word_counts` table with no user or timestamp. Account deletion removes the per-account rows; `/privacy` must disclose it. Her guessing never receives the secret word; her commentary may. The server side (C2) is deployed and used by `/illucia` since E3/E4: the start response's `memory.brain` is history without the current round, `memory.voice` may know the word (`docs/SCORING.md`); the letter prior's formula is Track A's. *A3 (committed):* `brain.js` `toBrain(memory.brain, length)` accepts exactly personalitySeed, games, letters and learned (anything else, including voice, throws); `createKnowledge(..., brain)` adds learned words at weight 10 at every tier; the player's letter habits blend in at 5% × min(1, games / 50), careful mode included; `personalTemperament` varies width ×85–115%, vowel bonus ×75–125% and picks a favourite vowel. `/illucia` passes the start response's brain since E3, the Observatory since its slice 3 (learned words still possible show as their own stars). With eight synthetic players the gate and the strength cap pass and no strength is lost beyond noise (`tools/benchmarks/illucia-a3-memory.json`). Information value (A2) was benchmarked and costs nothing, but adds nothing measurable; no tier uses it.
- **Experimental AI mode:** an off-by-default toggle on `/illucia`; no points while on. A Workers AI free-allowance model proposes a meaning question over ≤80 candidates, code validates it and falls back on any failure; site-wide daily cap (~50), per-user limit, hard timeout. *D1 done* (offline, 2026-10-02, `tools/ILLUCIA-AI-QUESTIONS.md`): the pick is Gemma 4 26B A4B with reasoning off (`chat_template_kwargs.enable_thinking: false`). It gave a usable question on 10/21 boards, all within 8 s, at ~6–7 neurons a request. Its WordNet-question sorts agreed with WordNet on 90% of words, but 30% of WordNet-YES words went to NO, so D2 should soft-filter rather than drop words. With reasoning on (the models' default), no model was usable. A second round on 5 small states ruled out Qwen3.8 27B and DeepSeek R1 Distill (10–84 s, 130–610 neurons a request) and gpt-oss-120b (wording, latency). A full 21-state run then made Llama 3.3 70B (no reasoning) the pick: 15/21 usable questions, all within 4.8 s, at ~38 neurons a request. Gemma sorts more accurately (90% vs 80% agreement with WordNet) at ~6–7 neurons. Nemotron 3 120B (reasoning off; 5 states) was fastest (≤1.1 s) but asked too-narrow questions (1/5 usable); gpt-oss-120b (low; 5 states) broke the required wording in 4 of 6 invents (1/5 usable, up to 25 s). Clef-flash (Cloudflare's decision model, 2026-10-01; it sorts but cannot write a question) sorted the 21 WordNet-question states best of all (91% agreement, valid lists 21/21, ≤1.2 s) but costs ~60 neurons a sort (`tools/benchmark-illucia-clef.js`, `lib/illucia-clef.js`). The local I7a/D1 ledger ceiling is 10,000 neurons a day, the whole free allowance (owner decision 2026-10-02). *D2 deployed* (2026-10-03: migration `0008`, Worker `91f8b781`; unauthenticated checks only, see `server/RELEASE.md`): `POST /user/illucia/ask`, model chosen by the `AI_MODEL` var (Llama 3.3 70B, or gpt-oss-120b at medium (2026-10-03) and, in production since 2026-10-04, at low, its lowest effort; her note names the model that answered), the `/privacy` copy, limits (2 per round, 30 per player per day since 2026-10-03 (was 10), 2,000 neurons and 60 requests per day site-wide; the page's fallback line says which limit stopped her helper), a 6 s timeout and an `AI_ENABLED` switch; see `server/README.md`. *E5 built:* the off-by-default toggle on `/illucia` (not stored in the browser) starts experimental rounds; her AI question replaces WordNet's, and an answer makes the model's side weigh ×3 instead of ruling words out. Tested against a mocked route only; no real neurons were spent.
- **UI scope:** since 2026-10-03 the Observatory gets every `/illucia` feature too, placed in its existing single-screen surfaces with no conversation log, over a game session shared with `/illucia` (`docs/planning/PLAN-observatory.md`, decisions Amendments 5). Slice 1 moved the session out of `Illucia.js`: `client/src/lib/illucia/duel-session.js` (pure: knowledge with memory, her turn as consult / question / letter, answers, previews, stakes, warnings) and `client/src/lib/use-illucia-rounds.js` (ladder, spent words, open round, start, claim); both pages use both since slices 1 and 3; slice 2 gave the Observatory its honest notebook; slice 4 its questions (the duel holds, a question card in the notebook, her sky split green / blue by side, the stake text shared as `offerStake`); slice 5 the record view (`Components/IlluciaRecord.js`, shared with `/illucia`, shown in the notebook in place of the form); slice 6 experimental AI mode (the same off-by-default switch and warning, her helper's question on the same card, her sky split by the model's sort, no points). All seven slices are pushed (2026-10-03); live browser checks are Spyros's. New UI must not contradict `docs/DESIGN-BRIEF.md`.
- **Tracks:** A thinking, B WordNet, C server (migrations from `0006`) can run in parallel clones, each committing on `main` after `git pull --rebase`, one push at a time; D experimental AI and E `/illucia` page depend on them as the decisions table says.

## SCOPE

Work only from the specific slice instruction given. Do not widen a slice into unrelated changes.
