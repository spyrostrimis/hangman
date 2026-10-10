# Account release record

Round-ticket follow-up (2026-10-01): deployed after applying production migration `0002_rounds.sql`. Worker `1c27f227-b974-4517-aaf4-115df6ab8dde`; implementation commit `f865419`; Pages deployment `6ce48bc8-0425-429c-ab0a-db15e93d8dba`. Production API checks passed for guest rejection, invalid replay rejection, concurrent start/claim idempotency and legacy endpoint removal. The disposable test account was removed. Production browser verification was denied by the browser permission layer; fresh deployed CPU measurements remain unverified. See [scoring design and release steps](../docs/SCORING.md). The evidence below records the original account release.

Updated 2026-09-27. Registration, login, cumulative scores, and the Hall of Fame are deployed and verified at https://hangman.spyrostrimis.com.

## Verified locally

- 8 Workers/D1 integration tests: registration, actual browser-derived credentials, wrong passwords, fake salts, duplicates, request validation, Origin enforcement, rate-limit decisions, cookie/JWT expiry and scope, logout, atomic score increments, and leaderboard ordering/limit.
- 11 client Node tests and 8 React component tests: credential derivation, one score submission per round, form errors, pending submissions, StrictMode, guest wins, session expiry, Illucia's account gate, and leaderboard states.
- Server type generation, TypeScript check, Worker dry-run build, and frontend production build pass.
- Three deliberate mutations were rejected by tests: bypassing password verification, removing the per-round duplicate guard, and navigating after failed signup. Each mutation was restored before the final green run.
- Manual local browser checks: signup, wrong/correct login, logout, cookie persistence across reload, guest Illucia gate, a completed Hangman round saving 100 points, and the persisted Hall of Fame result. Mobile form/navigation layout was checked at 390 px; navigation wrapping was adjusted after clipping was observed.
- Server dependency audit reports zero advisories. The client retains nine advisories in its existing dependency tree (three moderate, six high); broader dependency updates remain separate work.

## Production API verification

Cloudflare authentication was refreshed successfully after an expired OAuth callback. D1 `hangman-accounts` was provisioned in EEUR, migration `0001_accounts.sql` applied, and three independent production secrets installed. Worker version `70c1744e-67fc-4714-b1a6-e317e4304742` is routed at `hangman.spyrostrimis.com/user/*`.

- Live smoke checks passed: signup, correct/wrong login, auth parameters, cookie flags, current session, atomic 100-point write, leaderboard result, invalid and correctly signed expired token rejection, and logout cookie expiry.
- Cloudflare dashboard confirms **Free is the current plan**. Initial deployed CPU chart reports P50 **1.96 ms** and P99/P999 **3.56 ms**, below the 10 ms Free allowance for this small smoke-test sample. This is initial evidence, not a load-test guarantee.
- Desktop account layout was visually verified at 1280 px, in addition to the mobile check.
- A Windows DPAPI-encrypted recovery copy of production secrets is held locally in ignored `server/.wrangler/production-secrets.dpapi`; it is tied to this Windows user/machine. The temporary plaintext upload file was removed. Preserve the encrypted backup and arrange a secure portable backup before replacing the machine; no credentials are committed.

## Frontend release verification

- Implementation commit `10bf933` published through the existing main-branch Pages integration, deployment `c681f532-bb26-4d30-9ef5-a190c55f7ff7`.
- Real production browser signup completed, followed by a winning round, the "100 points saved" confirmation, and a persisted Hall of Fame score after reload. Logout and subsequent login also worked.
- Both disposable release-test accounts and their scores were removed by exact account ID after verification.
- The initial `_redirects` rule did not match domains and was removed. Cloudflare Bulk Redirect list `hangman_canonical` (`e93ee98a0589423e8d81d62881ded5ea`) and enabled rule `207bf44a68fe4e84b1514c04bd11c72d` now perform the canonical redirect, including deployment subdomains. `/signup?check=release` on the Pages hostname returns HTTP 301 to the same path and query on the custom domain.
- Nested application routes serve the frontend while `/user/*` serves API JSON. Desktop and mobile layouts were checked; slow physical-phone stretching responsiveness remains unmeasured. Local duration is not a substitute for phone measurements.

In this original production release, scores are cumulative and client-authoritative. No password recovery UI, legacy-account migration, or Illucia gameplay is included.

## Privacy: account deletion (local verification, 2026-10-01)

- Added password-confirmed account deletion, atomic account-linked erasure and a UUID/time recovery tombstone. Existing UUID identities already prevent rowid reuse; no identity migration was needed.
- Restored suites: 19 Worker/D1 tests, 47 React tests and 42 client logic tests pass. Type checking and both production builds pass.
- Eleven deliberate mutations failed the relevant assertions: password bypass, cross-account erasure, omitted tombstone, stale-session acceptance, reused identity, missing auth limit, incomplete deletion batch, guest form access, enabled pending submission, missing sign-out and missing expired-session handling. All mutations were restored.
- Manual localhost browser checks at 1280 px and 390 px: signed-in Account navigation, permanent-deletion warning, incorrect password retaining the account, correct password deleting it and signed-out confirmation. Pending and duplicate submissions are covered by deterministic UI tests.
- This record is local evidence only. Production migration, deployment and disposable-account verification remain pending. Hourly retention and invocation-log configuration are the next separate commit.

## Privacy: retention (local verification, 2026-10-01)

- Hourly, indexed cleanup: 100 oldest eligible rows per category; claimed rounds 24 hours after claim, unclaimed rounds 24 hours after expiry, tombstones older than seven days. Request-driven global cleanup is removed. Account rows and score totals are untouched.
- Invocation logs disabled; minimal application errors retained. README records temporary debugging and recovery procedures, Free limits and possible cleanup delays.
- Five additional D1 tests cover both clocks and boundary controls, tombstone expiry, bounded oldest-first backlog draining, actual query plans and sanitized failure propagation. Five mutations (wrong clock, wrong tombstone cutoff, exceeded bound, missing index and swallowed failure) each failed, then were restored.
- No production migration or deployment is implied by this local record.
- Restored verification: 24 Worker/D1 tests pass; TypeScript, Worker dry-run and frontend production builds pass. Desktop (1280 px) and 390 px browser checks confirm the signed-out account gate still renders correctly.

## Privacy: production state (recorded 2026-10-02)

The two local records above were deployed on 2026-10-01 without a release entry. This entry records what read-only checks on 2026-10-02 found; it adds no new verification of the features themselves.

- Remote D1 `d1_migrations` lists `0003_deleted_accounts.sql` and `0005_retention_indexes.sql` as applied at 2026-10-01 18:07:44 UTC, and `wrangler d1 migrations list DB --remote` reports nothing pending, so all of 0001–0005 are applied.
- `wrangler deployments list` shows Worker version `d2999968-db0e-4516-b0e8-ba27bc8d3765` deployed at 18:07:57 UTC and serving 100%. It followed `46a25777` (the five-second floor).
- An unauthenticated `GET /user/delete-account` on the production domain returns 401, not 404, so the deployed Worker has the deletion route.
- Not recorded: which commit was deployed, a production disposable-account deletion check, a successful scheduled retention run, or deployed CPU for these routes.

## Illucia points, C1 (production, 2026-10-02)

Implementation `0c538be`, `c363ac1`, `fdffece` and `be62b76`, with the `/privacy` disclosure `9deeced`, all pushed to `main`; design in `docs/SCORING.md`.

- Before release, on the tree at `9deeced` (after Track A's A1 landed; A1 left word files 4–15 unchanged): 56 Worker/D1 tests, TypeScript check and dry-run build pass; client 50 Node and 57 UI tests pass.
- Migration `0006_illucia_rounds.sql` applied remotely at 09:37:38 UTC; it was the only pending migration. Production `sqlite_master` lists `illucia_players`, `illucia_rounds`, `illucia_beaten_words` and the four `illucia_rounds` indexes.
- Worker version `d6721260-e98a-4fd1-bdc4-db0fab3a5622` deployed at 09:37:59 UTC and serving 100%, replacing `d2999968`. Upload 1,818.55 KiB, 586.96 KiB gzipped (the bundled word files); Wrangler reported a startup time of 3 ms. Route `hangman.spyrostrimis.com/user/*` and the hourly cron are unchanged.
- Unauthenticated production checks: `POST /user/illucia/start` and `/user/illucia/claim` return 401 (the previous Worker had no such routes and returned 404); a foreign Origin gets 403; an unknown path outside `/user/illucia/` still returns 404; Hangman's `round/start` returns 401 without a session; `get-best-scores` and `/privacy` return 200.
- **Not verified in production:** an authenticated start, claim, too-early claim, already-won word or ladder run, and deployed CPU for the new routes. Disposable-account checks were not run in this release; the local suite covers that behaviour. The first real check comes with E3 or an operator-run disposable account.
- Rollback: `wrangler rollback` to `d2999968`. Migration `0006` only adds tables, so it can stay in place.

## Illucia player memory, C2 (production, 2026-10-02)

Implementation `ee5d50b`, `6108bc2` and `139a21e`, with the `/privacy` disclosure `281dad2` (browser-checked by Spyros), all pushed to `main`; design in `docs/SCORING.md` and `server/README.md`.

- Before release, on the tree at `281dad2`: 66 Worker/D1 tests, TypeScript check and dry-run build pass; client 50 Node and 57 UI tests pass.
- The first remote migration listing failed with Cloudflare error 7403 ("account is not valid or is not authorized") on the D1 query endpoint, while the deployment listing on the same credentials worked. A read-only retry succeeded and showed only `0007` pending; nothing was applied before that. Treated as transient.
- Migration `0007_illucia_memory.sql` applied remotely at 11:02:39 UTC. Production lists `illucia_player_words`, `illucia_tier_stats`, `word_counts` and `illucia_rounds.counted`. `illucia_players` had 0 rows, so the seed backfill had nothing to fill.
- Worker version `352bfbb2-f091-4137-93ae-ff9a23131d5f` deployed at 11:02:58 UTC and serving 100%, replacing `d6721260`. Upload 1,823.37 KiB, 588.14 KiB gzipped; startup time 3 ms. Route and hourly cron unchanged.
- Unauthenticated production checks: `GET /user/illucia/stats`, `POST /user/illucia/start` and `/user/illucia/claim` return 401; Hangman's `round/start` returns 401; an unknown path outside `/user/illucia/` returns 404; `get-best-scores` returns 200. The published frontend bundle contains the new `/privacy` copy. The stats route cannot be told apart from the previous Worker this way (`/user/illucia/*` was already behind authentication), so the deployment listing is the evidence of which code runs.
- **Not verified in production:** any authenticated Illucia flow (counting, memory, stats, or C1's claims), and CPU for these routes. As with C1, the local suite covers that behaviour.
- Rollback: `wrangler rollback` to `d6721260`. Migration `0007` only adds tables and columns that the C1 Worker ignores, so it can stay.

## Illucia multipliers and floor, C3 (production, 2026-10-02)

Implementation `d0dc2e1` (×1.5/×2 question multipliers, 15 s Illucia claim floor; cheater ceiling 1,300 points/minute), pushed to `main` after rebasing onto `36d7c35`; the 66 Worker/D1 tests passed again after the rebase.

- No migration: `wrangler d1 migrations list --remote` reported none pending.
- Worker version `b5095175-0422-4428-9f17-fe7723dba16f` deployed at 16:56:56 UTC and serving 100%, replacing `352bfbb2`. 588.14 KiB gzipped; startup 2 ms.
- Unauthenticated production checks: Illucia start, claim and stats return 401; Hangman `round/start` 401; an unknown path 404; `get-best-scores` 200.
- Not verified in production: the new floor and multipliers on an authenticated claim. Tickets issued under `352bfbb2` and claimed after this deploy are held to the 15 s floor.
- Rollback: `wrangler rollback` to `352bfbb2`.

## Illucia experimental AI questions, D2 (production, 2026-10-03)

Implementation `8ad1349` (shared prompt and validator) and `16b9be9` (`POST /user/illucia/ask`, migration `0008`), with the `/privacy` disclosure `86067bf` and docs `b57f5c8`. Pushed to `main` together with Track B's `85357c7`, `0bf81fa` and `4ed3ea2`, after the D2 commits were rebased onto them. Design and limits are in `server/README.md`; model choice is in `tools/ILLUCIA-AI-QUESTIONS.md`.

- Before release, on the combined tree at `b57f5c8`:
  - Worker: 79 Worker/D1 tests (13 new for D2), the TypeScript check and the dry-run build pass. Each D2 guard was seen failing a test when removed.
  - Client: 93 Node and 59 UI tests pass.
  - Tools: 249 tests pass.
  - The `/privacy` copy was checked in the built page.
- The published frontend bundle (`index-Dghh-KCB.js`) contained the new `/privacy` text about 45 s after the push, before the Worker deployed.
- Migration listing showed only `0008` pending. The first `migrations apply --remote` exited on a Windows libuv assertion before applying anything (the listing still showed `0008` pending). A non-interactive retry applied `0008_illucia_ai.sql` at 00:10:56 UTC. Production lists `ai_budget`, `illucia_ai_users`, `illucia_ai_users_day` and `illucia_rounds.ai_questions` and `ai_token`.
- Worker version `91f8b781-d3bc-409c-894b-72862bf171ca` deployed shortly after the migration and is serving 100%, replacing `b5095175`. The new bindings are `env.AI`, `AI_ENABLED` "true", `AI_DAILY_NEURONS` 2000, `AI_DAILY_REQUESTS` 60 and `AI_USER_DAILY_QUESTIONS` 10. Route and hourly cron are unchanged. Upload 1,840.88 KiB, 593.10 KiB gzipped.
- Unauthenticated production checks:
  - `POST /user/illucia/ask` returns 401 without a session and 403 from a foreign origin, and `GET` returns 401.
  - Illucia start and `/user/me` return 401.
  - `get-best-scores` returns 200 JSON (3 rows), and `/`, `/hangman`, `/illucia` and `/privacy` return 200.
  - `ai_budget` and `illucia_ai_users` are empty: no AI spend yet.
- **Not verified in production:** an authenticated question (a real Workers AI call through the binding, the binding's reply envelope, the limits, settling), and CPU for the route. No page calls the route yet (E5), so nothing spends until then. Account creation by the assistant on the public site is not allowed, so the first authenticated check is Spyros's, or E5's.
- Rollback: `wrangler rollback` to `b5095175`, or set `AI_ENABLED` to "false" and redeploy to switch the mode off. Migration `0008` only adds tables and columns that the earlier Worker ignores, so it can stay.


## Illucia stats: ladder and spent words (2026-10-03, recorded after the fact)

Implementation `3a69270` (`GET /user/illucia/stats` gains `ladder` and `spent`). No migration; production listed none pending.

- Worker version `5c259e32-e56e-49df-bb82-ea69e522406b` was deployed at 12:40 UTC by an interactive `wrangler deploy` from `server/` on the owner's machine, and is serving 100%, replacing `91f8b781`. It was not recorded at the time.
- Evidence that it is `3a69270`: its upload was 1,841.58 KiB / 593.23 KiB gzipped (local wrangler log), and a dry-run build of `483fbae` (no server changes since `3a69270`) gives exactly the same sizes; `91f8b781` was 1,840.88 / 593.10. Bindings and secrets are unchanged from `91f8b781`.
- Unauthenticated production checks: `GET /user/illucia/stats` returns 401 and `get-best-scores` returns 200. The new fields sit behind authentication, so they are not verified in production; the local suite covers them.
- Rollback: `wrangler rollback` to `91f8b781`.

## Illucia AI limits and model setting (production, 2026-10-03)

Prompted by players seeing "out of questions" all day. Production's `ai_budget` and `illucia_ai_users` showed one player at the per-player limit (10 questions, 377 neurons, all 10 requests completed): a limit, not a fault.

- `be8cdab` (pushed): the fallback line now says which limit stopped her helper (this round's two questions, today's questions, or the site's allowance), on both pages.
- `5fb110c`: `AI_USER_DAILY_QUESTIONS` 10 → 30. Worker `89fca551-b6ec-4923-aff0-4790389663c6` deployed, replacing `5c259e32`. Unauthenticated checks: `ask` 401 without a session, `get-best-scores` 200, both Illucia pages 200.
- `af37a12` (client, pushed first; frontend live with the new `/privacy` text before the Worker changed) and `befd4b8` (Worker): `AI_MODEL` chooses the model. Production is set to `gpt-oss-120b-medium` for the owner's live trial (40 s Worker timeout, 4,096 output tokens). The page now waits 45 s and names the model in her note. Worker `f38e8003-dd3f-4eb8-8ef6-a3b60c7bd702` deployed, replacing `89fca551`. Unauthenticated checks: `ask` 401, `get-best-scores` 200.
- **Not verified in production:** a real gpt-oss-120b question (latency, cost, binding envelope), and an authenticated limit message. At medium, each question reserves about 300 neurons until settled, so the 2,000-neuron daily budget may allow only about 7–15 questions site-wide.
- Rollback: set `AI_MODEL` to `llama-3.3-70b` and redeploy, or `wrangler rollback` to `89fca551` (the 45 s page timeout and model note work with either).


## Illucia AI model at low reasoning (production, 2026-10-04)

`78d9f03`: `AI_MODEL` `gpt-oss-120b-medium` → `gpt-oss-120b-low` (owner's choice; the model has no "off"). Worker `f003ec88-ba2c-484d-a935-c2c610fa750b` deployed, replacing `f38e8003`. 83 Worker/D1 tests and the type check passed. Unauthenticated check: `ask` 401. Not verified in production: a real question at low. Rollback: set `AI_MODEL` back and redeploy, or `wrangler rollback` to `f38e8003`.

## Illucia AI: Llama writes, Clef-flash sorts, broader wording (production, 2026-10-04)

- `21f63ad` (validator: "Can your word mean / be / refer to / describe / stand for / name …", grammar questions rejected), `e80f59d` (her note and `/privacy` for two models; pushed first, live with `index-VEtYctTa.js` before the Worker changed) and `dbde29c` (`AI_MODEL` `llama-3.3-70b-clef-flash`: Llama 3.3 70B writes the question, Clef-flash sorts the candidates).
- Before release: 88 Worker/D1 tests (5 new for the pipeline, each seen failing when its guard was removed), type check and dry-run build; client 115 Node and 101 UI tests and build; tools Clef and question tests. `/privacy` text checked in the built page.
- Worker `c94ae21e-284c-4fae-883b-ea084456a0ee` deployed, replacing `f003ec88`. Unauthenticated checks: `ask` 401, `get-best-scores` 200, `/illucia`, `/illucia-observatory` and `/privacy` 200.
- **Not verified in production:** a real question through both models (binding envelopes, latency, cost). Expected about 100 neurons a question; the 2,000-neuron daily budget then allows roughly 15–20 site-wide.
- Rollback: set `AI_MODEL` to `llama-3.3-70b` (Llama alone) and redeploy, or `wrangler rollback` to `f003ec88`.

## Illucia AI question log, no caps (production, 2026-10-04)

- `c7bd545` (both pages send `guesses` and log answers; `/privacy` discloses the log; pushed first, live with `index-DhX0dpZn.js` before the Worker changed), `346bd63` (migration `0009` `illucia_ai_log`, `/user/illucia/ai-answer`, caps settable to `none`) and `08f3011` (`tools/read-illucia-ai-log.js`).
- Before release: 95 Worker/D1 tests (7 new for the log and caps, each guard seen failing when removed), type check and dry-run build; client 115 Node and 101 UI tests and build; tools 259 tests. `/privacy` text checked in the built page.
- Migration `0009_illucia_ai_log.sql` applied remotely (non-interactive); production lists `illucia_ai_log` and its two indexes, with 0 rows.
- Worker `1893d89e-076c-4410-976a-5f50396bcc7e` deployed, replacing `c94ae21e`: `AI_MODEL` `llama-3.3-70b-clef-flash`; `AI_DAILY_NEURONS`, `AI_DAILY_REQUESTS` and `AI_USER_DAILY_QUESTIONS` `none`. Unauthenticated checks: `ask` and `ai-answer` 401, `get-best-scores` 200, both Illucia pages and `/privacy` 200. The log reader ran against production (0 rows).
- **Not verified in production:** a logged question and answer from a real signed-in round.
- Rollback: `wrangler rollback` to `c94ae21e` (the log table can stay; that Worker ignores it), or restore numeric caps in `wrangler.jsonc` and redeploy.

## Illucia AI fixes from the first live log (production, 2026-10-05)

- `6f8dbc6` (pages: AI only over ≤40 candidates, `unsure` words on neither side; pushed first, live as `index-DrJazoKa.js` before the Worker changed) and `809ba26` (Worker: Llama told this round's earlier questions and repeats rejected, Clef's unsure words (0.4–0.6) on neither side, each side ≥10%, at most 40 candidates). Prompted by the 86-row log of 2026-10-04 (owner's choices).
- Before release: 97 Worker/D1 tests (each new rule seen failing when removed), type check; client 117 Node and 101 UI tests and build; tools 262 tests.
- Worker `e159ac58-d36a-4054-a9a1-53fb220bd7ad` deployed, replacing `1893d89e`. Unauthenticated checks: `ask` and `ai-answer` 401, `get-best-scores` 200, both Illucia pages 200.
- Not verified in production: an authenticated question under the new rules.
- Rollback: `wrangler rollback` to `1893d89e`; the page accepts replies with or without `unsure`.

## Illucia AI: Gemma 4 writes, Clef-flash sorts (production, 2026-10-10)

- `b236bbb`: `AI_MODEL` `gemma-4-clef-flash` (Gemma 4 26B A4B, reasoning off, 10 s timeout; Clef-flash sorting unchanged), and Clef-flash costed at its real price (3,455 neurons per M input tokens since Cloudflare's 2026-10-09 cut; it had been costed at Clef's 21,818).
- Before release: 98 Worker/D1 tests (the new one seen failing with Gemma's reasoning on), type check, dry-run build.
- Worker `77f9fc97-ad49-420c-bd13-593d62b20f3d` deployed, replacing `e159ac58`. Unauthenticated checks: `ask` 401, `get-best-scores` 200.
- Not verified in production: a real Gemma question through the binding (envelope, latency).
- Rollback: set `AI_MODEL` back to `llama-3.3-70b-clef-flash` and redeploy, or `wrangler rollback` to `e159ac58` (that version still has the old Clef-flash rate).

