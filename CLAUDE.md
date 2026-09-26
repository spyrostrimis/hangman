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

Verified at `3a4fa1d` on `main` (2026-09-26):

- The **word-game vertical slice is rebuilt and live**. Production selects one of 105 records from the bundled manifest, derives its painting URL from the R2 object key, hotlinks only Merriam-Webster audio, and needs no application backend to play a complete round.
- The current frontend pass addresses **first-visit loading and stable route backgrounds**: responsive route-owned art, local WOFF2 fonts, a small checked-in compatibility stylesheet instead of the MDB package, intent-based image preloading, reserved character-image dimensions, and honest Hall of Fame loading/error states. The game text panel deliberately has a 16px monospace base size.
- The **account/score vertical slice is not rebuilt**. Login, signup, winner score writes, and leaderboard reads still call `http://localhost:8000`; they do not work for production visitors. The Hall of Fame now times out and shows an error instead of hanging, but its data source is still legacy.
- `server/` is preserved 2023 Express/MongoDB code, not the production API. Do not repair it piecemeal or describe it as deployed. Its replacement target remains Hono + D1 + secure cookie auth on Cloudflare.
- `README.md` still describes the 2023 MERN/OpenAI version and links to the retired Netlify site. It is historical/stale documentation, not a statement of current architecture.
- `/illucia` ("Play vs AI") is a **"Coming Soon" placeholder with no game behind it**. The intended game is the reverse of Hangman: the player sets a secret word and Illucia guesses letters with six chances. Nothing of it is built. How Illucia chooses letters is NOT decided — see ILLUCIA below.

The rebuild is being done as small, verified vertical slices on `main`: remove a runtime dependency, establish the static or Cloudflare-native replacement, test it, manually verify the user-visible behavior, then push. Do not widen a task into the next slice without an explicit instruction.

## TARGET STACK

- Client: React 18.2 + Vite 8.2.2 on Cloudflare Pages. CRA is gone. React 19 remains a later, separate upgrade.
- API target: Hono on Cloudflare Workers. No Worker/API implementation exists yet — no `wrangler.toml`, no `functions/` directory; `server/` is the retained legacy reference only. Leading option (not yet locked): Pages Functions under `client/functions/`, so the API shares the site's origin and deploy. Pages Functions requests count against the same Workers Free quota (100k requests/day) and CPU limit.
- Data: static JSON manifest (words) — BUILT AND LIVE at `client/src/data/words.json` · R2 (paintings) — LIVE, 105 objects in bucket `hangman-assets`, served from `https://assets.hangman.spyrostrimis.com` · D1 (users, scores) — not built.
- Auth target: `jose` (JWT), httpOnly cookies, tokens MUST expire. **Password hashing is NOT locked:** the Workers Free plan allows 10 ms CPU per request, which pure-JS `bcryptjs` at a normal cost is expected to exceed. The choice between `bcryptjs` and WebCrypto PBKDF2 is settled by a measured spike on a deployed Worker, not by assumption. Current legacy auth uses `jsonwebtoken`, native `bcrypt`, localStorage, and non-expiring tokens; none of that is the target design.
- Word-data pipeline: `tools/`, Node, local-only. MW Collegiate only, for definition, part of speech, written pronunciation, audio filename, and an optional attributed `vis` example. There is no Merriam-Webster Thesaurus API in this project.
- Enrichment (`hints.synonym`, `hints.clue`, `explanation`): **LLM-authored during planning conversation, human-reviewed, and committed as static data in `tools/enrichment.json`.** There is NO enrichment generation harness and `tools/` never calls OpenAI. The `source` / `provenance` values stay `"llm-generated"` because that describes who produced the text, not how it was transported. If asked to build a generator for these fields, stop and confirm — it was considered and deliberately rejected for a locked 105-word corpus that needs human review either way.
- Manifest assembly: `tools/build-manifest.js` is a small deterministic assembler, not a generator. Inputs `tools/words.locked.json` + `tools/output/mw-probe.json` + `tools/enrichment.json`; output `client/src/data/words.json`.
- Image generation, if it ever happens: `gpt-image-2` at 1024×1024 SQUARE — square is LOCKED, because the 116 surviving 2023 DALL·E 2 paintings are 512×512 and new images must sit beside them in the same frame. Do not "upgrade" this to landscape. Not currently needed: all 105 shipping words already have a rescued painting.

Already removed from the client bundle: CRA, `mdb-react-ui-kit`, and Font Awesome. `client/src/base.css` intentionally preserves only the small reset/popover subset the UI still needs. Still to remove as their owning slices are rebuilt: client `axios` and `jwt-decode` (both still imported by the account slice). Already unused with zero imports, removable as a dead-dependency commit: `read-more-react`, `web-vitals`, `buffer`, and all three `@testing-library/*` packages (CRA leftovers). Still used and NOT dead: `react-bootstrap` and `react-tooltip` (Intro), `react-simple-typewriter` (Wordfacts). Also to remove: the entire legacy server dependency set (MongoDB/Mongoose/Express/native `bcrypt`/`jsonwebtoken`/OpenAI SDK v3/etc.). Verify actual imports before removing a package.

## GIT

- Remote is `git@github.com:spyrostrimis/hangman.git` over SSH. Verify with `git remote -v` before any push — this repo has already had a stale remote once.
- `github.com/spyrostrimis/hangman` is the ONLY repo. No other remote exists, and no other copy of the 2023 history exists. Three 2023 merge-commit MESSAGES still name a retired repo; that is deliberate — rewriting them would rewrite every later hash in the history (101 commits at `3a4fa1d`, 60 of them from 2023) and destroy the preserved 2023 dates. Never offer to clean them.
- `main` only. No feature branches.
- `push.autoSetupRemote` is unset locally and globally on this machine. Any new branch starts with no upstream and `git status` then stays SILENT about unpushed commits on it. (Moot while we stay on `main`, but know it.)
- `core.autocrlf` is on. `.gitattributes` exists and contains exactly `* text=auto eol=lf`; watch for unexpected line-ending churn.
- ⚠ **Secret-file ignore gap.** There is no root `.gitignore`. `client/.gitignore` is the CRA default: it ignores `.env.local` / `.env.*.local` but NOT a plain `.env`, `.dev.vars`, or `.wrangler/`. `tools/.gitignore` covers `tools/.env` only. Close this BEFORE any Cloudflare API work creates local secret files.
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
- `lib/leaderboard.js` validates the legacy response, forwards cancellation, and enforces a 10-second timeout. `Halloffame.js` renders loading, empty, ready, and failure states. This is resilience around the legacy localhost endpoint, not a rebuilt leaderboard backend.

## RUN / TEST

From `client/`, run `npm run dev` for the Vite development server, `npm run build` for a production build, and `npm run preview` to serve the production build locally.

From `tools/`, run `npm test` (177 tests) and `node validate.js ../client/src/data/words.json`. The pipeline is local-only and never runs in production.

From `client/`, run `npm test` (9 tests: manifest selection/asset URLs, speculative image loading, and leaderboard loading contract) and `npm run build`. The tests use Node's built-in runner; there is no browser component suite yet. User-visible CSS, responsive art, navigation, popovers, forms, and loading states still need manual browser verification in proportion to the change.

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

## LEGACY LANDMINES STILL PRESENT

Verified against the current tree at `49092d9`. Most live in code slated for replacement and are recorded so they are not accidentally reimplemented or wastefully repaired. Do NOT fix these on sight; work from the specific instruction given.

**Genuine bugs / incomplete behavior**

- `Signup.js` — `if (response.data.msg) alert(...)` has NO `return`, so execution falls through and writes the error object `{msg:"Username already exists"}` into `localStorage.token`, then navigates home. User appears logged in with a garbage token. `Login.js` has the identical shape but DOES return.
- `wordmodel.js` `pre("save")` calls `this.synonym.endsWith(".")` unguarded → `/word/random` TypeErrors on every new word (that route never sets `synonym`).
- `server.js` — `const port = 8000 || process.env.port` is backwards (always 8000), and lowercase `port`. Breaks platform port injection.
- `remainingTries` starts at 5 while `Loser` is correctly derived at 6 incorrect guesses. Its displayed post-guess countdown happens to work, but the state is a redundant second source of truth for `6 - incorrectGuesses.length` and is maintained with a closure-based decrement. DELETE it when extracting game rules rather than adding more synchronization logic.
- **Stale keyboard closure in `App.js`** (found by reading the code; not yet reproduced in a browser). The `keypress` effect depends on `[chosenLetters, isHangPage]` but not on `addChosenLetter`. The handler is registered on the render where `selectedWord` is still `null`, so the FIRST physical-keyboard guess of every round sees `wordToFind === ""` and `remainingTries === 5`: even a correct letter shows "You have 5 tries remaining..." and decrements `remainingTries`, so the countdown text is one lower than it should be for the rest of the round. Win/lose derivation is unaffected (it reads `chosenLetters`). Mouse-only rounds are unaffected. Characterize it, then let the pure-core extraction remove it; do not patch the dependency array in isolation.
- **The answer sits in the page as text.** `App.js` renders `<div style={{color:"transparent"}}>{wordToFind}</div>`, so select-all/copy and screen readers expose the answer. (The `visibility: hidden` letter spans in `Word.js` are not read by screen readers.) The bundled manifest means a determined player can always read words in devtools — that is inherent to a client-side static game and accepted — but this div is a needless, accessible leak. Delete it with the game-core work.
- React `StrictMode` is commented out in `index.js`. Relevant to the score write: the legacy `add100` effect in `Word.js` would double-fire under StrictMode in development. Any rebuilt score write must be idempotent per round rather than relying on StrictMode staying off.
- Both `*-create-random` routes call `res.send()` BEFORE the async work, then `catch` writes to the already-sent response → `ERR_HTTP_HEADERS_SENT`. Because `createImage` sits before `Word.create`, a dead image call silently prevents any new word from being persisted while the client sees a clean 200.
- Login and signup still have no request error state; the winner-score request only logs failure. Hall of Fame is the exception: it now has abort, timeout, response validation, and visible loading/empty/error states around the still-local endpoint.
- MW parsing crashes on unrecognised words (2023 SERVER code only — the `tools/` pipeline handles this correctly): MW returns an array of suggestion STRINGS, so `data[0].hwi` is `undefined` and `.prs` throws. No optional chaining anywhere. The guard `if (resmw)` is always truthy (axios always resolves an object).
- `SALTY_ROUNDS` — if unset, `Number(undefined)` is `NaN` and `bcrypt.hash` throws. Undocumented required env var.

**Dead / broken**

- The ENTIRE hangman stick figure is commented out — a JSX comment in `Figure.js` swallows the `BODY_PARTS` render. `Figure` doesn't even destructure `incorrectGuesses`. **There is no gallows, and this is now deliberate** — the game's story is rescuing a robot. DELETE the `BODY_PARTS` code; do not restore it. The six-guess counter needs a different visual.
- `script.js` cannot run at all — ESM `import` in a CommonJS project plus top-level `await` outside an async function. `npm run dev` is broken.
- `/word/get-mw-api` is hardcoded to `"russet"`, real lookup commented out. Debug leftover, publicly reachable.
- `client/src/wordList.json` was deleted in commit `2f0ce90`. No longer a gap: `client/src/data/words.json` is the bundled word source and the game works with the backend off.
- `Word.hint` is in the schema, written by nothing, read by nothing.
- `Header` and `Footer` are imported into `App.js` but commented out of the render tree. `Hello` and `AuthWrapper` remain as disconnected files. Do not preserve these by default.
- Known unused legacy imports include `mongoose` in both routers and `fs` in `wordrouter.js`. The old MDB/Typewriter imports in `Halloffame.js` were removed during the loading pass.

**Structural**

- `Word.js` — **the data-fetch inversion is fixed.** `App` owns the selected manifest record; `Word` now renders letters and still owns only the preserved localhost winner-score side effect. Remove that side effect from the component when rebuilding scoring.
- The game rules live inline in `App.js` but are SHALLOW coupling, not deep — `Winner` and `Loser` are already pure derivations of `(wordToFind, chosenLetters)`. The only obstruction is `addChosenLetter` emitting literal JSX via `setInnertext`. Split message-generation out and the rule engine becomes a testable pure module.
- `/user/add100` verifies the JWT then unconditionally adds 100. No game session, no word ID, no nonce. Replayable in a loop. **Known and accepted** — see hard rules.
- Tokens never expire (no `expiresIn`), are stored in `localStorage`, and only `/user/add100` is protected. `AuthWrapper.js` is disconnected, so no route is guarded client-side either. `/illucia` advertises "Only for registered players" and is reachable by anyone.
- `/word/get-all-words` returns every document INCLUDING image Buffers — unpaginated, unauthenticated, potentially megabytes.
- No `helmet`, no rate limiting, `cors()` with no origin allowlist — on endpoints that spent money per call.
- `server/Routers/wordrouter.js` defines EIGHT `/word/` routes; three call OpenAI live (`/word/random` and the two `*-create-random` routes). All eight go away when `server/` is deleted as a whole; production word gameplay already replaces them. There is no separate "delete the OpenAI routes" task.
- `Illucia.js` reads `localStorage.token` into an unused variable and advertises "registered players only" with no guard.

**Repo hygiene**

- README's live link points at `hengman.netlify.app` — a host this project no longer uses. Acknowledgements section still literally reads "[Insert appropriate credits or references]".
- The obsolete CRA `homepage` field is gone. Do not reintroduce it under Vite.
- The 2023 working tree and HEAD disagreed about the API base URL and which word endpoint the client called. Both states are now committed as-found.

## WHAT IS LIVE

The rebuilt word-game path is WIRED AND LIVE at `hangman.spyrostrimis.com/hangman`. The production game selects from `client/src/data/words.json`, makes no runtime word API request, derives painting URLs from `image.key` against `https://assets.hangman.spyrostrimis.com`, plays hotlinked MW audio, shows the painting on a win only, and displays MW branding.

**The old backend is not required for word gameplay.**

Also live from the current frontend pass: responsive route-specific backgrounds, local fonts, intent-based image preloading, stable background blending during scroll, reserved character-image dimensions, SPA links between login/signup, and bounded Hall of Fame loading/failure UI.

Still NOT rebuilt: auth, Hall of Fame data, and winner-score behavior. All four account-related client calls still target localhost. In production, the Hall of Fame should be expected to reach its visible unavailable state. Do not describe accounts, persisted scores, or leaderboard data as working production features.

Keep three states apart when writing status: implemented/committed, agreed/planned, and actually wired/live. The word-game and frontend-loading slices are in the third category; the Cloudflare account layer is only a target design.

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

The current completed slice is frontend first-visit/loading stability on top of the live static word game. The next active priority is decided in planning chats and may live in `state.md`, which is not part of this repo context. Work from the specific instruction given—do not infer that the account rebuild, README rewrite, dependency cleanup, React upgrade, Illucia, or any listed landmine is automatically next.
