# Accounts, Hall of Fame, and Illucia plan

Prepared 2026-09-26 against `3a4fa1d`. Planning only: none of these features has been implemented by this document.

## Verified starting point

- No `state.md` was found in this checkout. `CLAUDE.md` records the current rebuild state and constraints.
- The static word game is rebuilt. Registration, login, leaderboard reads, and winner-score writes still target `http://localhost:8000`.
- `server/` is the legacy Express/MongoDB reference. No Hono Worker or D1 migrations exist.
- `Illucia.js` is a placeholder, with no reverse-Hangman engine or effective account gate.
- The old word router contains eight routes in total, not six; retire the entire unused router rather than rebuilding any of it.
- Preserve the existing decision: normal Hangman awards 100 points per reported win, and scoring remains client-authoritative and forgeable. This plan does not introduce server-authoritative gameplay.

## Phase 3: accounts and cumulative scores

### 1. Resolve the free-tier password-hashing constraint first

The intended stack is Hono, D1, `jose`, and `bcryptjs`. Cloudflare Workers Free currently allows 10 ms of CPU per HTTP request. Secure password hashing is deliberately expensive, so `bcryptjs` is a feasibility risk, not a verified free-tier solution.

Before building the account UI integration, measure signup and login with a security-appropriate hash cost in the Workers runtime, including deployed CPU measurements before production cutover. Local success alone does not prove free-tier viability. Do not lower password-hashing strength to force it under the limit or silently enable a paid plan. If this fails, revise the authentication design explicitly; evaluate another secure password-verification approach against the same constraints before promising the exact stack.

Reference: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/).

### 2. Establish the Worker and D1 foundation

- Replace the legacy backend with a small Hono Worker, with explicit local-development, migration, test, and deployment scripts.
- Proposed production routing: retain Pages for the frontend and route `hangman.spyrostrimis.com/user/*` to the Worker. Verify the Cloudflare zone, proxied DNS, and Pages coexistence during setup. Keep browser API requests relative and same-origin. Use a Vite development proxy for the same paths locally.
- Store signing secrets using Workers secrets; use ignored local development secrets. Never put secrets in frontend environment variables.
- Use checked-in D1 migrations and prepared statements. Create the following tables:

| Table | Proposed columns and constraints |
| --- | --- |
| `users` | `id` primary key, display `username`, unique normalized `username_key`, `password_hash`, `created_at` |
| `scores` | `user_id` primary key and foreign key to users, nonnegative integer `total` default 0, `updated_at` |

- This is one cumulative score per user, matching the existing game, rather than a history of individual matches. Create the user and initial score in an atomic D1 batch. Increment using SQL `total = total + 100`, avoiding a read-then-write race.
- Index leaderboard ordering; use a deterministic secondary sort for tied totals.
- Proposed default: fresh registrations and scores. No import of old MongoDB records is included; revisit before cutover if old accounts must survive.

References: [Hono on Workers](https://hono.dev/docs/getting-started/cloudflare-workers), [Worker routes](https://developers.cloudflare.com/workers/configuration/routing/routes/), [D1 database API](https://developers.cloudflare.com/d1/worker-api/d1-database/), [D1 free-tier pricing and limits](https://developers.cloudflare.com/d1/platform/pricing/).

### 3. Implement the API and cookie authentication

Preserve the four existing route paths and HTTP methods; deliberately replace token response bodies with safe user data and cookies. Add two routes necessary for cookie-based frontend sessions:

| Method and path | Contract |
| --- | --- |
| `POST /user/signup` | Validate username/password, create user and zero score, set session cookie, return safe user data; duplicate username is a conflict. |
| `POST /user/login` | Verify credentials, set session cookie, return safe user data; generic invalid-credentials error. |
| `GET /user/me` | Verify session and return current user and score; otherwise 401. |
| `POST /user/logout` | Clear the session cookie. |
| `GET /user/get-best-scores` | Public bounded leaderboard, preserving the array of `{ username, score }`; proposed first release: top 100, including zero totals. |
| `PUT /user/add100` | Require authentication; add exactly 100 to the authenticated user's total and return the new total. Never accept a user ID or points amount from the caller. |

- Use expiring, signed JWTs through `jose`, with verified algorithm, issuer, audience, and expiry. Proposed initial lifetime: 24 hours, without automatic refresh.
- Use a host-only `HttpOnly`, `Secure`, `SameSite=Lax` cookie with `Path=/` and matching expiry. Apply an explicit localhost-only development configuration.
- Logout clears the browser cookie; an already-copied JWT remains valid until expiry. Immediate token revocation is outside this initial stateless design.
- Protect mutating requests with trusted-origin checks and required JSON where applicable. Do not enable wildcard credentialed CORS. Auth responses must not be cached.
- Validate server-side lengths and formats, normalize usernames consistently, avoid password truncation (including bcrypt's byte limit if retained), bound request sizes, and throttle authentication attempts using a verified free-tier-compatible mechanism. Never log passwords or tokens or return raw database errors.
- No email collection, recovery emails, OAuth, or password reset in the initial slice; make the lack of recovery clear when registering.

### 4. Connect registration, login, and navigation

- Introduce one shared auth state with loading, authenticated, and guest states, populated by `/user/me` on reload.
- Update Signup, Login, Navbar, Hall of Fame messaging, and Illucia access checks to consume that state.
- Remove localStorage token reads/writes and JWT decoding; clear the legacy token key once during transition.
- Preserve the visual design while adding visible validation, pending, and failure states. Use real labels, appropriate password autocomplete, and disabled duplicate submissions.
- Successful signup signs the player in. Login restores a safe internal destination. Logout calls the API and updates the UI immediately after success.
- Keep normal Hangman playable as a guest. Gate Illucia's page for registered users as advertised; any future AI endpoint must independently authenticate requests.

### 5. Connect wins and Hall of Fame

- Move the score side effect out of `Word.js` into the round lifecycle. Send one score request when a signed-in player wins; prevent ordinary duplicate sends from rerenders or effect reruns.
- Guest wins and losses send nothing. Do not award a past guest win when somebody signs in afterward.
- Show score-saving, success, and failure states without preventing the player from continuing. Do not automatically retry an ambiguous score write: it may already have reached the database.
- Keep intentional replay/forgery limitations documented. Client duplicate prevention is a UI correctness measure, not anti-cheat or guaranteed exactly-once delivery.
- Replace the leaderboard localhost URL, retaining timeout, abort, validation, and loading/empty/error states. Refresh when the Hall of Fame is opened so newly saved totals appear.

### 6. Verify, retire legacy code, and release

- API tests: signup validation, duplicate races, wrong password, invalid/expired JWT, cookie attributes, logout, rejected origins, unauthenticated scoring, atomic concurrent increments, safe public leaderboard fields, bounds and tie ordering.
- Frontend checks: register, reload, logout, login, expiration, guest play, one normal score submission per win, no score on loss, failed score save, and Hall of Fame loading/empty/failure/success. Cover the previous signup fall-through bug.
- Follow repository test discipline: demonstrate new regression tests fail when the behavior under test is broken, then restore it. Run the relevant client/API suites and production build; manually verify desktop/mobile flows.
- Remove the old Express/MongoDB/OpenAI backend and all eight `/word/` routes after their replacements are verified. Remove `axios` and `jwt-decode` only after checking all remaining imports, including disconnected legacy components.
- Update architecture, setup, limitations, and deployment documentation. Do not describe accounts or scores as rebuilt until end-to-end verification succeeds.
- Prepare D1 and secrets, deploy/verify the API, then publish the connected frontend. Keep changes scoped and reviewable on `main`; each push publishes production. Record rollback steps and preserve D1 data when reverting code. This planning request does not perform a deployment.

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
