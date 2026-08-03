# CLAUDE.md — Hangman: Rescue Mission

PROJECT: Web-based Hangman word game for learning English vocabulary and pronunciation. Built 2023 as a MERN bootcamp project (Social Hackers Academy); now being REBUILT as a portfolio piece on Cloudflare's free tier. This file is auto-read at session start — treat everything below as standing rules for this repo.

REBUILD, NOT MIGRATION. Most 2023 code is being replaced. Do not preserve or work around code that should simply go. What survives: the game rules, the React components and visual design, the Hall of Fame, and the shape of the four auth routes.

## HARD RULES

- App UI language = English. All in-game text stays English.
- ZERO live third-party API calls in production. Word data is pre-generated into a static manifest. The only runtime external dependency is the hotlinked Merriam-Webster audio URL.
- $0 running cost. Cloudflare free tier only. Flag anything that needs a paid plan; never implement it silently.
- Secrets NEVER committed and never literal in source. `tools/` reads a gitignored `.env`. Production secrets via `wrangler secret` only. Never stage `*.zip`, `node_modules`, or build output.
- `main` is the only branch, and pushing to it PUBLISHES to hangman.spyrostrimis.com. There is no staging. Every push is a live deploy.
- Merriam-Webster: non-commercial only, max two reference APIs (Collegiate + Thesaurus, both in use — no room for a third), 1000 queries/day/key. Attribution required in UI and README.
- Example sentences must be REAL and sourced from MW with attribution. Never generate quotations attributed to real authors, works, or dates.
- Scoring is client-authoritative and forgeable BY DESIGN. Documented, not fixed. Do not propose server-authoritative gameplay — it was considered and rejected.

## TARGET STACK

- Client: React 18 + Vite (CRA is being removed). React 19 is a later, separate upgrade.
- API: Hono on Cloudflare Workers.
- Data: D1 (users, scores) · static JSON manifest (words) · R2 (paintings).
- Auth: `jose` (JWT), `bcryptjs`, httpOnly cookies, tokens MUST expire.
- Generation pipeline: `tools/`, Node, local-only. `gpt-image-2` at 1536×1024 landscape for paintings; MW Collegiate + Thesaurus for definition/IPA/audio/example; an LLM for the example explanation.

BEING REMOVED: MongoDB, Mongoose, Express, `bcrypt` (native), `jsonwebtoken`, `axios`, OpenAI SDK v3, `react-scripts`, `body-parser`, `mongoose-type-email`, `read-more-react`, `web-vitals`, `mdb-react-ui-kit`.

## GIT

- Remote is `git@github.com:spyrostrimis/hangman.git` over SSH. Verify with `git remote -v` before any push — this repo has already had a stale remote once.
- `main` only. No feature branches.
- `push.autoSetupRemote` is unset locally and globally on this machine. Any new branch starts with no upstream and `git status` then stays SILENT about unpushed commits on it. (Moot while we stay on `main`, but know it.)
- `core.autocrlf` is on. A `.gitattributes` with `* text=auto eol=lf` is planned — until it lands, watch for phantom whole-file diffs caused by line-ending churn.
- `github.com/trickywisdom/hangman` is the private, dormant original. Reference only. Never push there.

## CHANGE DISCIPLINE

- Small, scoped, one concern per change. Reviewable diffs.
- Flag any bonus or adjacent fix explicitly. Never bundle silently.
- Multi-file or bug work: trace data flow directly across methods and files. No shape pattern-matching. Prefer direct file reads over subagent summaries that drop cross-method context.
- Before claiming done: show the real diff, run the tests and show real output, and call out anything still needing manual browser testing. Never assert "passes" without evidence.
- Tests must be proven non-vacuous: break the fix, confirm the test fails, restore. Every negative assertion needs a positive control on the same fixture in the same run.
- Characterization tests apply to the PRESERVED game core only. Do not write them for code slated for deletion.
- One commit per change; manual verification BEFORE the commit.
- CARVE-OUT: config removal and dead-code deletion can't be "seen working." The verification is the real diff plus a grep proving nothing references the removed thing. Say so in the commit message.

## KNOWN LANDMINES

Snapshot from the 2023 audit — may lag current code. **Verify against the actual files; they are the source of truth.** Most of these live in code slated for replacement, and are listed so they aren't accidentally reimplemented or wastefully fixed. Do NOT go fix these on sight — work from the specific instruction given.

**Genuine bugs in the 2023 code**

- `Signup.js` — `if (response.data.msg) alert(...)` has NO `return`, so execution falls through and writes the error object `{msg:"Username already exists"}` into `localStorage.token`, then navigates home. User appears logged in with a garbage token. `Login.js` has the identical shape but DOES return.
- `wordmodel.js` `pre("save")` calls `this.synonym.endsWith(".")` unguarded → `/word/random` TypeErrors on every new word (that route never sets `synonym`).
- `server.js` — `const port = 8000 || process.env.port` is backwards (always 8000), and lowercase `port`. Breaks platform port injection.
- Off-by-one on attempts: `remainingTries` starts at **5**, `Loser` fires at **6** incorrect guesses. README, in-game instructions, and Typewriter copy all say six. `remainingTries` is a redundant second source of truth for `6 - incorrectGuesses.length` — DELETE it rather than fix it.
- Stale-closure decrement in `App.js` — `setRemainingTries(remainingTries - 1)` while the line above correctly uses the functional form. The keypress effect's deps omit `remainingTries`, `Winner`, `Loser`.
- Both `*-create-random` routes call `res.send()` BEFORE the async work, then `catch` writes to the already-sent response → `ERR_HTTP_HEADERS_SENT`. Because `createImage` sits before `Word.create`, a dead image call silently prevents any new word from being persisted while the client sees a clean 200.
- No client-side error handling on any fetch. `getWordData()` has no `.catch` — server down means `wordToFind` stays `""` and the board renders empty forever, silently.
- MW parsing crashes on unrecognised words: MW returns an array of suggestion STRINGS, so `data[0].hwi` is `undefined` and `.prs` throws. No optional chaining anywhere. The guard `if (resmw)` is always truthy (axios always resolves an object).
- `SALTY_ROUNDS` — if unset, `Number(undefined)` is `NaN` and `bcrypt.hash` throws. Undocumented required env var.

**Dead / broken**

- The ENTIRE hangman stick figure is commented out — a JSX comment in `Figure.js` swallows the `BODY_PARTS` render. `Figure` doesn't even destructure `incorrectGuesses`. **There is no gallows, and this is now deliberate** — the game's story is rescuing a robot. DELETE the `BODY_PARTS` code; do not restore it. The six-guess counter needs a different visual.
- `script.js` cannot run at all — ESM `import` in a CommonJS project plus top-level `await` outside an async function. `npm run dev` is broken.
- `/word/get-mw-api` is hardcoded to `"russet"`, real lookup commented out. Debug leftover, publicly reachable.
- `client/src/wordList.json` was deleted in commit `2f0ce90` — no offline fallback word list exists.
- `Word.hint` is in the schema, written by nothing, read by nothing.
- Four components imported into `App.js` and commented out of the render tree: `Hello`, `Header`, `Footer`, `AuthWrapper`.
- Unused imports: `mongoose` in both routers, `fs` in `wordrouter.js`, `MDBTable*` and `Typewriter` in `Halloffame.js`, `incorrectGuesses` prop on `Wordfacts.js`.

**Structural**

- `Word.js` renders the letter blanks AND owns the word fetch AND lifts state into the parent via setter props AND triggers the scoring mutation. `App` owns the rules but not the fetch; `Word` owns the fetch but not the rules. This inversion is the first structural thing to fix.
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

## SCOPE

Active priorities are decided in planning chats and live in `state.md`, which you do NOT see. When starting a task, work from the specific instruction given — do not guess at "what's next" and start editing.
