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
