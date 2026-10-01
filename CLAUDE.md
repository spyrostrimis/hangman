# CLAUDE.md — Hangman: Rescue Mission

PROJECT: Web-based Hangman word game for learning English vocabulary and pronunciation. Built 2023 as a MERN bootcamp project (Social Hackers Academy); now being REBUILT as a portfolio piece on Cloudflare's free tier. This file is auto-read at session start — treat everything below as standing rules for this repo.

REBUILD, NOT MIGRATION. Most 2023 code is being replaced. Do not preserve or work around code that should simply go. What survives: the game rules, the React components and visual design, the Hall of Fame, the shape of the four auth routes, and the Illucia "Play vs AI" concept.

<!-- ┌─ SYNC v6 · HARD RULES · mirrored in CLAUDE.md + project instructions -->
<!-- │  Edit one → edit the other → bump BOTH version numbers. -->

## HARD RULES

- App UI language = English. This is an English-vocabulary learning game; all in-game text stays English. (A sibling project has the opposite rule — do not pattern-match Greek UI conventions across.)
- No live third-party API calls in production. All word data — definition, hints, pronunciation, audio URL, example, explanation, painting — stays pre-generated in the static manifest. The only third-party runtime dependency is the hotlinked Merriam-Webster audio URL.
- ONE scoped AI exception, first-party only: Illucia (Play vs AI) may call Cloudflare Workers AI through the project's own Worker, and only when ALL of these hold: (1) models eligible for the Workers AI free allowance only; (2) the model receives public game state only — never the secret word, player-typed text, usernames or any other personal data; (3) game code adjudicates every rule, and model output is flavour text or a suggestion that is validated and length-bounded before use; (4) signed-in players only, rate-limited per user, with a hard timeout; (5) a local fallback keeps Illucia fully playable whenever the model fails or the daily allowance is spent. Any other runtime AI — another provider, an in-browser model, AI in the main Hangman game — needs a new HARD RULE decision first.
- Running cost must stay $0. Cloudflare free tier only; the Workers AI free allowance is a ceiling, never a reason to upgrade. Any proposal requiring a paid plan gets flagged for a decision, never implemented silently.
- Passwords: browser-side PBKDF2-HMAC-SHA-256 at 600,000 iterations with a random per-account salt; the Worker stores only an HMAC verifier under a separate secret pepper. The work factor only ever rises (through a new `kdf_version`); never lower it to fit a CPU limit. The raw password never leaves the browser, and the derived credential is never stored or logged.
- Secrets: never committed, never a literal in source. `tools/` reads a gitignored `.env`; the Worker's local secrets live in ignored `server/.dev.vars*`; production secrets go in via `wrangler secret` only. `*.zip`, `node_modules`, `.wrangler/` and build output are never staged.
- Every deploy is production; there is no staging. A push to `main` publishes the frontend to hangman.spyrostrimis.com, and `wrangler deploy` from `server/` publishes the API immediately. Treat both as deploys to a public URL.
- Merriam-Webster: use the Collegiate Dictionary API only. Non-commercial only, 1000 queries/day/key. Attribution required in UI and README. Wherever MW content is displayed, MW's official branding guidelines apply and are binding: feature the unmodified official Merriam-Webster logo (PNG on web, at 50×50, 100×100 or 125×125, with the ® kept visible at bottom right), and write the product title out in full as "Merriam-Webster's Collegiate® Dictionary with Audio" — the ® is required on the first use of "Collegiate" on a page. Never "Webster's" alone; always hyphenate Merriam-Webster.
- Example sentences must be REAL, sourced from Merriam-Webster with attribution. Never LLM-generated quotations attributed to real authors, works, or dates. The 2023 version did this and it was wrong.
- Scoring uses server-issued, account-bound rounds and shared-rule replay validation, with at most one award per round. Gameplay stays local; answers are public and manufactured/bot wins remain possible. Five-second floor (revised decision 2026-10-01): never consume or award a ticket before issued_at + 5,000 ms. Return ROUND_TOO_EARLY distinctly; the client waits behind “Saving…” and silently retries early rejections. One outstanding round and issuance after the previous award bound each account to 12 awards per minute. No daily cap. Do not claim that validated submissions prove human or honest play. Per-guess server adjudication remains excluded. See docs/SCORING.md.

<!-- └─ /SYNC v6 · HARD RULES -->

## CURRENT REBUILD STATE

HEAD `a39a707` on `main` (2026-09-28). Account implementation deployed and verified on 2026-09-27; see server/RELEASE.md for local and production evidence and remaining limitations.

- The static word-game and route-background/loading slices are rebuilt and live.
- The account/score slice is live: Hono Worker, D1 migrations, client-side PBKDF2 stretching, server HMAC verifiers, expiring cookie auth, connected forms, and cumulative scores. Live browser signup, login, logout, session persistence, and a winning round saving 100 points were verified. New usernames are 3–20 letters or digits (`shared/auth-protocol.js`); sign-in still accepts up to 35 so accounts made under the old limit are not locked out.
- The old Express/MongoDB/OpenAI server has been removed. server/ now contains the replacement Worker, tests, migrations, and deployment documentation.
- The browser uses relative /user/* API paths; Vite proxies these to the local Worker. JWTs and password-derived credentials are never stored in localStorage.
- Phase 4 (Illucia) is under way; build order and status in `docs/planning/PLAN-illucia.md`. Done: I0 HARD RULES v4 (`2c4317a`), I1 shared game core (`b482b9b`), I2 vocabulary (`2fad03f`, profanity filter hardened in `41ad9fe`), I3 solver and policy benchmark (`4899677`), I3b tier fallback and benchmark (`142d774`, regenerated in `601d02c`). None of it is wired into a page: `/illucia` is still the registered-player placeholder. See ILLUCIA below.
- Phone pass (MOB): the Hangman page (`926f303`) and Hall of Fame (`df9ec04`) fit phone screens. The plan's other MOB slices (navbar and page shell; Home pop-ups and the login/signup forms) have no commits yet; confirm MOB status with Spyros before I4.
- README.md describes the new architecture; server/README.md specifies the credential protocol, limitations, and release/rollback procedure.

The rebuild uses small verified slices on main. Every push publishes the frontend; the API is deployed separately. Preserve the distinction between implemented, tested locally, and verified live.

## TARGET STACK

- Client: React 18.2 + Vite 8.2.2 on Cloudflare Pages. CRA is gone. React 19 remains a later, separate upgrade.
- API: Hono on Cloudflare Workers, implemented in `server/src/`, routed under the site's `/user/*` path. See `server/RELEASE.md` for production status.
- Data: static JSON manifest (words) — BUILT AND LIVE at `client/src/data/words.json` · R2 (paintings) — LIVE, 105 objects in bucket `hangman-assets`, served from `https://assets.hangman.spyrostrimis.com` · D1 (users, scores) — schema and migrations implemented; remote provisioning status is recorded in `server/RELEASE.md`.
- Auth: `jose` JWTs expire after 24 hours in HttpOnly cookies. The user tested bcryptjs and confirmed the CPU problem, then approved browser Web Crypto PBKDF2-SHA-256 at 600,000 iterations with peppered HMAC-SHA-256 server verifiers. Stable secret-derived dummy salts and native HMAC verification are implemented. See `server/README.md` for the exact protocol and limitations. Initial deployed CPU measurements are recorded in server/RELEASE.md; do not weaken stretching.
- Word-data pipeline: `tools/`, Node, local-only. The one exception is the Illucia vocabulary build, `tools/build_illucia_words.py` (Python 3.12+, standard library only), because it runs ESDB's own Python query builder; `npm test` in `tools/` shells out to Python for its tests. MW Collegiate only, for definition, part of speech, written pronunciation, audio filename, and an optional attributed `vis` example. There is no Merriam-Webster Thesaurus API in this project.
- Enrichment (`hints.synonym`, `hints.clue`, `explanation`): **LLM-authored during planning conversation, human-reviewed, and committed as static data in `tools/enrichment.json`.** There is NO enrichment generation harness and `tools/` never calls OpenAI. The `source` / `provenance` values stay `"llm-generated"` because that describes who produced the text, not how it was transported. If asked to build a generator for these fields, stop and confirm — it was considered and deliberately rejected for a locked 105-word corpus that needs human review either way.
- Manifest assembly: `tools/build-manifest.js` is a small deterministic assembler, not a generator. Inputs `tools/words.locked.json` + `tools/output/mw-probe.json` + `tools/enrichment.json`; output `client/src/data/words.json`.
- Image generation, if it ever happens: SQUARE is LOCKED, because the 116 surviving 2023 DALL·E 2 paintings are 512×512 and new images must sit beside them in the same frame. Do not "upgrade" this to landscape. Model, size and cost are undecided (earlier notes named `gpt-image-2` at 1024×1024; that is a candidate, not a decision). Not currently needed: all 105 shipping words already have a rescued painting.
- Illucia (engine built, page NOT built): local solver in `client/src/lib/illucia/` over a filtered ESDB/SCOWL v2 word list served as static per-length files from `client/public/illucia/words/`; optional Workers AI voice only under the HARD RULES AI exception. Details in `docs/planning/PLAN-illucia.md`.

Already removed: CRA, `mdb-react-ui-kit`, Font Awesome, client `axios` and `jwt-decode`, and the legacy server dependency set. `client/src/base.css` intentionally preserves only a small reset/popover subset. `read-more-react`, `web-vitals`, and `buffer` remain for separate cleanup. The account component tests now use Testing Library; do not remove its dependencies as CRA leftovers. Still used: `react-simple-typewriter` (Wordfacts). `react-bootstrap` and `react-tooltip` are no longer imported anywhere (Home's popovers became crew cards in `688d83b`; `react-tooltip` was only ever a commented-out import), and the popover rules in `base.css` are unused too, but Spyros decided on 2026-09-28 to KEEP both packages: do not remove them. Verify actual imports before removing any other package.

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

Load-bearing for anything touching `hints`, `example`, or `explanation`:

- **HINT 1 is `synonym`** and is the HARDER hint — a short synonym or close semantic equivalent, deliberately not a giveaway. It need not be a strict dictionary synonym where English offers no useful exact one.
- **HINT 2 is `clue`** and is the friendlier fallback, a descriptive phrase giving more help after HINT 1.
- **The painting is a post-guess REWARD, not an aid.** It appears only after the player wins; a loss shows a Game Over screen instead. Hint text must never be derived from or describe the painting.
- **`explanation` and `example` are post-answer content**, shown after the word is solved. That is why answer-leak validation covers `synonym` and `clue` only.

## FRONTEND DELIVERY / LOADING

- `App.js` owns a single `.page-shell`; `PageBackground.js` renders the route art in a separate isolated layer stack: the art on screen stays until the next image has loaded and decoded, then the new one crossfades over it (280 ms). Do not bring back body-class effects or body background swapping—the old approach flashed between routes and made blended backgrounds unstable while scrolling.
- `lib/page-art.js` is the routing authority for desktop/mobile background pairs. `/`, `/hangman`, `/illucia`, and `/hall-of-fame` have explicit art; login, signup, and unknown paths intentionally fall back to home art. Mobile selection is `(max-width: 800px)`.
- Background and character art are prefetched only after link intent (pointer over, focus, or touch). `preload-images.js` deduplicates pending/completed work, swallows speculative failures, and permits retry. Respect `saveData` and 2G connections; do not eagerly preload every route.
- TechnoBoard and Bruno Ace SC ship as local WOFF2 with `font-display: swap`; Roboto comes from local `@fontsource/roboto` package assets. There are no runtime web-font requests.
- Character images used on the first view have intrinsic dimensions to prevent layout shift. Keep dimensions accurate if those files change.
- `lib/leaderboard.js` validates `/user/get-best-scores`, forwards cancellation, and enforces a 10-second timeout through `lib/api.js`. `Halloffame.js` retains loading, empty, ready, and failure states.

## RUN / TEST

From `client/`, run `npm run dev` for the Vite development server, `npm run build` for a production build, and `npm run preview` to serve the production build locally. `.claude/launch.json` defines `client-preview` (vite preview on port 4173) for the desktop app's browser pane.

From `tools/`, run `npm test` (182 tests, needs Python 3.12+ on PATH) and `node validate.js ../client/src/data/words.json`. Illucia: `python tools/build_illucia_words.py --check` from the repo root (about a minute), `npm run benchmark:illucia` and `npm run benchmark:illucia-tiers` (several minutes each). The pipeline is local-only and never runs in production.

From `client/`, run `npm test` (37 Node tests), `npm run test:ui` (17 React component tests), and `npm run build`. From `server/`, run `npm run setup:local`, `npm run types`, `npm run check`, `npm test` (9 Workers/D1 integration tests), and `npm run build` (dry run). User-visible CSS, responsive art, navigation, popovers, forms, and loading states still need manual browser verification in proportion to the change.

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

<!-- ┌─ SYNC v2 · CHANGE DISCIPLINE · mirrored in CLAUDE.md + project instructions -->
<!-- │  Edit one → edit the other → bump BOTH version numbers. -->

## CHANGE DISCIPLINE

- Small, scoped, one concern per change. Reviewable diffs.
- Flag any bonus or adjacent fix explicitly. Never bundle silently.
- Multi-file or bug work: trace data flow directly across methods and files. No shape pattern-matching. Prefer direct file reads over subagent summaries that drop cross-method context.
- Before claiming done: show the real diff, run the tests and show real output, and call out anything still needing manual browser testing. Never assert "passes" without evidence.
- Tests must be proven non-vacuous: break the fix, confirm the test fails, restore. Every negative assertion needs a positive control on the same fixture in the same run.
- Characterization tests apply to the PRESERVED game core only. Do not write them for code slated for deletion. New behaviour gets new tests written against the new behaviour.
- One commit per change; manual verification BEFORE the commit.
- CARVE-OUT: config removal and dead-code deletion can't be "seen working." The verification is the real diff plus a grep proving nothing references the removed thing. Say so in the commit message.

<!-- └─ /SYNC v2 · CHANGE DISCIPLINE -->

## REMAINING GAME LANDMINES

The account rebuild removed the legacy server, localStorage authentication, disconnected Hello/AuthWrapper files, signup error fall-through, and winner-score side effect from Word.js. I1 (`b482b9b`) moved the rules into `client/src/lib/hangman-core.js` (a round is `{ answer, guesses }`, `MAX_MISSES = 6`) and fixed the stale keyboard closure, the redundant `remainingTries` state, the answer in a transparent div, and case-sensitive physical keys. The old audit in Git history describes earlier trees, not the current implementation.

Still open:

- There is deliberately no gallows: the story is rescuing a robot. The old BODY_PARTS code was deleted from `Components/Figure.js`; Artsy's screen shows reboot progress instead. Do not restore it.
- Header/Footer imports and commented render references remain. React StrictMode is still disabled in the app, but the score lifecycle is tested under StrictMode and must not depend on that setting.
- Game messages remain inline in App.js; the rules come from `hangman-core.js`. Do not widen unrelated slices into a game-engine rewrite.
- The round-ticket scoring update validates submitted wins and makes awards idempotent in D1; bots can still manufacture valid histories. Deployed 2026-10-01 with production API checks passed; production browser verification was blocked by browser permissions. See docs/SCORING.md for evidence and remaining limitations.

## WHAT IS LIVE

The rebuilt word-game path is WIRED AND LIVE at `hangman.spyrostrimis.com/hangman`. The production game selects from `client/src/data/words.json`, makes no runtime word API request, derives painting URLs from `image.key` against `https://assets.hangman.spyrostrimis.com`, plays hotlinked MW audio, shows the painting on a win only, and displays MW branding.

**The old backend is not required for word gameplay.**

Also live from the current frontend pass: responsive route-specific backgrounds with crossfades, local fonts, intent-based image preloading, stable background blending during scroll, reserved character-image dimensions, SPA links between login/signup, bounded Hall of Fame loading/failure UI, and phone layouts for the Hangman page and Hall of Fame.

The Illucia word files and credits page are published as static files, but no page loads them yet.

Accounts, Hall of Fame data, and winner-score handling are deployed and browser-verified. Initial Worker CPU measurements were 1.96 ms median and 3.56 ms P99 on the confirmed Free plan. See server/RELEASE.md for the small-sample qualification and full release evidence.

Keep three states apart when writing status: implemented/committed, agreed/planned, and actually wired/live. The word-game and frontend-loading slices are live; the account release record is the authority for the Cloudflare account layer.

## IMAGE ASSET CONVENTIONS

The durable convention is: **source painting → prepared WebP delivery asset → R2 key matching the manifest.** Source dimensions are not part of the contract.

Current rescued corpus only: source PNGs are 512×512, converted at quality 90, preset `picture`, smart subsampling on, effort 6. That q90 setting was chosen by manual review of q80/q85/q90 samples on these specific paintings — q80 and q85 were visibly inadequate.

Do NOT generalise either number. 512×512 describes the 2023 corpus, not a dimension contract. Any future generated paintings may use different and larger source dimensions, and their generation settings are explicitly undecided.

## ILLUCIA — PLAY VS AI (ENGINE BUILT, PAGE NOT BUILT)

The reverse game: the player sets a secret word; Illucia guesses one letter at a time. A hit reveals every occurrence and costs nothing; six misses and the player wins. Same rules as the main game — one shared core (`hangman-core.js`), not a copy.

`docs/planning/PLAN-illucia.md` is the reference (evidence, options, build order I0–I7). Next is I4, the page. Load-bearing points:

- **Illucia's moves come from a local solver, never a model.** Built in `client/src/lib/illucia/` (`candidates.js`, `strategy.js`, `lexicon.js`, `public-state.js`): filter the word list by length, revealed pattern and every guessed letter; guess the unused letter present in the most remaining candidates, ties alphabetical. Pure, deterministic, tested. The benchmark found no alternative policy that clearly beats this one.
- **The solver never receives the secret word.** `toPublicState(round)` is the only way in: a frozen snapshot of length, pattern, guessed and missed letters and misses left, registered in a private WeakSet so the solver rejects anything else. A test proves it, with a positive control.
- **Zero candidates:** at Master it is a bug and throws (I4 must catch this so a bug can't crash the round). At Apprentice/Scholar it is expected for out-of-tier words, and the fallback picks the unused letter found in the most of that tier's own words of that length. Never widen a tier's vocabulary.
- **Player words must be in the accepted list** (`isAcceptedWord`: A–Z, length 3–15, size ≤70, profanity-filtered). Out-of-list words would collapse the solver. Accepted list and tier knowledge are separate questions with separate functions.
- **Difficulty is vocabulary size — CONFIRMED by Spyros 2026-09-28:** Apprentice ≤35 / Scholar ≤50 / Master ≤70 (ESDB sizes), exported as `VOCABULARY_TIERS` in `client/src/lib/illucia/lexicon.js`. Measured in I3b (`tools/ILLUCIA-TIERS.md`): on 5–9-letter words Apprentice wins ~93% against common words but ~9% against less-common ones; Master wins ~88–91% across all bands.
- **Word list:** built by `tools/build_illucia_words.py` from pinned ESDB/SCOWL v2 (MIT-like licence; keep its copyright notice): American English, normal variants, no special categories, one file per length, each word with its ESDB size. Blocked: ESDB offensive/vulgar groups, exact LDNOOBW (CC BY 4.0) matches, `tools/illucia-filter.json` block entries, and every word whose lemma is a blocked term. Whole-word matching only, so `class` and `cocktail` pass. The npm SCOWL build contains profanity — never ship it unfiltered. README and `credits.html` credit both sources; I4 must link the credits page from the Illucia page. When the word files change, rerun `--check` and both benchmarks.
- **Scripted lines are mandatory** — the v1 voice and the permanent fallback.
- **Workers AI voice (optional, later)** only under the HARD RULES AI exception: Worker route under `/user/*`, request body carries public state only, reply validated and capped, per-user limit, ~2.5 s timeout, scripted fallback. It comments on the guess just made and never announces a next guess. Lines that mention the actual word are code-filled templates, never model-written.
- **No Merriam-Webster content for player words** (no live MW calls). If the word is one of the 105 manifest words, its manifest facts may be shown.
- Illucia results stay out of the +100 Hall of Fame unless a later decision says otherwise.

## SCOPE

The account slice is complete and live. Phase 4 (Illucia) is sequenced in `docs/planning/PLAN-illucia.md`: I0–I3b are done; next is I4 (the page), after MOB completion is confirmed. Work only from the specific slice instruction given. HARD RULES v6 includes the approved five-second scoring floor; do not start the Workers AI slice (I5) until the relevant decisions are recorded (the plan places it after the v1 page feels good). Do not widen any slice into a React upgrade, dependency cleanup, or unrelated game changes.
