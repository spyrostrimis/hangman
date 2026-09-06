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

## TARGET STACK

- Client: React 18 + Vite. CRA has been removed. React 19 is a later, separate upgrade.
- API: Hono on Cloudflare Workers.
- Data: static JSON manifest (words) — BUILT AND LIVE at `client/src/data/words.json` · R2 (paintings) — LIVE, 105 objects in bucket `hangman-assets`, served from `https://assets.hangman.spyrostrimis.com` · D1 (users, scores) — not built.
- Auth: `jose` (JWT), `bcryptjs`, httpOnly cookies, tokens MUST expire.
- Word-data pipeline: `tools/`, Node, local-only. MW Collegiate only, for definition, part of speech, written pronunciation, audio filename, and an optional attributed `vis` example. There is no Merriam-Webster Thesaurus API in this project.
- Enrichment (`hints.synonym`, `hints.clue`, `explanation`): **LLM-authored during planning conversation, human-reviewed, and committed as static data in `tools/enrichment.json`.** There is NO enrichment generation harness and `tools/` never calls OpenAI. The `source` / `provenance` values stay `"llm-generated"` because that describes who produced the text, not how it was transported. If asked to build a generator for these fields, stop and confirm — it was considered and deliberately rejected for a locked 105-word corpus that needs human review either way.
- Manifest assembly: `tools/build-manifest.js` is a small deterministic assembler, not a generator. Inputs `tools/words.locked.json` + `tools/output/mw-probe.json` + `tools/enrichment.json`; output `client/src/data/words.json`.
- Image generation, if it ever happens: `gpt-image-2` at 1024×1024 SQUARE — square is LOCKED, because the 116 surviving 2023 DALL·E 2 paintings are 512×512 and new images must sit beside them in the same frame. Do not "upgrade" this to landscape. Not currently needed: all 105 shipping words already have a rescued painting.

BEING REMOVED: MongoDB, Mongoose, Express, `bcrypt` (native), `jsonwebtoken`, `axios`, OpenAI SDK v3, `body-parser`, `mongoose-type-email`, `read-more-react`, `web-vitals`, `mdb-react-ui-kit`.

## GIT

- Remote is `git@github.com:spyrostrimis/hangman.git` over SSH. Verify with `git remote -v` before any push — this repo has already had a stale remote once.
- `github.com/spyrostrimis/hangman` is the ONLY repo. No other remote exists, and no other copy of the 2023 history exists. Three 2023 merge-commit MESSAGES still name a retired repo; that is deliberate — rewriting them would rewrite all 63 hashes and destroy the preserved 2023 dates. Never offer to clean them.
- `main` only. No feature branches.
- `push.autoSetupRemote` is unset locally and globally on this machine. Any new branch starts with no upstream and `git status` then stays SILENT about unpushed commits on it. (Moot while we stay on `main`, but know it.)
- `core.autocrlf` is on. `.gitattributes` exists and contains exactly `* text=auto eol=lf`; watch for unexpected line-ending churn.
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

## RUN / TEST

From `client/`, run `npm run dev` for the Vite development server, `npm run build` for a production build, and `npm run preview` to serve the production build locally.

From `tools/`, run the Node test suite for the word-data pipeline (177 passing at last commit) and `node validate.js ../client/src/data/words.json` to check the built manifest. The pipeline is local-only and never runs in production. From `client/`, the test suite covers manifest access (5 passing).

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

## KNOWN LANDMINES

Snapshot from the 2023 audit — may lag current code. **Verify against the actual files; they are the source of truth.** Most of these live in code slated for replacement, and are listed so they aren't accidentally reimplemented or wastefully fixed. Do NOT go fix these on sight — work from the specific instruction given.

**Genuine bugs in the 2023 code**

- `Signup.js` — `if (response.data.msg) alert(...)` has NO `return`, so execution falls through and writes the error object `{msg:"Username already exists"}` into `localStorage.token`, then navigates home. User appears logged in with a garbage token. `Login.js` has the identical shape but DOES return.
- `wordmodel.js` `pre("save")` calls `this.synonym.endsWith(".")` unguarded → `/word/random` TypeErrors on every new word (that route never sets `synonym`).
- `server.js` — `const port = 8000 || process.env.port` is backwards (always 8000), and lowercase `port`. Breaks platform port injection.
- Off-by-one on attempts: `remainingTries` starts at **5**, `Loser` fires at **6** incorrect guesses. README, in-game instructions, and Typewriter copy all say six. `remainingTries` is a redundant second source of truth for `6 - incorrectGuesses.length` — DELETE it rather than fix it.
- Stale-closure decrement in `App.js` — `setRemainingTries(remainingTries - 1)` while the line above correctly uses the functional form. The keypress effect's deps omit `remainingTries`, `Winner`, `Loser`.
- Both `*-create-random` routes call `res.send()` BEFORE the async work, then `catch` writes to the already-sent response → `ERR_HTTP_HEADERS_SENT`. Because `createImage` sits before `Word.create`, a dead image call silently prevents any new word from being persisted while the client sees a clean 200.
- No client-side error handling on any fetch. This applied to `getWordData()`, which is GONE as of `028a660` — words now come from the bundled manifest and cannot fail at runtime. The pattern may still exist on the preserved winner-score request; verify before acting.
- MW parsing crashes on unrecognised words (2023 SERVER code only — the `tools/` pipeline handles this correctly): MW returns an array of suggestion STRINGS, so `data[0].hwi` is `undefined` and `.prs` throws. No optional chaining anywhere. The guard `if (resmw)` is always truthy (axios always resolves an object).
- `SALTY_ROUNDS` — if unset, `Number(undefined)` is `NaN` and `bcrypt.hash` throws. Undocumented required env var.

**Dead / broken**

- The ENTIRE hangman stick figure is commented out — a JSX comment in `Figure.js` swallows the `BODY_PARTS` render. `Figure` doesn't even destructure `incorrectGuesses`. **There is no gallows, and this is now deliberate** — the game's story is rescuing a robot. DELETE the `BODY_PARTS` code; do not restore it. The six-guess counter needs a different visual.
- `script.js` cannot run at all — ESM `import` in a CommonJS project plus top-level `await` outside an async function. `npm run dev` is broken.
- `/word/get-mw-api` is hardcoded to `"russet"`, real lookup commented out. Debug leftover, publicly reachable.
- `client/src/wordList.json` was deleted in commit `2f0ce90`. No longer a gap: `client/src/data/words.json` is the bundled word source and the game works with the backend off.
- `Word.hint` is in the schema, written by nothing, read by nothing.
- Four components imported into `App.js` and commented out of the render tree: `Hello`, `Header`, `Footer`, `AuthWrapper`.
- Unused imports: `mongoose` in both routers, `fs` in `wordrouter.js`, `MDBTable*` and `Typewriter` in `Halloffame.js`, `incorrectGuesses` prop on `Wordfacts.js`.

**Structural**

- `Word.js` — **the data-fetch inversion is FIXED as of `028a660`.** `App` now owns the selected manifest record; `Word` no longer fetches a word, selects word data, or calls the old runtime `/word` endpoint. What remains in the client is the preserved winner-score request, deliberately left unchanged. Verify the current files before assuming anything further about this component's responsibilities.
- The game rules live inline in `App.js` but are SHALLOW coupling, not deep — `Winner` and `Loser` are already pure derivations of `(wordToFind, chosenLetters)`. The only obstruction is `addChosenLetter` emitting literal JSX via `setInnertext`. Split message-generation out and the rule engine becomes a testable pure module.
- `/user/add100` verifies the JWT then unconditionally adds 100. No game session, no word ID, no nonce. Replayable in a loop. **Known and accepted** — see hard rules.
- Tokens never expire (no `expiresIn`), stored in `localStorage`, and only `/user/add100` is protected. `AuthWrapper.js` is imported and commented out, so no route is guarded client-side either. `/illucia` advertises "Only for registered players" and is reachable by anyone.
- `/word/get-all-words` returns every document INCLUDING image Buffers — unpaginated, unauthenticated, potentially megabytes.
- No `helmet`, no rate limiting, `cors()` with no origin allowlist — on endpoints that spent money per call.
- `wordToFindData` is initialised as `""` then assigned an object; `"".image` is `undefined`, so the null guard works purely by accident.
- Six of the ten `/word/` routes exist only to call OpenAI live. They go away entirely.

**Repo hygiene**

- README's live link points at `hengman.netlify.app` — a host this project no longer uses. Acknowledgements section still literally reads "[Insert appropriate credits or references]".
- `client/package.json` `homepage` is `hangman.spyrostrimis.com` — load-bearing under CRA only; dies with the Vite migration.
- The 2023 working tree and HEAD disagreed about the API base URL and which word endpoint the client called. Both states are now committed as-found.

## WHAT IS LIVE

The rebuilt word-data path is WIRED AND LIVE at `hangman.spyrostrimis.com/hangman` as of `028a660`. The production game selects from `client/src/data/words.json`, makes no runtime word API request, derives painting URLs from `image.key` against `https://assets.hangman.spyrostrimis.com`, plays hotlinked MW audio, shows the painting on a win only, and displays MW branding.

**The old backend is not required for word gameplay.**

Still NOT rebuilt: auth, Hall of Fame, and winner-score behaviour. The existing winner-score request was deliberately left untouched during the wiring commit. Do not describe accounts or scoring as rebuilt.

Three states still worth keeping apart when writing status — implemented/committed, agreed/planned, and actually wired/live. The word-data path is now in the third category; the account layer is in the second.

## IMAGE ASSET CONVENTIONS

The durable convention is: **source painting → prepared WebP delivery asset → R2 key matching the manifest.** Source dimensions are not part of the contract.

Current rescued corpus only: source PNGs are 512×512, converted at quality 90, preset `picture`, smart subsampling on, effort 6. That q90 setting was chosen by manual review of q80/q85/q90 samples on these specific paintings — q80 and q85 were visibly inadequate.

Do NOT generalise either number. 512×512 describes the 2023 corpus, not a dimension contract. Any future generated paintings may use different and larger source dimensions, and their generation settings are explicitly undecided.

## SCOPE

Active priorities are decided in planning chats and live in `state.md`, which you do NOT see. When starting a task, work from the specific instruction given — do not guess at "what's next" and start editing.
