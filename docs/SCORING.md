# Scored rounds

Approved and deployed 2026-10-01. Migration `0002_rounds.sql`, the Worker and the matching frontend are live; see the production verification below.

## Guarantees and limits

Signed-in Hangman uses server-issued, account-owned rounds. The server chooses from `tools/words.locked.json` (the canonical strings, imported directly, without dictionary metadata). The browser finds the matching manifest record by word rather than a deployment-sensitive array index. Browser and Worker use the same pure rules in `shared/hangman-core.js`; the old client module re-exports it for existing game and solver consumers.

A claim must contain 1–26 unique lowercase a–z guesses. Replay must end exactly at a win, with fewer than six misses and no guesses after a win or loss. Ownership, expiry, and successful consumption are checked on the server. The submitted sequence is evidence of a valid result, not evidence that somebody actually played it.

There is deliberately **no minimum round time, award cooldown, or daily cap**. A five-second win counts immediately. Answers are public and a bot can register, sign in, start a round, construct the distinct answer letters, and claim immediately. One outstanding round per account prevents stockpiling live tickets; it does not impose a scoring-speed ceiling. Existing approximate IP request limits provide basic request throttling, not strict global accounting or bot detection. Multiple accounts and distributed traffic remain possible.

CAPTCHAs, email verification, daily award caps, per-guess server adjudication and moderation are not implemented. They would add friction, operating work or architectural complexity without proving honest play. Reconsider if actual abuse or stakes justify them. The Hall of Fame remains unsuitable as a trusted competition ranking. Existing totals, including unverified awards from the original endpoint, are preserved.

## Protocol and concurrency

1. `POST /user/round/start` with `{}` resumes the account's outstanding round, or creates one. It returns `{roundId, word, expiresAt}`; times are Unix milliseconds. Random UUIDs identify tickets. Word selection happens in the Worker.
2. The browser plays entirely locally. There are no per-guess requests.
3. A win sends `POST /user/round/claim` with `{roundId, guesses}`. A successful claim or retry returns `{score}`, the cumulative total at the transaction's read. Each round can award 100 at most once.
4. Play again sends `{previousRoundId}` to start. The database deletes only that account's matching unclaimed ticket, then creates/resumes a round. Losing or abandoning a round therefore needs no separate completion request. A delayed duplicate start referencing the old ID resumes the replacement, rather than replacing it again.

A partial unique index enforces one unclaimed ticket per account, including simultaneous starts. Tabs share this outstanding ticket; claiming in two tabs awards once. Replacing a round in one tab invalidates that round in another tab. An expired unclaimed ticket is removed before starting a new one.

Claims replay against the stored word, then use one D1 batch: conditionally consume the unclaimed/unexpired ticket with a fresh server-only claim nonce; increment the score only if the ticket contains **this attempt's nonce**; read the claim state and total. A zero-row consumption cannot increment the score. A failed increment rolls back consumption. Successful retries use a new nonce, do not increment, and return the current total. The score ceiling is checked before consumption.

Unclaimed tickets expire after 30 minutes. Claimed tickets remain retryable for at least 24 hours after their original expiry, even when newer rounds have started. Each start prunes at most 100 rows older than that retention window using the expiry index. Cleanup is traffic-driven: inactive periods retain rows longer. Once removed, a ticket is rejected, never re-created by a claim. The server never accepts a caller-chosen new ticket ID.

`PUT /user/add100` is removed and returns 404. Authentication, exact Origin, bounded JSON, safe error responses, and existing IP limits apply to both new routes. Invalid histories return 400; missing, foreign, replaced, expired tickets or a reached score ceiling return 409 without an award.

## Client behavior

The first round waits for session restoration. Guests then play locally without round requests. Signed-in players wait for the start request; failure or a mismatched word manifest starts a visibly unranked local round. A late response cannot replace a newer round or a different page. A guest/unranked win is not upgraded by subsequently signing in.

Winning claims suppress ordinary duplicate sends, including React StrictMode. Play again waits for the pending save to finish. An ambiguous failure offers **Retry saving points**, using the same round and guesses; retries are safe even if the first request committed and its response was lost. Starting another round after a failure can abandon an unclaimed ticket. Expired sessions and definitively ineligible rounds show a message rather than promising an award. Score responses cannot update another signed-in account or overwrite a newer round's message.

## Release and verification

Run the client Node and UI tests and production build; run server type generation, TypeScript check, Workers/D1 integration tests and dry-run build. The tests cover immediate wins, simultaneous claims/starts, safe retries across rounds, account isolation, losing/invalid histories, expiry and cleanup, score ceilings, rollback after a forced write failure, vocabulary parity, guest/unranked play, StrictMode and stale start responses.

Local verification on 2026-10-01: 42 client Node tests, 44 UI tests and 14 Workers/D1 integration tests passed. Type generation, TypeScript checking, the client production build and Worker dry-run build passed. Migration `0002_rounds.sql` applied successfully to local D1. A browser smoke test signed in to a disposable local account, completed two rounds and confirmed totals of 100 then 200. The second award was recorded 2,098 ms after ticket issuance, verifying that a sub-five-second win counts. The test account was removed afterward. These are local results only.

Production release sequence (completed 2026-10-01):

1. Apply `0002_rounds.sql` to production D1. It adds the rounds table and indexes without changing existing scores.
2. Deploy the Worker, which removes the legacy endpoint. Old frontend tabs will temporarily fail to save scores; keeping `add100` alive would preserve the bypass. Coordinate the frontend release closely.
3. Publish the matching frontend and verify a fast win, retry, guest play and persisted Hall of Fame total in a real browser. Check deployed CPU and D1 usage; local results do not establish production capacity.

Production verification on 2026-10-01: implementation `f865419` was pushed to `main`; Pages deployment `6ce48bc8-0425-429c-ab0a-db15e93d8dba` served the new `/assets/index--FThfoVR.js` bundle on the custom domain. Worker version `1c27f227-b974-4517-aaf4-115df6ab8dde` was deployed after applying migration `0002_rounds.sql` to production D1. A disposable release account verified guest rejection (401), concurrent starts resuming the same ticket, invalid replay rejection (400), three simultaneous winning claims returning 100 total, and removal of the legacy endpoint (404). The account and its cascading score/round records were removed by exact account ID afterward. Production browser verification was attempted but denied by the browser permission layer; deployed CPU/D1 load measurements remain unverified. The local browser evidence above remains separate.

If rolling back, preserve D1 and account data. Restoring the old Worker also restores arbitrary score increments; do not present that as retaining the new protections.

The scoring hard rule in `CLAUDE.md` is now SYNC v5. Its separately maintained project-instructions mirror was not found in this checkout and needs the same approved wording when that external configuration is next edited.
