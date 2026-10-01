# I7a — model-versus-solver pilot

I7a is a local experiment, not a production game mode. I5 is an idea, not a commitment; I6 was built and reverted. I7b needs a separate decision after reviewing these results.

Follow-up: [dictionary-assisted development experiment](ILLUCIA-DICTIONARY.md), authorized 2026-09-30. The method and recorded results below describe the original direct-letter pilot; its JSON evidence is preserved unchanged.

## Method

`benchmark-illucia-models.js` uses the existing Hangman rules, `toPublicState`, and Master count solver. The fixed pilot contains 50 accepted words, seed `20260929`, sampled without replacement across 3–15 letters and the common (35), medium (40–50), and rare (55–70) vocabulary bands. Shuffled strata are visited round-robin, giving every length × band at least one word before adding second examples. This deliberately broad pilot is **not population-weighted**; individual length/band cells are too small for reliable rankings.

Every contestant starts its own blank board with six misses. The local runner holds and adjudicates the answer. Requests contain only length, revealed pattern, guessed/missed/available letters, and remaining misses. There are no candidate words, vocabulary bands, answers, player input, usernames, or prior model replies in the prompt. Solved/failed boards are never sent. REST calls are confined to this local research tool. A player-facing version would go through the project's own authenticated Worker and stay within the $0 free allowance (CONSTRAINTS in `CLAUDE.md`).

Models (free-eligible as checked 2026-09-29):

- `@cf/meta/llama-3.2-3b-instruct`
- `@cf/meta/llama-3.1-8b-instruct-fp8-fast`

Both use the same versioned prompt, temperature 0, seed `20260929`, a four-token output ceiling and a ten-second request timeout. Responses must be one unused ASCII letter (case and surrounding whitespace are normalized). A repeated or malformed response gets **one** corrective retry. No JSON extraction, letter scraping, or silent interpretation of explanations.

This tests direct letter selection, with no reasoning-output budget or dictionary supplied to the models. It does not establish the strength of all language models or alternative prompts. The models have no Apprentice/Scholar/Master labels: their training vocabulary cannot be restricted to our dictionary tiers. Any later prompt tuning should use this pilot as development data and reserve a disjoint sample for evaluation.

If both attempts fail, the model-only contestant forfeits. The game continues with one explicitly marked Master solver move, then asks the model again. This continuation measures **model plus fallback**. Every later win belongs only to that assisted result. Model-only wins can include a successful corrective retry, but never a solver intervention. Assisted games are not separate independent model trials; they share the model-only prefix. Report misses/turns describe completed continuations; inspect `firstIntervention` to see where pure play ended.

HTTP errors, provider errors, timeouts, UTC rollover, and local budget exhaustion stop the experiment. An unfinished board is reported as incomplete and excluded from completed-game win rates. Each model has a matched local baseline using only its completed words, so early stopping does not compare a partial model run to all 50 solver games. Checkpoints preserve completed games; interrupted runs are not automatically resumed or retried.

The sample and vocabulary manifest hashes, exact prompt, model settings, per-game moves, bounded raw replies, token usage, retries, and response times are in the JSON report. Token-derived neuron estimates use published per-model rates; they are not measured billing totals. A missing usage record is **unknown**, not zero, and suppresses the per-game usage estimate. Hosted model updates and inference infrastructure mean repeated live runs need not be deterministic despite fixed inputs.

## Run

From `tools/`, the default is entirely offline:

```powershell
npm run benchmark:illucia-models
```

This writes `benchmarks/illucia-i7a-baseline.json`. The 50-word sample is the same as the live pilot.

For a live run on an existing **Workers Free** account:

```powershell
$env:CLOUDFLARE_ACCOUNT_ID = '<your account ID>'
node benchmark-illucia-models.js --live --free-plan --wrangler-auth --output benchmarks/illucia-i7a.json
```

`--wrangler-auth` captures the existing server installation's `wrangler auth token --json` output in memory; it never prints or persists the credential. Alternatively, omit that flag and load `CLOUDFLARE_API_TOKEN` through the ignored `tools/.env` using Node's `--env-file=.env` option. Do not paste tokens into commands or commit them. No dependency installation or deployment is required.

Options: `--count 50`, `--seed 20260929`, `--models <comma-separated allowlisted model IDs>`, and `--output <path>`. Unknown models are rejected. A live run requires an explicit output path and `--free-plan`; that flag declares the operator has verified the account is on Workers Free. The tool does not upgrade plans, enable paid models, or route through an AI Gateway. Do not use the flag on a paid account.

Live runs share a dated, ignored ledger under `tools/output/`. The ceiling is **1,800 requests and 6,000 reserved/estimated neurons per UTC day across local I7a runs**. Before dispatch the runner persists a conservative input-byte-plus-template reservation; known token usage replaces it afterwards, while failed or unknown-usage requests retain it. This estimate is not a universal tokenization guarantee: if reported usage exceeds its reservation, the run stops. Cloudflare's Workers Free allowance remains the account-wide $0 backstop; other tools' usage is outside this local ledger. The pricing page currently documents 10,000 free neurons/day and errors when the free allowance is exhausted.

The exclusive `tools/output/illucia-i7a.lock` prevents concurrent local runs. After a crash, verify no benchmark process is running before removing only that lock. Keep the daily budget file. Each run starts a fresh comparison and spends additional allowance; use a new output filename to preserve previous evidence. Exit code 2 means a checkpointed stop, and 1 means setup/internal failure.

## Verification

`npm test` includes public-state projection, no terminal-board requests, independent starts, sixth-miss termination, repeated/invalid output, bounded retries, truthful fallback reporting, timeout/quota interruption, deterministic stratification, request reservations, UTC rollover, and transport sanitization. No UI or deployed API code is changed.

## Sources

- [Workers AI pricing, free allowance and neuron rates](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- [Workers AI REST interface](https://developers.cloudflare.com/workers-ai/get-started/rest-api/)
- [Llama 3.2 3B parameters and output usage](https://developers.cloudflare.com/workers-ai/models/llama-3.2-3b-instruct/)

## Recorded result

Completed 2026-09-29 in 353 seconds. All 100 model games completed; no transport, timeout, quota, or local-budget stops. Reports: [live pilot](benchmarks/illucia-i7a.json) and [offline baseline](benchmarks/illucia-i7a-baseline.json).

| Contestant | Unassisted wins | Wins including fallback | Games needing solver help | Repeated replies / requests | Request latency p50 / p95 | Estimated neurons / game |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Local Master count solver | 43/50 (86%) | — | 0 | — | local; timings in baseline | 0 |
| Llama 3.2 3B | 0/50 | 0/50 | 7/50 | 120/542 | 293 / 745 ms | 8.17 |
| Llama 3.1 8B FP8 fast | 0/50 | 1/50 | 22/50 | 182/591 | 267 / 380 ms | 8.10 |

The only assisted win was `ferris`, by the 8B contestant with five misses and its first solver intervention on turn six. The 3B model needed 10 fallback moves in total; the 8B needed 36. All model responses were single-letter format: reliability failures were **already-guessed letters**, not malformed output. Successful retries are included in the unassisted result, so even one permitted retry per turn did not produce a model-only win.

By rarity, the local solver won 14/17 common, 14/17 medium, and 15/16 rare words. Both models had zero unassisted wins in every band and length. Average completed-continuation misses/turns were 6.00/8.64 (3B) and 5.98/8.90 (8B). These averages include fallback after a forfeit; they are not pure-model efficiency scores.

All **1,133 requests** included token usage. The estimated total is **813.67 neurons** (408.44 for 3B, 405.23 for 8B), about 8.1% of the documented 10,000-neuron daily free allocation. This excludes any other account usage and is calculated from returned tokens, not independently retrieved billing data. Latencies include the runner's budget persistence and HTTP round trip; requests were serial and contestants interleaved by word.

Verification: all 193 tooling tests and 37 client unit tests passed. A separate replay of all 100 recorded games verified each response classification, bounded retry, fallback choice, legal move, terminal outcome, aggregate summary, sample hash, and request count against the shared engine. No production deployment was made.

**Decision supported by this pilot:** keep the local solver and defer I7b with these model/prompt settings. They do not yet provide a competitive or reliable second contestant. This is a negative result for this direct-letter experiment, not a claim that every model or prompting approach is incapable of Hangman. If revisited, test a revised prompt or another free-eligible model on development words first, then evaluate on a disjoint held-out sample before building the race UI.
