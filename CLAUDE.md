# CLAUDE.md — Hangman: Rescue Mission

PROJECT: Web-based Hangman word game for learning English vocabulary and pronunciation. Built 2023 as a MERN bootcamp project (Social Hackers Academy); now being REBUILT as a portfolio piece on Cloudflare's free tier. This file is auto-read at session start — treat everything below as standing rules for this repo.

REBUILD, NOT MIGRATION. Most 2023 code is being replaced. Do not preserve or work around code that should simply go. What survives: the game rules, the React components and visual design, the Hall of Fame, and the shape of the four auth routes.

<!-- ┌─ SYNC v3 · HARD RULES · mirrored in CLAUDE.md + project instructions -->
<!-- │  Edit one → edit the other → bump BOTH version numbers. -->

## HARD RULES

- App UI language = English. All in-game text stays English.
- ZERO live third-party API calls in production. Word data is pre-generated into a static manifest. The only runtime external dependency is the hotlinked Merriam-Webster audio URL.
- $0 running cost. Cloudflare free tier only. Flag anything that needs a paid plan; never implement it silently.
- Secrets NEVER committed and never literal in source. `tools/` reads a gitignored `.env`. Production secrets via `wrangler secret` only. Never stage `*.zip`, `node_modules`, or build output.
- `main` is the only branch, and pushing to it PUBLISHES to hangman.spyrostrimis.com. There is no staging. Every push is a live deploy.
- Merriam-Webster: use the Collegiate Dictionary API only. Non-commercial only, 1000 queries/day/key. Attribution required in UI and README. Wherever MW content is displayed, MW's official branding guidelines apply and are binding: feature the unmodified official Merriam-Webster logo (PNG on web, at 50×50, 100×100 or 125×125, with the ® kept visible at bottom right), and write the product title out in full as "Merriam-Webster's Collegiate® Dictionary with Audio" — the ® is required on the first use of "Collegiate" on a page. Never "Webster's" alone; always hyphenate Merriam-Webster.
- Example sentences must be REAL and sourced from MW with attribution. Never generate quotations attributed to real authors, works, or dates.
- Scoring is client-authoritative and forgeable BY DESIGN. Documented, not fixed. Do not propose server-authoritative gameplay — it was considered and rejected.

<!-- └─ /SYNC v3 · HARD RULES -->

## CURRENT REBUILD STATE

Account implementation deployed and verified on 2026-09-27; see server/RELEASE.md for local and production evidence and remaining limitations.

- The static word-game and route-background/loading slices are rebuilt and live.
- The account/score slice is live: Hono Worker, D1 migrations, client-side PBKDF2 stretching, server HMAC verifiers, expiring cookie auth, connected forms, and cumulative scores. Live browser signup, login, logout, session persistence, and a winning round saving 100 points were verified.
- The old Express/MongoDB/OpenAI server has been removed. server/ now contains the replacement Worker, tests, migrations, and deployment documentation.
- The browser uses relative /user/* API paths; Vite proxies these to the local Worker. JWTs and password-derived credentials are never stored in localStorage.
- Illucia's registered-player gate is wired, but the reverse game remains a placeholder. It is not part of this account slice.
- README.md describes the new architecture; server/README.md specifies the credential protocol, limitations, and release/rollback procedure.

The rebuild uses small verified slices on main. Every push publishes the frontend; the API is deployed separately. Preserve the distinction between implemented, tested locally, and verified live.

## TARGET STACK

- Client: React 18.2 + Vite 8.2.2 on Cloudflare Pages. CRA is gone. React 19 remains a later, separate upgrade.
- API: Hono on Cloudflare Workers, implemented in `server/src/`, routed under the site's `/user/*` path. See `server/RELEASE.md` for production status.
- Data: static JSON manifest (words) — BUILT AND LIVE at `client/src/data/words.json` · R2 (paintings) — LIVE, 105 objects in bucket `hangman-assets`, served from `https://assets.hangman.spyrostrimis.com` · D1 (users, scores) — schema and migrations implemented; remote provisioning status is recorded in `server/RELEASE.md`.
- Auth: `jose` JWTs expire after 24 hours in HttpOnly cookies. The user tested bcryptjs and confirmed the CPU problem, then approved browser Web Crypto PBKDF2-SHA-256 at 600,000 iterations with peppered HMAC-SHA-256 server verifiers. Stable secret-derived dummy salts and native HMAC verification are implemented. See `server/README.md` for the exact protocol and limitations. Initial deployed CPU measurements are recorded in server/RELEASE.md; do not weaken stretching.
- Word-data pipeline: `tools/`, Node, local-only. MW Collegiate only, for definition, part of speech, written pronunciation, audio filename, and an optional attributed `vis` example. There is no Merriam-Webster Thesaurus API in this project.
- Enrichment (`hints.synonym`, `hints.clue`, `explanation`): **LLM-authored during planning conversation, human-reviewed, and committed as static data in `tools/enrichment.json`.** There is NO enrichment generation harness and `tools/` never calls OpenAI. The `source` / `provenance` values stay `"llm-generated"` because that describes who produced the text, not how it was transported. If asked to build a generator for these fields, stop and confirm — it was considered and deliberately rejected for a locked 105-word corpus that needs human review either way.
- Manifest assembly: `tools/build-manifest.js` is a small deterministic assembler, not a generator. Inputs `tools/words.locked.json` + `tools/output/mw-probe.json` + `tools/enrichment.json`; output `client/src/data/words.json`.
- Image generation, if it ever happens: `gpt-image-2` at 1024×1024 SQUARE — square is LOCKED, because the 116 surviving 2023 DALL·E 2 paintings are 512×512 and new images must sit beside them in the same frame. Do not "upgrade" this to landscape. Not currently needed: all 105 shipping words already have a rescued painting.

Already removed: CRA, `mdb-react-ui-kit`, Font Awesome, client `axios` and `jwt-decode`, and the legacy server dependency set. `client/src/base.css` intentionally preserves only the small reset/popover subset the UI still needs. `read-more-react`, `web-vitals`, and `buffer` remain for separate cleanup. The account component tests now use Testing Library; do not remove its dependencies as CRA leftovers. Still used: `react-bootstrap` and `react-tooltip` (Intro), `react-simple-typewriter` (Wordfacts). Verify actual imports before removing a package.

## GIT

- Remote is `git@github.com:spyrostrimis/hangman.git` over SSH. Verify with `git remote -v` before any push — this repo has already had a stale remote once.
- `github.com/spyrostrimis/hangman` is the ONLY repo. No other remote exists, and no other copy of the 2023 history exists. Three 2023 merge-commit MESSAGES still name a retired repo; that is deliberate — rewriting them would rewrite every later hash in the history (101 commits at `3a4fa1d`, 60 of them from 2023) and destroy the preserved 2023 dates. Never offer to clean them.
- `main` only. No feature branches.
- `push.autoSetupRemote` is unset locally and globally on this machine. Any new branch starts with no upstream and `git status` then stays SILENT about unpushed commits on it. (Moot while we stay on `main`, but know it.)
- `core.autocrlf` is on. `.gitattributes` exists and contains exactly `* text=auto eol=lf`; watch for unexpected line-ending churn.
- Server secrets and runtime output are ignored by `server/.gitignore` (`.env`, `.dev.vars*`, `.wrangler/`). There is no root `.gitignore`, and the client still has the CRA ignore rules. Keep account deployment credentials inside the ignored server locations; never create plain secret files at the root or in the client.
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

Local-only (gitignored, never committed):

- `tools/cache/collegiate/` — real MW responses. All 105 cached; reruns cost 0 GETs.
- `tools/output/mw-probe.json` — probe/report output. Report-only fields must never leak into the manifest.
- `tools/output/paintings/` — generated WebP delivery assets.
- `tools/.env` — `MW_KEY`.

## HINT / UI SEMANTICS

Load-bearing for anything touching `hints`, `example`, or `explanation`:

- **HINT 1 is `synonym`** and is the HARDER hint — a short synonym or close semantic equivalent, deliberately not a giveaway. It need not be a strict dictionary synonym where English offers no useful exact one.
- **HINT 2 is `clue`** and is the friendlier fallback, a descriptive phrase giving more help after HINT 1.
- **The painting is a post-guess REWARD, not an aid.** It appears only after the player wins; a loss shows a Game Over screen instead. Hint text must never be derived from or describe the painting.
- **`explanation` and `example` are post-answer content**, shown after the word is solved. That is why answer-leak validation covers `synonym` and `clue` only.

## FRONTEND DELIVERY / LOADING

- `App.js` owns a single `.page-shell`; `PageBackground.js` renders the route art in a separate isolated layer. Do not bring back body-class effects or body background swapping—the old approach flashed between routes and made blended backgrounds unstable while scrolling.
- `lib/page-art.js` is the routing authority for desktop/mobile background pairs. `/`, `/hangman`, `/illucia`, and `/hall-of-fame` have explicit art; login, signup, and unknown paths intentionally fall back to home art. Mobile selection is `(max-width: 800px)`.
- Background and character art are prefetched only after link intent (pointer over, focus, or touch). `preload-images.js` deduplicates pending/completed work, swallows speculative failures, and permits retry. Respect `saveData` and 2G connections; do not eagerly preload every route.
- TechnoBoard and Bruno Ace SC ship as local WOFF2 with `font-display: swap`; Roboto comes from local `@fontsource/roboto` package assets. There are no runtime web-font requests.
- Character images used on the first view have intrinsic dimensions to prevent layout shift. Keep dimensions accurate if those files change.
- `lib/leaderboard.js` validates `/user/get-best-scores`, forwards cancellation, and enforces a 10-second timeout through `lib/api.js`. `Halloffame.js` retains loading, empty, ready, and failure states.

## RUN / TEST

From `client/`, run `npm run dev` for the Vite development server, `npm run build` for a production build, and `npm run preview` to serve the production build locally.

From `tools/`, run `npm test` (177 tests) and `node validate.js ../client/src/data/words.json`. The pipeline is local-only and never runs in production.

From `client/`, run `npm test` (11 Node tests), `npm run test:ui` (8 React component tests), and `npm run build`. From `server/`, run `npm run setup:local`, `npm run types`, `npm run check`, `npm test` (8 Workers/D1 integration tests), and `npm run build` (dry run). User-visible CSS, responsive art, navigation, popovers, forms, and loading states still need manual browser verification in proportion to the change.

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
- SPA fallback was manually verified with a direct nested route.
- Current production checks: `/` and `/hangman` return HTTP 200. The route-background/loading work is committed on `main`; production remains a single Vite bundle with no code splitting yet.
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

The account rebuild removes the legacy server, localStorage authentication, disconnected Hello/AuthWrapper files, signup error fall-through, and winner-score side effect from Word.js. The old audit in Git history describes the pre-account-rebuild tree, not the current implementation.

Still outside this slice:

- The physical-keyboard effect in App.js omits the current guess handler from its dependencies. Code inspection found a stale closure that can process the first key against an empty word. Characterize this during game-core extraction; it has not been repaired in the account slice.
- App.js puts the answer in a transparent div, which can expose it to selection and assistive technology. Remove this unnecessary leak during game-core work; static word data and forgeable scores remain intentional.
- remainingTries starts at 5 while Loser derives from six incorrect guesses; the displayed countdown works via the legacy redundant state. Replace it when extracting the game rules, not during account work.
- The old hangman BODY_PARTS code remains commented out. There is deliberately no gallows: the story is rescuing a robot. Do not restore it.
- Header/Footer imports and commented render references remain. React StrictMode is still disabled in the app, but the score lifecycle is tested under StrictMode and must not depend on that setting.
- Game messages and rule derivations remain inline in App.js. Do not widen account changes into a game-engine rewrite.
- Scores remain forgeable by design. UI duplicate prevention handles ordinary rerenders; it is not server-side win validation or exactly-once delivery.

## WHAT IS LIVE

The rebuilt word-game path is WIRED AND LIVE at `hangman.spyrostrimis.com/hangman`. The production game selects from `client/src/data/words.json`, makes no runtime word API request, derives painting URLs from `image.key` against `https://assets.hangman.spyrostrimis.com`, plays hotlinked MW audio, shows the painting on a win only, and displays MW branding.

**The old backend is not required for word gameplay.**

Also live from the current frontend pass: responsive route-specific backgrounds, local fonts, intent-based image preloading, stable background blending during scroll, reserved character-image dimensions, SPA links between login/signup, and bounded Hall of Fame loading/failure UI.

Accounts, Hall of Fame data, and winner-score handling are deployed and browser-verified. Initial Worker CPU measurements were 1.96 ms median and 3.56 ms P99 on the confirmed Free plan. See server/RELEASE.md for the small-sample qualification and full release evidence.

Keep three states apart when writing status: implemented/committed, agreed/planned, and actually wired/live. The word-game and frontend-loading slices are live; the account release record is the authority for the Cloudflare account layer.

## IMAGE ASSET CONVENTIONS

The durable convention is: **source painting → prepared WebP delivery asset → R2 key matching the manifest.** Source dimensions are not part of the contract.

Current rescued corpus only: source PNGs are 512×512, converted at quality 90, preset `picture`, smart subsampling on, effort 6. That q90 setting was chosen by manual review of q80/q85/q90 samples on these specific paintings — q80 and q85 were visibly inadequate.

Do NOT generalise either number. 512×512 describes the 2023 corpus, not a dimension contract. Any future generated paintings may use different and larger source dimensions, and their generation settings are explicitly undecided.

## ILLUCIA — PLAY VS AI (DESIGN ONLY, NOT BUILT)

The reverse game: the player sets a secret word; Illucia guesses one letter at a time with six chances, exactly mirroring the main game's rules.

Undecided: how Illucia chooses letters. Options under discussion in planning:

- **Local solver** (frequency-based: keep dictionary words matching the known pattern and excluded letters, guess the letter in the most remaining candidates). Deterministic, instant, in-browser, $0. Needed in EVERY option — as the opponent itself or as the fallback when a model call fails.
- **Workers AI** (Cloudflare-hosted model behind an authenticated Worker) either choosing letters, or only voicing Illucia's commentary while the solver chooses. Any live model call requires an explicit HARD RULE change first (the zero-live-API rule). Do not add one without that change being committed to both mirrored copies.
- Whatever is chosen: normal game code adjudicates hits, misses and results; a model never sees the secret word and never judges the rules.
- **Dictionary:** a public-domain English word list (ENABLE is the leading candidate), also used to check that the player's word is real. Lazy-loaded on `/illucia` only — the project's first code-split. Verify the licence before committing any list.
- **Personality comes from scripted lines** tied to game events, not generated text.
- **No Merriam-Webster content for player words.** Player words are usually outside the 105-word manifest and live MW calls are forbidden; the post-round screen shows the word only.
- The solver is a pure module and gets tests written against its behaviour. It should share the six-chance rule with the extracted game core rather than restate it.

## SCOPE

The current authorized slice is registration, login, and high scores, with the user-approved client-side stretching design. Finish and verify that slice; do not widen it into Illucia gameplay, a React upgrade, or unrelated game changes.
