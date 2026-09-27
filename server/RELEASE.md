# Account release record

Updated 2026-09-27. Implementation and local verification are complete. The account API is deployed and verified; frontend publication is the remaining release step.

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

Still to verify: the published frontend, browser behavior against production, canonical Pages redirect, and stretching responsiveness on a slow physical phone. Local duration is not a substitute for phone measurements.

Scores are cumulative and client-authoritative by design. No password recovery UI, legacy-account migration, or Illucia gameplay is included.
