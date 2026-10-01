# I7a follow-up: dictionary-assisted letter choices

Development experiment authorized 2026-09-30. This follows the [original pilot](ILLUCIA-MODELS.md), with no production changes. The question is whether accurate candidate words help a model make useful decisions, without giving it letter scores or a recommended move.

## Frozen comparison

- Model: `@cf/meta/llama-3.1-8b-instruct-fp8-fast`, the same public model ID as the original 8B pilot. The provider's returned backend ID is recorded per request when available; hosted weights/backend settings are not pinned.
- Ten common five-letter words: DOUBT (the user's known development example), plus nine words sampled without replacement from ESDB size 35 using seed `20260930`. This is a smoke test, not a held-out evaluation or estimate of general win rate.
- Both contestants start blank on the same ten words, with the same game rules, one corrective retry, ten-second timeout, and explicitly recorded fallback moves. Each contestant has its own round.
- `board-explained`: public board, no dictionary. Returns JSON containing a short reason and a letter.
- `dictionary-explained`: same response contract and 160-token output ceiling, plus the **complete** alphabetically ordered Master dictionary filtered against that contestant's public state. It starts with 8,522 five-letter candidates. It receives no letter frequencies or solver recommendation.
- The pure local Master count baseline uses the same complete dictionary. All answers belong to the dictionary and all matching candidates are supplied; no secret-dependent shortlisting or sample truncation occurs.

The JSON format is strict: exactly `reason` (up to 240 characters) and `letter` (one unused ASCII letter). Extra fields, prose, code fences, repeated guesses and malformed JSON count as invalid replies. After two invalid replies, the model-controlled lane forfeits; a hybrid continuation gets one local solver move and then asks the model again. The JSON report retains the historical field name `modelOnly`, which here means **no fallback letter choices**, not an unaided model. Dictionary assistance is always present in the dictionary condition. Its `withFallback` result is a separately labelled hybrid result.

## Information boundary

The candidate builder accepts only `toPublicState(round)` and public dictionary knowledge. Tests show that two different private answers with the same public board produce identical request bodies. Exact-position filtering excludes additional occurrences of already-guessed letters.

The answer is not read or tagged by this builder, but **the list contains the answer and can uniquely identify it**. This is intentionally dictionary-assisted local research using static vocabulary words; the live pages give the solver the board only. A player-facing version would need a design decision and the project's own authenticated Worker. Nothing on the live site changes here.

## Reproduce

From `tools/`, use the existing Workers Free account and Wrangler login:

```powershell
$env:CLOUDFLARE_ACCOUNT_ID = '<your account ID>'
node benchmark-illucia-models.js --live --free-plan --wrangler-auth --models '@cf/meta/llama-3.1-8b-instruct-fp8-fast' --sample five-letter-development --mode dictionary-explained --output benchmarks/illucia-i7a-dictionary.json
node benchmark-illucia-models.js --live --free-plan --wrangler-auth --models '@cf/meta/llama-3.1-8b-instruct-fp8-fast' --sample five-letter-development --mode board-explained --output benchmarks/illucia-i7a-board-explained.json
```

Run serially; the two modes share the original local daily budget and lock. New experiments require an explicit output path so they cannot accidentally overwrite the original pilot. Use new filenames when retaining previous results. Credentials remain in memory. Remove `--live`, `--free-plan`, `--wrangler-auth` and `--models ...` to generate only the corresponding offline sample/baseline.

The dictionary is never silently truncated: inputs above the experimental 100,000-character candidate-list limit fail instead. Large dictionaries consume substantially more input tokens than the original board-only prompt. Usage and latency include retries and hybrid continuation, and the daily ledger also includes diagnostic calls.

## Transport correction

The first attempt was stopped because Cloudflare returned generated JSON as an object in `result.response`, whereas the original adapter expected a string. Original text was available at `result.choices[0].message.content`. This caused false invalid-reply classifications and solver fallback. That attempt is preserved as [invalid transport diagnostic](benchmarks/illucia-i7a-dictionary-transport-diagnostic.json) and **excluded from gameplay conclusions**. The original 2026-09-29 pilot contained recorded string replies and is not affected by this particular parsing bug.

The adapter now accepts either a text `response` or the original text in the `choices` envelope. Unknown envelopes stop the run rather than silently converting the contestant into the solver. A regression test covers the provider's parsed-JSON shape. The corrected run restarted every board from blank.

## Results

Completed 2026-09-30. Reports: [corrected dictionary run](benchmarks/illucia-i7a-dictionary.json) and [board-only explanation control](benchmarks/illucia-i7a-board-explained.json). Both use sample hash `815efc8783351f3934b0d46e3993c37392663cc5f95efe1a4be2c51ef14a76e2`. The provider identified its backend as `@cf/meta/llama-3.1-8b-fast-v2`.

| Contestant | Wins without fallback letter choices | Wins including fallback | Games needing fallback | Fallback moves |
| --- | ---: | ---: | ---: | ---: |
| Local Master count solver | 8/10 | — | 0 | 0 |
| Llama 8B, board + short explanation | 0/10 | 1/10 | 2/10 | 3 |
| Llama 8B, full candidate list + short explanation | 0/10 | 5/10 | 10/10 | 29 |

The candidate list produced more wins **in hybrid continuation**, but every dictionary game first forfeited the model-controlled lane through two invalid/repeated replies. The dictionary condition had 62 repeated and 4 malformed replies out of 124 requests; the board-only control had 16 repeated and 10 malformed replies out of 98 requests. This is not evidence of a 50% independent-model win rate.

DOUBT illustrates both the help and the remaining problem. The dictionary contestant solved it with five misses after its first fallback on turn seven. Once the candidate list contained only `doubt`, it still repeated B and then chose F on a corrective retry. Seeing the correct possibility did not guarantee a legal or useful next choice. The board-only control lost DOUBT.

| Measurement | Board-only control | Dictionary-assisted |
| --- | ---: | ---: |
| Requests (including retries) | 98 | 124 |
| Request latency p50 / p95 | 344 / 931 ms | 379 / 1,013 ms |
| Token-derived estimated neurons | 212.55 | 2,320.26 |
| Sum of provider-reported neurons | 212.54 | 2,320.03 |
| Average estimated neurons / game | 21.25 | 232.03 |

The corrected comparison used about **2,533 estimated neurons**; the daily ledger additionally includes the discarded transport run, its interrupted request reservation, and one diagnostic probe. These costs include hybrid continuations. The full dictionary cost about eleven times as much as the board-only control on this sample. No paid model or plan change was used.

All **199 tooling tests passed**. Independent replay of all 20 corrected games checked the exact outgoing request hashes, complete candidate counts, JSON reply classifications, retry bounds, solver fallback choices, legal guesses, terminal outcomes, sample equality and aggregate summaries. The original pilot JSON files were preserved.

**Interpretation:** candidate assistance helped this particular hybrid complete more development games, but this Llama 8B setup still cannot reliably control an entire game. This does not establish how other models, candidate ordering, or constrained output decoding would perform. A production I7b decision remains open; the current implementation is a research tool, not a ready opponent. A larger validation sample would only be justified after a revised contestant passes basic legal-move checks on development boards.
