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
| GET | `/user/get-best-scores` | Top 100 `{username, score}` rows, descending score then ascending user ID |
| POST | `/user/round/start` | Authenticate; `{}` resumes or creates a round; optional `{previousRoundId}` replaces that owned, unclaimed round; returns `{roundId, word, issuedAt, expiresAt, serverNow}` |
| POST | `/user/round/claim` | Authenticate; `{roundId, guesses}` validates a winning sequence and awards once; returns `{score}` on success or a successful retry |

Mutations require JSON and an exact trusted Origin. All responses are `no-store`; request bodies are capped at 2 KiB. Native rate-limit bindings allow 60 requests/IP/minute and 10 signup/login attempts/normalized username/minute. These are approximate, per Cloudflare location, not a global anti-abuse guarantee; shared networks can hit the IP limit. No raw request bodies or exception messages are logged.

The round-ticket API replaces `/user/add100` entirely. A server-selected word comes directly from `tools/words.locked.json`; the Worker and browser use `shared/hangman-core.js`. The database enforces one outstanding round per account and at most one award per round, with consumption and increment in one atomic batch. Claims require unique lowercase a–z guesses ending exactly at a win before six misses. Unclaimed rounds expire after 30 minutes; successful claims can be retried until cleanup, at least 24 hours after their original expiry. The five-second-floor update requires a ticket age of at least 5,000 ms. Early claims return HTTP 409 with `code: "ROUND_TOO_EARLY"` and `retryAfterMs`, without consumption or points. The client holds early wins behind “Saving…” and silently waits/retries an early response. One outstanding round and an issuance timestamp no earlier than the last award enforce at most 12 awards per minute per account. There is no daily cap. The timing API is deployed; the matching frontend is included in this release.

Public answers still permit manufactured wins and bots; neither authentication nor replay validation proves human play. Existing approximate IP limits remain. Starts resume the outstanding round across tabs; explicitly replacing it invalidates it in other tabs. API start failures fall back to visibly unranked local play. Uncertain claim failures offer a manual retry using the same ticket. Guests and Illucia do not earn points. Existing score totals are preserved, including earlier unverified awards. See [scoring design, threat model and release steps](../docs/SCORING.md).

Logout clears the browser cookie; a copied JWT remains valid until expiry. There is no password reset, email recovery, password change, or immediate session revocation UI in this release.

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
