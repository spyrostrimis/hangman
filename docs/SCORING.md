# Scored rounds

The original round-ticket protocol was deployed 2026-10-01. The five-second floor API was deployed on 2026-10-01; the matching frontend is included in this release. Historical evidence below is identified separately.

## Guarantees and limits

Signed-in Hangman uses server-issued, account-owned rounds. The server chooses from `tools/words.locked.json` (the canonical strings, imported directly, without dictionary metadata). The browser finds the matching manifest record by word rather than a deployment-sensitive array index. Browser and Worker use the same pure rules in `shared/hangman-core.js`; the old client module re-exports it for existing game and solver consumers.

A claim must contain 1–26 unique lowercase a–z guesses. Replay must end exactly at a win, with fewer than six misses and no guesses after a win or loss. Ownership, expiry, and successful consumption are checked on the server. The submitted sequence is evidence of a valid result, not evidence that somebody actually played it.

**Answers are public by design.** The server guarantees valid replay, exactly-once awards for successfully claimed tickets, and a **5 s rate floor: at most 12 new awards per minute per account** (1,200 points, measured over half-open 60-second intervals). It does not verify that a human played. A bot can register, sign in, obtain the answer and manufacture a valid history, but must wait until the ticket is at least 5,000 ms old. One outstanding ticket per account prevents parallel stockpiling; a new ticket cannot predate the previous award, including a start request delayed behind that award. Replacing a round invalidates the old ticket and starts a fresh wait. Successful claim retries do not add awards or restart the wait. There is no daily cap. Existing approximate IP limits are additional request throttling, not the source of this account-level guarantee. Multiple accounts can each earn up to this rate.

### Cheater ceilings per account

What a script can earn at most, measured over half-open 60-second windows:

| Mode | Awards per minute | Most points per award | Points per minute |
| --- | --- | --- | --- |
| Hangman | 12 (5 s floor) | 100 | 1,200 |
| Illucia | 4 (15 s floor) | 300: Master, 6+ letters, two answered questions; +100 when it completes a ladder | 1,300 |

The Illucia figure is exact, found by trying every tier sequence: a window can hold at most one ladder bonus on top of four 300-point awards (a ladder needs Apprentice and Scholar wins, worth at most 180 and 240, before its Master win). Each mode has its own outstanding ticket, so one account can farm both at once: 2,500 points per minute. Multiple accounts can each earn up to this rate.

These Illucia values (C3: ×1.5/×2 question multipliers, 15 s floor) replaced the C1 values (×1.25/×1.5, 12 s floor, ceiling 1,225) with Worker `b5095175` on 2026-10-02.

CAPTCHAs, email verification, daily award caps, per-guess server adjudication and moderation are not implemented. They would add friction, operating work or architectural complexity without proving honest play. Reconsider if actual abuse or stakes justify them. The Hall of Fame remains unsuitable as a trusted competition ranking. Existing totals, including unverified awards from the original endpoint, are preserved.

## Protocol and concurrency

1. `POST /user/round/start` with `{}` resumes the account's outstanding round, or creates one. It returns `{roundId, word, issuedAt, expiresAt, serverNow}`; times are Unix milliseconds. Random UUIDs identify tickets. Word selection happens in the Worker. The word remains in the response as the honest consequence of local play.
2. The browser plays entirely locally. There are no per-guess requests.
3. A win sends `POST /user/round/claim` with `{roundId, guesses}`. A successful claim or retry returns `{score}`, the cumulative total at the transaction's read. Each round can award 100 at most once.
4. Play again sends `{previousRoundId}` to start. The database deletes only that account's matching unclaimed ticket, then creates/resumes a round. Losing or abandoning a round therefore needs no separate completion request. A delayed duplicate start referencing the old ID resumes the replacement, rather than replacing it again.

A partial unique index enforces one unclaimed ticket per account, including simultaneous starts. Tabs share this outstanding ticket; claiming in two tabs awards once. Replacing a round in one tab invalidates that round in another tab. An expired unclaimed ticket is removed before starting a new one.

Claims replay against the stored word, then use one D1 batch: conditionally consume the unclaimed/unexpired ticket with a fresh server-only claim nonce; increment the score only if the ticket contains **this attempt's nonce**; read the claim state and total. A zero-row consumption cannot increment the score. A failed increment rolls back consumption. Successful retries use a new nonce, do not increment, and return the current total. The score ceiling and `issued_at <= now - 5000` are checked in the conditional consumption statement. At 4,999 ms, the server responds with HTTP 409 and `{code: "ROUND_TOO_EARLY", retryAfterMs: 1, message: ...}` without consuming the ticket or changing the score. The same ticket is eligible at exactly 5,000 ms. The latest previous claim timestamp is a lower bound on new ticket issuance; migration `0004_round_claim_times.sql` indexes that per-account lookup.

Unclaimed tickets expire after 30 minutes. Claimed tickets remain retryable for at least 24 hours after their original expiry, even when newer rounds have started. Each start prunes at most 100 rows older than that retention window using the expiry index. Cleanup is traffic-driven: inactive periods retain rows longer. Once removed, a ticket is rejected, never re-created by a claim. The server never accepts a caller-chosen new ticket ID.

`PUT /user/add100` is removed and returns 404. Authentication, exact Origin, bounded JSON, safe error responses, and existing IP limits apply to both new routes. Invalid histories return 400; missing, foreign, replaced, expired tickets or a reached score ceiling return 409 without an award.

## Client behavior

The first round waits for session restoration. Guests then play locally without round requests. Signed-in players wait for the start request; failure or a mismatched word manifest starts a visibly unranked local round. A late response cannot replace a newer round or a different page. A guest/unranked win is not upgraded by subsequently signing in.

On an early win the client shows **Saving…** and holds the claim until `issuedAt + 5000`. It converts `issuedAt` and `serverNow` to a monotonic client deadline so a wrong device wall clock cannot skip the wait or add hours. Response transit time can only make this initial wait conservative. A typed `ROUND_TOO_EARLY` response transparently waits its `retryAfterMs` and retries the same ticket; it is never shown as an error to the player. Navigation or an account change during the delay prevents sending a stale claim.

Winning claims suppress ordinary duplicate sends, including React StrictMode. Play again waits for the pending save to finish. An ambiguous failure offers **Retry saving points**, using the same round and guesses; retries are safe even if the first request committed and its response was lost. Starting another round after a failure can abandon an unclaimed ticket. Expired sessions and definitively ineligible rounds show a message rather than promising an award. Score responses cannot update another signed-in account or overwrite a newer round's message.

## Illucia rounds

Illucia (Play vs AI) reverses the roles: the player sets the word and she guesses. The player scores by stumping her, i.e. she reaches six misses. Status: deployed 2026-10-02 (migration `0006`, Worker `d6721260`; see `server/RELEASE.md`). No page calls these routes yet, and an authenticated production check is still pending.

**Protocol.** `POST /user/illucia/start` with `{word, tier, experimental?, previousRoundId?}` commits the player's word before play. The Worker checks it against the same per-length word files the browser loads (lengths 4–15) and returns `{roundId, word, tier, experimental, seed, issuedAt, expiresAt, serverNow, points}`, or 400 `NOT_ACCEPTED_WORD`. `seed` is a fresh 32-bit integer for her per-round randomness. `points` previews the stump points before questions, or why there are none, and `ladder` is `{rung, next, minLength}` for this round. Each account has one open Illucia ticket, separate from its Hangman ticket. The same word, tier and mode resumes it; any other start, or naming it as `previousRoundId`, abandons it. Like Hangman, no ticket is issued before the account's last Illucia award, tickets expire after 30 minutes, and the hourly sweep removes them 24 hours after claim or expiry.

A win sends `POST /user/illucia/claim` with `{roundId, guesses, answeredQuestions?}`. The Worker rules-checks the guesses against the committed word: 6–26 unique lowercase letters, the sixth miss on the last guess, the word never solved. It **does not replay her choices**; which letters she picked, and whether she asked or the player answered questions, are client-reported. A claim is accepted from `issued_at + 15,000 ms`; earlier claims get 409 `ROUND_TOO_EARLY` with `retryAfterMs`, without consumption. Consumption, the beaten-word record and the score increment are one nonce-guarded D1 batch, as for Hangman. A successful claim or retry returns `{score, awarded: {stump, ladder}, reason?, ladder}`; the award is stored on the ticket, and `ladder` is the rung the next new round would find.

**Points** (`shared/scoring-protocol.js`). Stump points = tier base × min(length − 3, 3), with Apprentice 30, Scholar 40, Master 50. One answered question multiplies them by 1.5, two by 2 (C3, deployed 2026-10-02; previously 1.25 and 1.5). A win pays no stump points, with a `reason`, when:

- the round is experimental (`EXPERIMENTAL`);
- the word is outside that tier's vocabulary, i.e. ESDB size above 35 for Apprentice or 50 for Scholar (`OUTSIDE_TIER`); Master knows every accepted word;
- the word has already paid this player at any tier (`ALREADY_WON`); the client shows `ILLUCIA_ALREADY_WON_MESSAGE`.

| Stump points (0 / 1 / 2 answered questions) | 4 letters | 5 letters | 6+ letters |
| --- | --- | --- | --- |
| Apprentice | 30 / 45 / 60 | 60 / 90 / 120 | 90 / 135 / 180 |
| Scholar | 40 / 60 / 80 | 80 / 120 / 160 | 120 / 180 / 240 |
| Master | 50 / 75 / 100 | 100 / 150 / 200 | 150 / 225 / 300 |

**Ladder.** Win Apprentice, then Scholar, then Master in consecutive Illucia rounds, each word at least one letter longer than the last, and the Master win pays +100 (not multiplied by questions). Only wins that pay stump points climb; any other win resets the ladder: experimental rounds, out-of-tier words, spent words, wrong tier order, or a word that is not longer. An Apprentice win always starts a new ladder. Each new ticket takes the next per-account round number, and the ladder stays alive only for the round right after its last step, so a loss, an abandoned or expired round, or any other round in between resets it without any extra request. The claim computes the ladder from a read and consumes the ticket only if that ladder state still holds.

**Memory.** Every normal-mode win is kept in `illucia_beaten_words` per account until account deletion; a word is spent once it has paid. Out-of-tier wins are recorded with 0 points and leave the word unspent. Experimental wins are not recorded.

**Player memory (C2; deployed 2026-10-02, migration `0007`, Worker `352bfbb2`; no page calls it yet).** Only normal-mode rounds count, once, when their ticket is created (`illucia_rounds.counted`): a resume does not count, a replay does, experimental rounds never do. Each counted ticket adds a play of its word for the player (`illucia_player_words`), a game for its tier (`illucia_tier_stats`, whose wins come from claims of counted tickets) and a play to the global `word_counts`, which has no account or time and survives account deletion. Each account has a stable 32-bit `personality_seed`.

The start response carries `memory.brain` and `memory.voice`. `brain` is the only part that may reach her guessing: the personality seed, games played, per-letter play counts and the learned words of this word's length, all computed from the history **without the current round**, so nothing in it depends on the secret word beyond its length. A test gives two accounts the same history, starts different words of the same length, and requires identical `brain` data. `voice` is for her lines and knows the word: the player's earlier plays of it, whether it beat her before, and its global play count (again without the current round). How `brain` is used, such as the letter prior's weight, is Track A's decision.

`GET /user/illucia/stats` returns the player's own games, wins and lost-or-abandoned (games − wins; losses send no request) overall and per tier, the learned-word total with the 100 most recent, and play counts by length and letter. A round still in play is left out until it is claimed or expires.

**Limits.** A modified client can claim any accepted, unspent word with six invented misses. The bounds are the tier vocabulary, once-per-word, the 15 s floor and one open ticket (see the ceiling table above). A question about a word WordNet does not know earns no multiplier; that rule is enforced by the client only.

## Release and verification

Run the client Node and UI tests and production build; run server type generation, TypeScript check, Workers/D1 integration tests and dry-run build. The tests cover the exact 4,999/5,000 ms boundary, delayed client claims, transparent early-response retries, server-relative timing, simultaneous claims/starts, safe retries across rounds, account isolation, losing/invalid histories, expiry and cleanup, score ceilings, rollback after a forced write failure, vocabulary parity, guest/unranked play, StrictMode and stale start responses.

Local verification on 2026-10-01: 42 client Node tests, 44 UI tests and 14 Workers/D1 integration tests passed. Type generation, TypeScript checking, the client production build and Worker dry-run build passed. Migration `0002_rounds.sql` applied successfully to local D1. A browser smoke test signed in to a disposable local account, completed two rounds and confirmed totals of 100 then 200. That historical smoke test predates the floor. Its sub-five-second award check is superseded by the exact-boundary and client-delay tests below. The test account was removed afterward. These are local results only.

Five-second-floor verification on 2026-10-01: 43 client Node tests, 51 UI tests and 21 Workers/D1 integration tests passed in the shared working tree (including the separately developed account-deletion tests). TypeScript checking, the client production build and Worker dry-run build passed. Existing retry and concurrency coverage remains green. These checks exercise the pending implementation; the five-second UI behavior still needs a manual browser smoke test, and migration `0004_round_claim_times.sql` has not been applied to production.

Each new test was mutation-checked: the deliberate changes below caused the corresponding test to fail, then were restored before the final passing suite. Boundary and rejection checks include successful controls using the same ticket or fixture.

| Deliberate mutation | Test that caught it |
| --- | --- |
| Remove the five-second subtraction from the SQL consumption gate | 4,999 ms rejection, unchanged score and unconsumed ticket |
| Change the inclusive SQL boundary to strict less-than | Same ticket succeeds at exactly 5,000 ms |
| Remove the latest-award lower bound from ticket issuance | Delayed start cannot shorten the next award interval; concurrent claims award once |
| Skip the client's initial wait | Early win stays on Saving… through 4,999 ms and saves at 5,000 ms |
| Surface the early-response error instead of waiting and retrying | Typed early response stays on Saving… and retries successfully |
| Remove the post-wait mounted/ticket/account guard | Unmounted client sends no delayed claim; remounted fixture saves successfully |
| Use the device wall clock instead of the server timestamp | Incorrect device time does not change the server-relative deadline |
| Drop response metadata when constructing ApiError | Early error preserves its code and retry delay; successful response still returns score |

Original protocol production release sequence (completed 2026-10-01):

1. Apply `0002_rounds.sql` to production D1. It adds the rounds table and indexes without changing existing scores.
2. Deploy the Worker, which removes the legacy endpoint. Old frontend tabs will temporarily fail to save scores; keeping `add100` alive would preserve the bypass. Coordinate the frontend release closely.
3. Publish the matching frontend and verify a fast win, retry, guest play and persisted Hall of Fame total in a real browser. Check deployed CPU and D1 usage; local results do not establish production capacity.

Production verification on 2026-10-01: implementation `f865419` was pushed to `main`; Pages deployment `6ce48bc8-0425-429c-ab0a-db15e93d8dba` served the new `/assets/index--FThfoVR.js` bundle on the custom domain. Worker version `1c27f227-b974-4517-aaf4-115df6ab8dde` was deployed after applying migration `0002_rounds.sql` to production D1. A disposable release account verified guest rejection (401), concurrent starts resuming the same ticket, invalid replay rejection (400), three simultaneous winning claims returning 100 total, and removal of the legacy endpoint (404). The account and its cascading score/round records were removed by exact account ID afterward. Production browser verification was attempted but denied by the browser permission layer; deployed CPU/D1 load measurements remain unverified. The local browser evidence above remains separate.

If rolling back, preserve D1 and account data. Restoring the old Worker also restores arbitrary score increments; do not present that as retaining the new protections.

Scoring is no longer a CONSTRAINT (SYNC v7, 2026-10-01). CLAUDE.md describes the design and links here.

Release verification, five-second floor (2026-10-01): the isolated scoring-only tree passed 43 Node tests, 48 UI tests and 16 Worker tests, TypeScript checking and both builds. A local browser signed in and completed a scored win, showing 100 points; the early-wait boundary remains covered by the automated timer tests. Migration `0004_round_claim_times.sql` was applied remotely and Worker `46a25777-a867-4f59-9773-304c5a3d155d` deployed. A disposable production account received `ROUND_TOO_EARLY`, then the same ticket succeeded after its wait; concurrent retries returned 100 total. The release account was deleted afterward. Production browser verification remains unavailable under the earlier browser permission denial.
