# Account API

Hono on Cloudflare Workers, with D1 and Web Crypto. The frontend uses same-origin `/user/*` requests. Normal Hangman remains playable without the API.

## Authentication protocol (v1)

1. Signup generates a random 128-bit salt in the browser. Login obtains the existing salt from `POST /user/auth-params` with `{username}`. Unknown names receive a stable secret-HMAC-derived dummy salt with the same response shape; usernames are normalized with trim + ASCII lowercase.
2. The browser uses Web Crypto PBKDF2-HMAC-SHA-256, 600,000 iterations, with UTF-8 password bytes, the UTF-8 salt string `hangman.spyrostrimis.com:password:v1:<32 lowercase hex salt>`, and a 256-bit output. No password trimming or normalization. The credential is 64 lowercase hex characters.
3. Signup sends `{username, credential, salt, version: 1}`. Login sends `{username, credential}`. The raw password is never sent to the API. The official signup form requires 15–128 characters; the server cannot enforce password strength or stretching against a modified client.
4. The Worker stores HMAC-SHA-256 under `AUTH_PEPPER` over the UTF-8 JSON encoding of `['hangman-verifier-v1', normalizedUsername, salt, credential]`. Verification uses native `crypto.subtle.verify`. Neither password nor submitted credential is stored in D1.
5. Successful signup/login sets a signed HS256 JWT in a host-only `__Host-hangman_session` cookie (`HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`). Tokens expire after 24 hours and verify issuer, audience, subject, issued-at and expiry. The browser retrieves its user through `/user/me`.

The derived credential is password-equivalent and replayable if stolen, just like a transmitted password. It must never enter logs, analytics, localStorage, or error reports. A leaked credential permits offline password guessing at the stretching cost. A D1-only leak lacks the pepper; with D1 and pepper both compromised, password guesses still incur the client KDF cost for accounts made by the official client. This is a project-specific protocol, not a PAKE or a claim of equivalence with Bitwarden.

Fake salts and generic errors reduce username enumeration, not eliminate it: registration reports duplicates, the leaderboard publishes names, and salts change when an unknown name becomes an account. KDF upgrades need a migration design to avoid exposing account existence through differing parameters. The only accepted version is currently 1.

## Routes

| Method | Path | Result |
| --- | --- | --- |
| POST | `/user/auth-params` | `{algorithm, iterations, version, salt}` |
| POST | `/user/signup` | Session cookie and `{user: {id, username, score}}` |
| POST | `/user/login` | Session cookie and `{user: {id, username, score}}` |
| GET | `/user/me` | Current user or 401 |
| POST | `/user/logout` | Expired cookie and `{ok: true}` |
| POST | `/user/delete-account` | Session plus `{credential}` from the existing login derivation; deletes account-linked rows, expires cookie, returns `{ok: true}` |
| GET | `/user/get-best-scores` | Top 100 `{username, score}` rows, descending score then ascending user ID |
| POST | `/user/round/start` | Authenticate; `{}` resumes or creates a round; optional `{previousRoundId}` replaces that owned, unclaimed round; returns `{roundId, word, issuedAt, expiresAt, serverNow}` |
| POST | `/user/round/claim` | Authenticate; `{roundId, guesses}` validates a winning sequence and awards once; returns `{score}` on success or a successful retry |
| POST | `/user/illucia/start` | Authenticate; `{word, tier, experimental?, previousRoundId?}` commits the player's word for an Illucia round. The same word, tier and mode resumes the open Illucia round; anything else, or naming it as `previousRoundId`, abandons it. Returns `{roundId, word, tier, experimental, seed, issuedAt, expiresAt, serverNow, points, ladder, memory}`, or 400 `NOT_ACCEPTED_WORD`. `memory.brain` (personality seed, games, letter counts, learned words of this length) is history without the current round; `memory.voice` (earlier plays of this word by the player and by everyone, whether it beat her before) is for her lines only |
| POST | `/user/illucia/claim` | Authenticate; `{roundId, guesses, answeredQuestions?}` rules-checks a loss for Illucia (her sixth miss is the last guess) at least 15 s after issue and awards stump points and any ladder bonus once; returns `{score, awarded: {stump, ladder}, reason?, ladder}` on success or a successful retry |
| POST | `/user/illucia/ask` | Authenticate; `{roundId, candidates}` in an open **experimental** round: Llama 3.3 70B invents a yes/no meaning question over 2–80 sorted, distinct accepted words of the round's length. Returns `{ok: true, question, yes, no, questionsLeft}`, or `{ok: false, reason, questionsLeft}` with `reason` one of `disabled`, `round-limit`, `user-limit`, `budget`, `timeout`, `unavailable`, `invalid`, after which the page makes her normal move. 400 for bad input, 409 for a round that is not open, not yours or not experimental. See below |
| GET | `/user/illucia/stats` | Authenticate; the player's own normal-mode stats: `{games, wins, lostOrAbandoned, tiers, learned: {total, recent}, history: {lengths, letters}, ladder: {rung, next, minLength}, spent: {total, words}}`. `recent` is the 100 most recently learned words; a counted round still in play is left out. `ladder` is the ladder as the next new round would find it (as in a claim response; an open round would be abandoned by a different one, so it reads rung 0 then). `spent` lists up to 1,000 most recent words that already paid, so the page can warn before a word is committed; the claim stays the authority. Global word counts are not included |

Mutations require JSON and an exact trusted Origin. All responses are `no-store`; request bodies are capped at 2 KiB. Native rate-limit bindings allow 60 requests/IP/minute and 10 signup/login/deletion attempts/normalized username/minute. These are approximate, per Cloudflare location, not a global anti-abuse guarantee; shared networks can hit the IP limit. No raw request bodies or exception messages are logged.

The round-ticket API replaces `/user/add100` entirely. A server-selected word comes directly from `tools/words.locked.json`; the Worker and browser use `shared/hangman-core.js`. The database enforces one outstanding round per account and at most one award per round, with consumption and increment in one atomic batch. Claims require unique lowercase a–z guesses ending exactly at a win before six misses. Unclaimed rounds expire after 30 minutes; successful claims can be retried until cleanup, 24 hours after their claim. The five-second-floor update requires a ticket age of at least 5,000 ms. Early claims return HTTP 409 with `code: "ROUND_TOO_EARLY"` and `retryAfterMs`, without consumption or points. The client holds early wins behind “Saving…” and silently waits/retries an early response. One outstanding round and an issuance timestamp no earlier than the last award enforce at most 12 awards per minute per account. There is no daily cap. The timing API is deployed; the matching frontend is included in this release.


Public answers still permit manufactured wins and bots; neither authentication nor replay validation proves human play. Existing approximate IP limits remain. Starts resume the outstanding round across tabs; explicitly replacing it invalidates it in other tabs. API start failures fall back to visibly unranked local play. Uncertain claim failures offer a manual retry using the same ticket. Guests do not earn points. Illucia rounds score through `/user/illucia/*`: the word is committed at start, and a claim is rules-checked but her choices are not replayed. Existing score totals are preserved, including earlier unverified awards. See [scoring design, threat model and release steps](../docs/SCORING.md).

Logout clears the browser cookie; a copied JWT remains valid until expiry unless the account is deleted. There is no password reset, email recovery or password change UI.

## Account deletion

Signed-in players open **Account** beside their username and re-enter their password. The client obtains `/user/auth-params` for that username and uses the exact login derivation. The Worker takes the target account from the authenticated cookie, not from a submitted username or ID. Deletion shares the IP limit, normalized-username auth limit, exact-Origin check, JSON requirement, 2 KiB body limit and `no-store` responses. Wrong proof returns 403; a missing/deleted session returns 401.

One atomic D1 batch records `deleted_accounts(id, deleted_at)` and removes that UUID's Hangman and Illucia rounds, Illucia player record, beaten words, played words, per-tier stats and daily AI question counts, score and user. The tombstone contains only the UUID and deletion time, for reapplying erasure after recovery. The global `word_counts` table is not changed: it has no account or time column and was never linked to anyone. Success expires the session cookie. All protected routes look up the account in D1, so copied tokens stop authenticating after deletion; round foreign keys also prevent an in-flight start from recreating orphan records. Public endpoints remain public. There is no account recovery through the product.

IDs already use `TEXT PRIMARY KEY` and `crypto.randomUUID()`; no integer-ID migration was needed. Re-registering the same username creates a different identity. Regression tests cover this and all protected routes.

### Restore without resurrecting deleted accounts

D1 Time Travel also rewinds the tombstone table. **Never rely only on tombstones inside the restored snapshot.** Before any restore:

1. Put the account API into maintenance (block reads and writes, including login/signup/deletion/rounds), pause its Cron Trigger, and wait for in-flight requests to finish. Keep this barrier in place until verification is complete.
2. Export the current `deleted_accounts` table to a restricted local recovery file with `wrangler d1 export DB --remote --table deleted_accounts --output <restricted-path>`. Confirm the export succeeded before restoring. Keep the original deletion timestamps; never print this data in release logs or commit it.
3. Restore the chosen point within the seven-day Free recovery window. Reapply migrations if the snapshot predates the tombstone schema. Merge preserved tombstones by UUID, keeping the earlier deletion time on duplicates. Also retain tombstones already present in the restored snapshot. Do not run cleanup before reapplying deletions.
4. In one D1 batch, execute `DELETE FROM rounds WHERE user_id IN (SELECT id FROM deleted_accounts)`, the same statement for `illucia_beaten_words`, `illucia_player_words`, `illucia_tier_stats`, `illucia_rounds` and `illucia_players` (never `word_counts`), `DELETE FROM scores WHERE user_id IN (SELECT id FROM deleted_accounts)`, then `DELETE FROM users WHERE id IN (SELECT id FROM deleted_accounts)`. If any statement fails, keep maintenance enabled and resolve it before reopening.
5. Verify that no user, score, round or Illucia row matches a tombstoned UUID. Check stale-session rejection and an unaffected account. Resume the hourly schedule and API only after these checks. Delete the temporary recovery export after successful verification.

If current tombstones cannot be recovered, do not restore an older snapshot into service: it could revive erased accounts. Escalate recovery to the operator. Keeping seven days of tombstones protects the supported seven-day restore window; longer-lived exports are not a supported restore source. D1 recovery copies may retain deleted account data for up to seven days; historical tombstone copies may also persist after their live purge.

References: [D1 batch atomicity](https://developers.cloudflare.com/d1/worker-api/d1-database/), [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/), [Free recovery limits](https://developers.cloudflare.com/d1/platform/limits/).

## Illucia memory

Illucia's per-player memory (`illucia_player_words`, `illucia_tier_stats`, `illucia_beaten_words`, `illucia_players.personality_seed`) is kept until account deletion. Design: `docs/SCORING.md`.

- **`word_counts` is never exposed publicly**, neither as a list nor as a per-word number. The only read is the current word's global count in the `voice` data of that player's own start response. Any future public display (popular words, rankings) must apply a minimum-count threshold so rare words cannot single anyone out.
- **Letter counts are computed on read** from the player's `illucia_player_words` rows at every start and stats request: one row per distinct word played. That is cheap at today's sizes. If word histories grow large, the upgrade path is a stored per-player tally (26 counts and a games total, updated when a ticket is counted). It is not built.

## Illucia experimental AI mode (v2 D2)

`/user/illucia/ask` is the server half of experimental mode; the `/illucia` toggle (E5) is not built yet. Model choice and measurements: `tools/ILLUCIA-AI-QUESTIONS.md` (D1).

- **Model and prompt:** chosen by `AI_MODEL` from `AI_MODELS` in `src/illucia-ai.ts`: `llama-3.3-70b` (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`, the D1 pick, no reasoning, at most 768 output tokens, 6 s timeout) or `gpt-oss-120b-medium` (`@cf/openai/gpt-oss-120b`, `reasoning_effort: "medium"`, at most 4,096 output tokens, 40 s timeout; the owner's live trial from 2026-10-03, not measured offline at this effort). An unknown value switches the mode off. The reply carries the model's label, which the page shows in her note. Both use temperature 0 and D1's prompt and validator (`shared/illucia-question.js`). The model receives `{count, candidates}` only. The candidates can include the player's word, unmarked; the model never gets the word, the round, the board or the account.
- **Input rules:** candidates must be sorted, distinct, accepted Illucia words of the round's length, so the endpoint cannot serve as a general-purpose model.
- **Reply rules:** a reply is used only if it passes the validator ("Can your word mean …?", no letter talk, lists covering every candidate exactly once, 25–75% YES) and the vocabulary screen. Every question word longer than three letters must be an accepted (profanity-filtered) word, and shorter words come from an allowlist.
- **Limits:** 2 questions per round; `AI_USER_DAILY_QUESTIONS` per account per UTC day (30; 10 until 2026-10-03); a site-wide daily budget of `AI_DAILY_NEURONS` (2,000) and `AI_DAILY_REQUESTS` (60). All are granted together in one atomic D1 batch. A grant reserves its worst case (about 175 neurons for Llama, about 300 for gpt-oss-120b medium), and measured usage replaces the reservation, also after a timeout (`waitUntil`). A question counts as used even if the reply is rejected. `AI_ENABLED=false` switches the mode off; malformed limit values also switch it off.
- **Timeout:** per model, 6 s for Llama (D1: every Llama 3.3 reply arrived within 4.8 s) and 40 s for gpt-oss-120b medium; the page waits 45 s.
- **Data:** `illucia_ai_users(user_id, day, questions)` is deleted with the account and swept two days after its day; `ai_budget(day, requests, neurons)` has no account. Questions and answers are not stored. Logs record only an outcome and a duration.
- **Allowance:** the budget counts only this route. Other Workers AI use on the account (the I7a/D1 tools) shares Cloudflare's 10,000 free neurons a day. Workers Free refuses requests beyond the allowance, and the page then falls back.
- **Local and tests:** the `local` environment has no AI binding, so development and tests never call Workers AI; tests inject a fake binding.

## Retention and diagnostic logs

An hourly Cron Trigger (`0 * * * *`, UTC) removes claimed Hangman and Illucia rounds once `claimed_at` is at least 24 hours old, unclaimed rounds once `expires_at` is at least 24 hours old, daily AI question counts (`illucia_ai_users`) once their UTC day is two days old, and deletion tombstones strictly older than seven days. Each run uses one atomic D1 batch of six indexed statements, each removing at most 100 oldest eligible rows. Normal cleanup occurs on the next hourly run; failures, quotas or more than 100 eligible rows in a category can delay it. Starting another round may remove that player's expired or explicitly replaced unclaimed ticket sooner. Account deletion removes all of that account's rounds immediately.

The cap permits up to 2,400 deletions per category per day. Check scheduled-event failures, D1 usage and the age/count of eligible rows after deployment and during operation; a growing backlog needs an operator response, not a paid upgrade. The Free plan allows five Cron Triggers/account, 10 ms CPU/invocation, 50 D1 queries/invocation, five million rows read/day and 100,000 rows written/day. Index updates also count toward writes. This sweep uses six queries; its cap is not a guarantee that all application traffic stays within quotas. Production CPU must be measured separately. Migration 0005 adds partial indexes for the two round clocks; 0003 already indexes tombstone age. Migration 0006 gives Illucia rounds the same two retention indexes.

Invocation logs are disabled with `observability.logs.invocation_logs: false`. Custom application error logging remains enabled with sampling 1. API errors record only an event name, route path and method; retention errors use a fixed event name. Do not add passwords, derived credentials, cookies, usernames, SQL errors or bodies to diagnostics. Cloudflare may attach platform metadata to stored errors. Workers Logs on Free retains events for up to three days (200,000 events/day).

For temporary debugging, announce the production deploy, set `observability.logs.invocation_logs` to `true`, deploy, reproduce only the required issue, then set it back to `false` and announce/deploy the restoration immediately. Record the diagnostic window in the release evidence. Do not add payload logging or export logs as a routine backup. Existing diagnostic logs can remain until their three-day expiry. Keep Bot Fight Mode and JavaScript Detections enabled; this Worker setting does not disable those protections.

References: [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/), [Workers Free limits](https://developers.cloudflare.com/workers/platform/limits/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [D1 pricing and indexed writes](https://developers.cloudflare.com/d1/platform/pricing/), [Workers Logs configuration and retention](https://developers.cloudflare.com/workers/observability/logs/workers-logs/).

## Local development

From `server/`:

```sh
npm ci
npm run setup:local
npm run types
npm run migrate:local
npm run dev
```

`setup:local` creates random, local-only secrets in ignored `.dev.vars` if it does not already exist. Never reuse these as production secrets. The local environment permits an insecure cookie only on localhost/127.0.0.1 and trusts `http://localhost:5173`. Open the frontend at that exact origin (Vite proxies `/user` to port 8787).

```sh
# Another terminal, from client/
npm ci
npm run dev
```

Validation: `npm run types`, `npm run check`, `npm test`, `npm run build` in `server/`; `npm test`, `npm run test:ui`, `npm run build` in `client/`. The Worker tests use real local D1 migrations and Workers crypto, with rate-limit decisions injected deterministically. UI tests cover the account forms and round lifecycle; browser verification covers actual cookie persistence and game integration.

The test-pool dependency overrides align its older bundled Wrangler/Miniflare with the project's runtime. Recheck overrides when upgrading the pool. Generated Env types come from Wrangler; run `setup:local` before `types` so the three secret bindings are included.

## Production release and rollback

1. Verify the Cloudflare account and plan; remain on Free and never enable a paid plan implicitly. Keep the Pages custom domain proxied through the active `spyrostrimis.com` zone. The API route is `hangman.spyrostrimis.com/user/*`, separate from Pages assets.
2. Create `hangman-accounts` D1 and record its ID in `wrangler.jsonc`. Apply checked-in migrations with `npm run migrate:remote` before connecting the UI. Never point local/test bindings at production data.
3. Set three independently generated, random secrets (at least 32 random bytes, base64url encoded) with `wrangler secret put JWT_SECRET`, `wrangler secret put AUTH_PEPPER`, and `wrangler secret put SALT_SECRET`. Never print or commit them. Keep a secure recovery copy of the pepper: losing it makes existing verifiers unusable. Pepper rotation needs a versioned migration; simply replacing it locks out accounts. Rotating JWT_SECRET invalidates sessions; rotating SALT_SECRET changes dummy salts only.
4. Deploy the Worker and verify real production signup/login, cookies, expiry rejection, and score writes before publishing the frontend. Check deployed CPU usage against the Free plan budget; local timing is not production CPU evidence.
5. Build and manually verify the frontend, then commit/push the scoped change on `main` (every push triggers a Pages production deployment). Confirm `/user/*` returns API JSON while `/`, `/hangman`, and nested SPA routes still serve the frontend.
6. The `pages.dev` hostname is not the account origin. Use the account-level Bulk Redirect list `hangman_canonical` to send `hangman-caq.pages.dev` (including deployment subdomains) to `https://hangman.spyrostrimis.com`, preserving the path and query string. Pages `_redirects` does not support domain-level source matching. Cloudflare quotas can make account operations temporarily unavailable; guest gameplay stays independent.

Rollback: revert the frontend commit and redeploy Pages; use `wrangler rollback` to a known good Worker version if one exists. Keep D1 and secrets intact; do not drop the database or reverse data migrations as a code rollback. For the first release, removing the new Worker route returns the site to the prior frontend-only behavior, which had no functioning production accounts.

## References

- [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Canonical Pages domain redirects](https://developers.cloudflare.com/pages/how-to/redirect-to-custom-domain/)
- [Workers rate limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
- [Workers Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/)
- [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [OWASP authentication guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
