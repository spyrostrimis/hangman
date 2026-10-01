# Accounts, Hall of Fame, and Illucia plan

Scoring follow-up approved 2026-10-01: the local implementation replaces the original `add100` API with server-issued round tickets and idempotent, validated claims, without a minimum duration. See [the scoring design](../SCORING.md). The deployed account slice and original scoring decisions recorded below are historical; the new migration/API were deployed on 2026-10-01, with evidence in the scoring design.

Hangman: Rescue Mission is an English vocabulary game about reviving the robot Artsy by discovering a secret word. Originally a 2023 bootcamp project, it now runs on React/Vite and Cloudflare's Free plan.

## Pages and games at a glance

| Page | Purpose |
| --- | --- |
| Homeworld (`/`) | Introduces Professor Fastolfe, Artsy, and the rescue mission; leads into the game. |
| Play Hangman (`/hangman`) | The player guesses the game's word one letter at a time. Hits reveal every matching letter; six incorrect guesses lose the round. Reveal the whole word to win. Hints help during play; a win unlocks the painting and vocabulary details, including pronunciation. Guests can play; signed-in winners earn 100 points. |
| Play vs AI / Illucia (`/illucia`) | Planned reverse Hangman: the player supplies an English word and Illucia guesses letters. Hits reveal all matches without costing a chance; Illucia wins by revealing the word, and the player wins after her sixth miss. Currently a signed-in-only “Coming Soon” page; the game and choice of AI are not implemented. |
| Hall of Fame (`/hall-of-fame`) | Public leaderboard of the top 100 cumulative player scores, with sign-in/signup links for guests. |
| Create account (`/signup`) | Registers a username and password and signs the player in. Explains password requirements and the absence of password recovery. |
| Sign in (`/login`) | Signs an existing player in and returns them to a supported requested page. The navigation provides Logout when signed in. |

Prepared 2026-09-26; account sections updated 2026-09-27 to reflect the deployed implementation through `063ca07`. See [the release record](server/RELEASE.md) for verification evidence. Phase 4 below remains the original, unmodified future-game plan.

## Verified starting point

- The static Hangman game, registration, login/logout, cumulative scores, and Hall of Fame are live at https://hangman.spyrostrimis.com. The frontend uses same-origin `/user/*` requests, not the old localhost API.
- React/Vite is served by Cloudflare Pages. A Hono Worker handles `hangman.spyrostrimis.com/user/*`; D1 stores users and scores. Local development uses a Vite proxy and a separate local D1 database.
- The legacy Express/MongoDB/OpenAI backend and all eight `/word/` routes have been removed, along with obsolete client auth components, `axios`, and `jwt-decode`.
- Normal gameplay uses 105 static word records and R2 paintings, with Merriam-Webster pronunciation audio. No live word-generation or dictionary API requests are made.
- Illucia's account gate works, but its reverse-Hangman engine and guessing opponent remain unbuilt. Its future results do not currently contribute to the leaderboard.
- Signed-in Hangman wins save 100 points. Guest wins and losses save nothing. Play Hangman shows no score-saving, success, or failure notifications, as requested in `063ca07`; totals are available in the Hall of Fame.
- Scores remain client-authoritative and forgeable by design. Authentication and atomic increments are implemented; server-authoritative gameplay is deliberately excluded.
- `CLAUDE.md` records repository rules and current state; no `state.md` was found in this checkout. [API documentation](server/README.md) covers the credential protocol, setup, release, and rollback.

## Phase 3: accounts and cumulative scores

**Completed and deployed.** The sections below describe the implemented behavior and remaining limitations, rather than pending account-rebuild work.

### 1. Implemented password design

The user tested bcryptjs and confirmed the Workers Free CPU problem. The approved replacement is browser Web Crypto PBKDF2-HMAC-SHA-256 at 600,000 iterations, with a random 128-bit salt per account. The Worker stores an HMAC-SHA-256 verifier under a separate secret pepper and verifies it with native Web Crypto. Login obtains versioned parameters first; unknown usernames receive stable, secret-derived fake salts with the same response shape.

The raw password never goes to the API. The derived credential is password-equivalent and is neither persisted nor logged. The server cannot prove that a modified client performed stretching or enforce the original password's strength. The official signup form requires 15–128 characters. Public leaderboard names and duplicate-signup errors mean fake salts reduce, but do not eliminate, username enumeration.

The deployed Worker was measured on the confirmed Free plan: initial CPU P50 **1.96 ms**, P99/P999 **3.56 ms**, below the 10 ms allowance in the small release-test sample. This is not a load-test guarantee. Stretching responsiveness on a slow physical phone remains unmeasured.

### 2. Worker and D1 foundation

- `server/src/` contains the Hono API, with local development, migration, type-check, test, and deployment scripts.
- D1 `hangman-accounts` is provisioned in EEUR with migration `0001_accounts.sql` applied. Queries use prepared statements.
- JWT signing, verifier pepper, and dummy-salt secrets are independent Workers secrets. Local secrets and runtime files are ignored by Git; credentials are never frontend configuration.

| Table | Implemented columns and constraints |
| --- | --- |
| `users` | `id` primary key, display `username`, unique normalized `username_key`, `salt`, `verifier`, `kdf_version`, `created_at` |
| `scores` | `user_id` primary key and foreign key to users with cascading deletion, bounded nonnegative integer `total` default 0, `updated_at` |

User creation and the initial score are one atomic D1 batch. Scores accumulate in one row per user; SQL increments avoid read/modify/write races. Leaderboard ordering is indexed and deterministic: total descending, then user ID ascending. Accounts started fresh; old MongoDB records were not imported.

### 3. API and cookie authentication

| Method and path | Live contract |
| --- | --- |
| `POST /user/auth-params` | Return versioned derivation parameters and an existing or stable fake salt. |
| `POST /user/signup` | Validate username/credential/salt/version, create user and zero score, set the session cookie, and return safe user data; duplicate username returns 409. |
| `POST /user/login` | Verify the credential, set the session cookie, and return safe user data; wrong or unknown credentials receive a generic 401. |
| `GET /user/me` | Verify the session and return the current user and score; otherwise 401. |
| `POST /user/logout` | Expire the browser's session cookie. |
| `GET /user/get-best-scores` | Return a public array of `{ username, score }`, limited to the top 100, including zero totals. |
| `PUT /user/add100` | Authenticate the player, accept only an empty JSON object, atomically add 100 to their total, and return `{ score }`. |

- `jose` signs HS256 JWTs with a 24-hour lifetime. Verification checks the algorithm, issuer, audience, subject, issued-at, and expiry; there is no automatic refresh.
- Production uses a host-only `__Host-hangman_session` cookie with `HttpOnly`, `Secure`, `SameSite=Lax`, and `Path=/`. An explicit localhost-only configuration supports development.
- Mutations require the exact trusted Origin and JSON content type. Bodies are limited to 2 KiB; all API responses use `no-store`.
- Native rate-limit bindings allow 60 requests per IP per minute and 10 signup/login attempts per normalized username per minute. Limits are approximate and per Cloudflare location, not global abuse prevention.
- Application logs omit credentials, tokens, and request bodies; responses do not expose database error details.
- Logout clears the cookie; copied JWTs remain valid until expiry. Immediate revocation, email collection, OAuth, password reset, and account-recovery UI are not included.

### 4. Registration, login, and navigation

- Shared auth state covers loading, authenticated, guest, and failure states. `/user/me` restores the session on reload and refreshes it on window focus.
- Signup, Login, Navbar, Hall of Fame messaging, and Illucia use that state. Legacy localStorage token handling and client JWT decoding are removed; the old token key is cleared during transition.
- Forms retain the visual design and provide labels, autocomplete, validation, pending/error states, and duplicate-submit prevention.
- Signup signs the new player in. Login restores a supported internal destination. Logout updates the UI after API success.
- Normal Hangman remains available to guests. Illucia redirects guests to login and returns signed-in players to its placeholder page.

### 5. Wins and Hall of Fame

- The score side effect now belongs to `useRoundScore`, not `Word.js`. One request is claimed per signed-in winning round, including under React StrictMode.
- Guest wins and losses send no score request. Signing in after a guest win does not award it retrospectively.
- Score saving runs silently: Play Hangman renders no score notifications on a win or loss. Removing the notification did not remove score persistence.
- Ambiguous writes are not automatically retried. Client duplicate prevention handles ordinary rerenders; it is not anti-cheat or guaranteed exactly-once delivery.
- The Hall of Fame fetches current totals when opened, validates the response, supports cancellation and a 10-second timeout, and retains loading, empty, error, and success states.

### 6. Verification, release, and remaining work

- The account release passed **27 automated tests**: 8 Workers/D1 integration tests, 11 client Node tests, and 8 React component tests. Server types/checks and both production builds passed.
- Tests cover credentials, duplicate registrations, cookies and token expiry, Origin enforcement, rate-limit decisions, atomic increments, leaderboard ordering/limits, forms, guest behavior, and score submission. Deliberately broken password verification, duplicate prevention, and signup navigation each caused a test failure before restoration.
- Local browser checks covered account flows, mobile and desktop layout, session persistence, the Illucia gate, and a winning round. Production checks verified signup, login/logout, cookies, expired-token rejection, score saving, and persisted leaderboard totals. Disposable test accounts were removed afterward.
- The later notification removal passed all 8 existing UI tests and the frontend build; the win screen was checked manually and the updated bundle verified live.
- API/D1/secrets were deployed before the connected Pages frontend. The canonical domain and API coexist correctly. A Cloudflare Bulk Redirect sends the Pages hostname and deployment subdomains to the custom domain, preserving paths and query strings.
- Architecture, protocol limitations, setup, release evidence, and rollback instructions are documented. Rollback preserves D1 data and secrets. Commits stay on `main`; each push publishes the frontend, while Worker deployment is separate.
- Remaining limitations: physical slow-phone performance is unmeasured; password recovery and legacy-account migration are absent. The release audit found no server dependency advisories and nine existing client advisories, reserved for separate dependency work. Illucia gameplay remains Phase 4.

## Phase 4: Illucia reverse Hangman

Cloudflare can support this mode. It does not require rebuilding any of the old word-generation endpoints.

### Game contract

1. The player enters an English word. Proposed first version accepts A-Z letters, normalizes case, and sets a documented length limit; phrases, punctuation, and digits are excluded.
2. The game holds the answer separately from Illucia's guessing input. Illucia sees only the word length, revealed pattern, previously guessed letters, and remaining mistakes.
3. Illucia chooses one unused letter per turn. All occurrences are revealed on a hit. Only a miss consumes a chance: six incorrect guesses, not six total guesses.
4. Example: `ESCAPE` starts as `_ _ _ _ _ _`; A gives `_ _ _ A _ _` with six mistakes left; O leaves the pattern unchanged with five left; E gives `E _ _ A _ E`.
5. Illucia wins when all letters are revealed; the player wins after Illucia's sixth miss. Stop further turns after either outcome. Provide restart and an understandable turn history.
6. Normal game logic determines matches, remaining chances, and results. Never ask a language model to adjudicate these rules.
7. Keep Illucia results separate from the existing +100 leaderboard initially. User-chosen words make difficulty uneven; a scoring rule for this mode needs its own product decision.

### Two viable ways for Illucia to choose letters

| Approach | Behavior | Tradeoff |
| --- | --- | --- |
| Local game AI | Filter a bundled word list by the visible pattern and misses; select an informative unused letter; fall back to letter frequency if no candidates remain. | Free of inference calls, fast and deterministic. It is a programmed opponent, not a live language model. Needs a suitably licensed broader dictionary for arbitrary words; the current 105-word teaching corpus is too narrow. |
| Live Workers AI | An authenticated Worker sends only visible game state to a Cloudflare-hosted model, which proposes the next letter. | Actual live model decisions, network latency and quota usage, and imperfect guesses. Validate exactly one unused A-Z letter; use a bounded retry or an explicitly presented local fallback on invalid output, timeout, or quota exhaustion. |

A Worker can also connect to an external AI provider with a server-side secret, but that would introduce an external runtime dependency and provider-specific costs. Workers AI is the closer fit for this project's Cloudflare direction.

For live mode, keep the secret word out of model prompts, conversation history, and request metadata. The browser can adjudicate against its private answer and send only the resulting public state. Bound state size and model output, authenticate every request, throttle usage, and prevent overlapping/stale turns after restart or navigation. A normal request per turn is enough; a persistent agent or WebSocket service is not required for this first version.

### Cost and existing project rules

Workers AI currently includes 10,000 neurons per day on the Free plan; exhaustion causes further operations to fail unless the plan is upgraded. Some models require paid billing and must be excluded. The number of games depends on the selected model, prompt size, and turns; benchmark before estimating capacity. Keep the account on Free and handle exhausted quotas visibly.

The existing `CLAUDE.md` rule says the only runtime external dependency is Merriam-Webster audio and prohibits live third-party API calls. Cloudflare-native inference is technically different from a third-party provider call, but it still changes the static-only AI design. If live Illucia is chosen, explicitly document a narrow runtime-inference exception for this mode in the synchronized project rules; keep normal word data static. No rule is changed by this plan.

Recommendation: complete accounts/scores first. For Illucia, use Workers AI if the goal is specifically to play against a live language model; use the local solver if predictable zero-inference operation matters more. A hybrid can retain playability during outages, provided the UI clearly identifies the fallback.

Verification for Illucia: repeated-letter reveals, six misses, hit without penalty, no repeated guesses, no secret in the guesser's inputs, stop after win/loss, restart cancellation, invalid model responses, timeouts, auth expiry, and quota exhaustion.

References: [Workers AI bindings](https://developers.cloudflare.com/workers-ai/configuration/bindings/), [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/).
