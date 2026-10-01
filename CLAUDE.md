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

HEAD `5db5300` on `main` (2026-10-01), pushed. Account implementation deployed and verified on 2026-09-27; see server/RELEASE.md for local and production evidence and remaining limitations.

- The static word-game and route-background/loading slices are rebuilt and live.
- The account/score slice is live: Hono Worker, D1 migrations, client-side PBKDF2 stretching, server HMAC verifiers, expiring cookie auth, connected forms, and cumulative scores. Live browser signup, login, logout, session persistence, and a winning round saving 100 points were verified. New usernames are 3–20 letters or digits (`shared/auth-protocol.js`); sign-in still accepts up to 35 so accounts made under the old limit are not locked out.
- The old Express/MongoDB/OpenAI server has been removed. server/ now contains the replacement Worker, tests, migrations, and deployment documentation.
- The browser uses relative /user/* API paths; Vite proxies these to the local Worker. JWTs and password-derived credentials are never stored in localStorage.
- Illucia (Play vs AI) is live for signed-in players on two pages: `/illucia`, a duel told as a scrolling conversation (`4148ce2`), and `/illucia-observatory` (`97f0a24`). Built on I1 shared game core (`b482b9b`), I2 vocabulary (`2fad03f`, profanity filter hardened in `41ad9fe`), I3 solver and policy benchmark (`4899677`) and I3b tier fallback and benchmark (`142d774`, regenerated in `601d02c`). Browser speech (I6) was built in `21572c6` and reverted in `ec388f5`. Her strength on the live pages is measured in `docs/ILLUCIA-STRENGTH.md` (`6acd239`). History and measurements: `docs/planning/PLAN-illucia.md`. See ILLUCIA below.
- Phone pass (MOB): complete, confirmed by Spyros 2026-09-28. Its slices included the Hangman page (`926f303`) and Hall of Fame (`df9ec04`).
- Round scoring is live (`f865419`, deployed 2026-10-01), and so is the five-second floor (`c25199d`; Worker and migration `0004` deployed 2026-10-01). See SCORING below.
- Privacy slice: account deletion (`b81f1a5`), round-record expiry with limited diagnostic logging (`a595383`) and a plain-language `/privacy` page (`5db5300`) are committed and pushed, so the frontend is published. `server/RELEASE.md` records local verification only for deletion and retention (migrations `0003`, `0005`); no Worker deployment of them is recorded yet.
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
- `client/public/illucia/words/3.txt` … `15.txt` — sorted `word size` lines (137,389 words), plus `manifest.json` (hashes, counts, policy), `CREDITS.txt` and both licence files. `client/public/illucia/credits.html` is the credits page.
- `tools/benchmark-illucia.js`, `tools/benchmark-illucia-tiers.js` — seeded I3/I3b harnesses; reports in `tools/benchmarks/`, results in `tools/ILLUCIA-SOLVER.md` and `tools/ILLUCIA-TIERS.md`. Regenerate the reports whenever the word files change.

Local-only (gitignored, never committed):

- `tools/cache/collegiate/` — real MW responses. All 105 cached; reruns cost 0 GETs.
- `tools/output/mw-probe.json` — probe/report output. Report-only fields must never leak into the manifest.
- `tools/output/paintings/` — generated WebP delivery assets.
- `tools/.env` — `MW_KEY`.
- `tools/cache/illucia/` — checksum-verified ESDB and LDNOOBW downloads. The first build needs `--download`; later builds are offline.

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

From `tools/`, run `npm test` (185 tests in committed files, 2026-10-01; needs Python 3.12+ on PATH) and `node validate.js ../client/src/data/words.json`. Illucia: `python tools/build_illucia_words.py --check` from the repo root (about a minute), `npm run benchmark:illucia` and `npm run benchmark:illucia-tiers` (several minutes each). The pipeline is local-only and never runs in production.

From `client/`, run `npm test` (43 Node tests), `npm run test:ui` (54 React component tests), and `npm run build`. From `server/`, run `npm run setup:local`, `npm run types`, `npm run check`, `npm test` (26 Workers/D1 integration tests), and `npm run build` (dry run). User-visible CSS, responsive art, navigation, popovers, forms, and loading states still need manual browser verification in proportion to the change.

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
- `/illucia-observatory` (`97f0a24`) — Illucia's character art, a star field of the words she still considers and a letter-count analyser; pause, 2× speed and rematch at the next tier. Scripted lines in `observatory-lines.js`.

How it works today. `docs/planning/PLAN-illucia.md` holds the build history and measurements; `docs/ILLUCIA-I4.md` the first page's evidence; `docs/ILLUCIA-STRENGTH.md` her strength on both live pages.

- **Moves come from a local solver.** `client/src/lib/illucia/` (`candidates.js`, `strategy.js`, `lexicon.js`, `public-state.js`): filter the word list by length, revealed pattern and every guessed letter; guess the unused letter present in the most remaining candidates, ties alphabetical. Pure, deterministic, tested. The I3 benchmark found no alternative policy that clearly beat this one.
- **The solver sees the board only** (current design, under rethinking). `toPublicState(round)` is its only input: a frozen snapshot of length, pattern, guessed and missed letters and misses left, registered in a private WeakSet so the solver rejects anything else. A test proves it, with a positive control.
- **Difficulty is vocabulary size** (current design): Apprentice ≤35 / Scholar ≤50 / Master ≤70 (ESDB sizes), confirmed by Spyros 2026-09-28 and exported as `VOCABULARY_TIERS` from `lexicon.js`. Zero candidates at Master is a bug and throws, and the pages catch it so a bug can't crash the round. At Apprentice/Scholar it is expected for out-of-tier words, and the fallback picks the unused letter found in the most of that tier's own words of that length.
- **Measured strength** (`docs/ILLUCIA-STRENGTH.md`, 2026-09-30): both live pages match the benchmark move for move. Its main flag: **the tiers invert on common short words.** On common 3–6-letter words Apprentice beats Scholar and Scholar beats Master at every length (3 letters: 42% vs 31% vs 24%), because a bigger vocabulary holds more short look-alikes. The tier order holds on random words. I3b's 5–9-letter figures: Apprentice ~93% against common words but ~9% against less-common ones; Master ~88–91% across all bands (`tools/ILLUCIA-TIERS.md`).
- **Player words come from the accepted list** (`isAcceptedWord`: A–Z, length 3–15, size ≤70, profanity-filtered); out-of-list words would collapse the solver. Accepted list and tier knowledge are separate questions with separate functions. Each round fetches only the chosen length's file.
- **Word list:** built by `tools/build_illucia_words.py` from pinned ESDB/SCOWL v2 (MIT-like licence; keep its copyright notice): American English, normal variants, no special categories, one file per length, each word with its ESDB size. Blocked: ESDB offensive/vulgar groups, exact LDNOOBW (CC BY 4.0) matches, `tools/illucia-filter.json` block entries, and every word whose lemma is a blocked term. Whole-word matching only, so `class` and `cocktail` pass. The npm SCOWL build contains profanity, so it is not shipped unfiltered. README and `credits.html` credit both sources, and both pages link the credits page. When the word files change, rerun `--check` and both benchmarks.
- **Commentary is scripted**: per-event lines with `{letter}`/`{word}` filled in by code. Workers AI commentary and a model-driven contestant have been explored (PLAN-illucia I5/I7) but nothing model-driven is wired into a page.
- **No speech.** Browser speech (I6) was built in `21572c6` and reverted in `ec388f5`: Illucia and the player do not speak.
- **Points:** Illucia earns no Hall of Fame points yet (the pages say so); points for Illucia are being designed.

## SCOPE

Work only from the specific slice instruction given. Do not widen a slice into unrelated changes.
