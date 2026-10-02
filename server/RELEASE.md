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
