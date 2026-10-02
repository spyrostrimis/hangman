# D1: AI meaning questions (offline model test)

Track D, step D1 of the Illucia v2 decisions (§5.5, both Amendments). It is a local
experiment: no UI, no Worker route, nothing on the live site changes. It reuses the I7a
runner's live session ([ILLUCIA-MODELS.md](ILLUCIA-MODELS.md)): credentials held in memory,
the exclusive lock and the dated daily ledger in ignored `tools/output/`.

The question for experimental mode: given Illucia's candidates (only when there are 80 or
fewer), can a free-allowance Workers AI model (1) invent one yes/no question about meaning,
not letters, and (2) sort every candidate into YES or NO, well enough for code to check it
and use it?

**Short answer:** sometimes. The best model, Gemma 4 26B A4B with reasoning switched off,
produced a usable question (valid lists, 25–75% split) for 10 of 21 boards. It was back
within 8 seconds on all 10, and within 3 seconds on 8. Its sorts under a given WordNet
question were valid every time and agreed with WordNet on 90% of the words. With reasoning
on (the models' default), no model was usable: invents took 15–30+ seconds or never
finished. Run on a different word sample, the result could differ.

## Method

**States.** `benchmarks/illucia-d1-states.json`, 21 frozen game states: lengths 4–10 × the
three tiers. The words come from the tier benchmark's sample (`tierSamples`, seed
20260928). Apprentice states use common words, Scholar's alternate common and medium, and
Master's rotate common, medium and rare. Each word is played by her committed v2 temperament
(round seed 20261002 + state index), and the state is the first board whose tier-vocabulary
candidates number 8–80. Every state has a different word. Candidates: 8–77, mean 29.1.
Each state also records the B1 WordNet label of every candidate. A test checks that each
frozen state is a real board (candidates, answer, labels, control question) without
rebuilding it, so a Track A change can't silently change the evidence.

**What a model sees.** Only `{"count": N, "candidates": [...]}`, sorted. It never sees the
board, the answer or a player. A test shows that two different answers with the same
candidates send byte-identical requests. The answer is among the candidates, as it is in
the game.

**Two tasks per state and model.**

- *Invent*: the model invents a question starting "Can your word mean" and sorts every
  candidate. This is experimental mode's task.
- *Sort* (control): code gives the question: the noun category whose labelled YES share is
  closest to half (v1 asks nouns only). If no noun category reaches 10–90%, the closest
  category of any kind is used (three states: a verb twice, the adjective once), because a
  question every word fails tests nothing. Every sort can be scored against WordNet.

The prompts are in `lib/illucia-question-model.js` (version `d1-1`) and in each report.
Settings: temperature 0, seed 20261002, no JSON mode, no retry (production falls back on
any failure), a 30-second timeout. Three timeouts in a row for a model in one mode skip its
remaining states in that mode.

**Models** (free allowance; neuron rates checked 2026-10-02):

| Model | Neurons per M input / output tokens | Setting in the scored run |
|---|---:|---|
| `@cf/qwen/qwen3-30b-a3b-fp8` | 4,625 / 30,475 | reasoning off |
| `@cf/google/gemma-4-26b-a4b-it` | 9,091 / 27,273 | reasoning off |
| `@cf/zai-org/glm-4.7-flash` | 5,500 / 36,400 | reasoning off |
| `@cf/openai/gpt-oss-20b` | 18,182 / 27,273 | `reasoning_effort: "low"`, its lowest |
| `@cf/meta/llama-3.1-8b-instruct-fp8-fast` | 4,119 / 34,868 | no reasoning; the control |

"Reasoning off" is `chat_template_kwargs: { enable_thinking: false }`, the switch Workers AI
documents in its per-model schemas. A probe confirmed that it removed all hidden reasoning
for the three models (`benchmarks/illucia-d1-probe-switch.json`). gpt-oss-20b has no off
switch.

**Validation (code).** Each reply ends in exactly one outcome, checked in this order:
*unparseable* (no JSON object, even inside a fence or prose: "JSON-ish"), *wrong-shape*,
*rejected-question* (not "Can your word mean …?", over 120 characters, non-ASCII, talk of
letters, spelling, vowels, plurals, rhymes or syllables, or a blocked LDNOOBW or project
term), *wrong-lists* (a candidate missing, a word not in the candidates, or one repeated),
*uneven* (YES outside 25–75% of the candidates), or *accepted*. Timeouts are counted
separately. Strict JSON (the whole reply parses) is reported on its own. In sort mode,
"uneven" reflects the question code chose rather than the model, so the measure that
matters there is valid lists.

**Scoring against WordNet.** Only candidates WordNet knows count (`-` = NO for every
category). For a sort the report gives:
- accuracy, pooled over states;
- the false YES rate (WordNet NO words the model put in YES);
- the false NO rate (WordNet YES words the model put in NO);
- whether the round's real word landed on its WordNet side, where WordNet knows that word.

The real word on the wrong side is the failure that matters in play: her filter would throw
the player's word away. Sorts are scored whenever the lists are valid, even if the split is
uneven.

Invented questions are scored only through a reviewed mapping,
`benchmarks/illucia-d1-mapping.json`. Each distinct question is judged equivalent to one
B1 category or a union of them, or to none. Only exact equivalents are scored. Close but
wider or narrower questions ("a living thing", "a type of food") are not scored, and their
notes say why. Claude made these judgments after the run and before computing accuracy,
for Spyros to review: 12 of 80 distinct questions map.

WordNet is an imperfect key. It counts every sense (`blue` is an insect, `dies` and `toes`
are man-made objects), while models and players think of the usual meaning. Every
disagreement is listed per state in the report.

**Latency and cost.** Latency is the request round trip, serial. It is reported as p50,
p95 and maximum. Two shares are scored: replies accepted within **3 s**, and within a
relaxed **8 s** for experimental mode, where Illucia can visibly "consult the archive" for
a few seconds once or twice a round. Neurons are estimated from returned tokens at the
published rates, and Cloudflare's own `usage.neurons` is kept; the two agree to within 0.01
on every request. Hidden reasoning is the completion tokens beyond the visible reply (about
3 characters a token), since no model reported a reasoning-token count.

## Results: reasoning off (`benchmarks/illucia-d1.json`)

Completed 2026-10-02: 210 requests (21 states × 2 modes × 5 models), one timeout, no stop.

**Invent: experimental mode's task**

| Model | Accepted | Accepted ≤3 s | Accepted ≤8 s | Valid lists | Strict JSON | p50 / p95 / max | Neurons / request |
|---|---:|---:|---:|---:|---:|---:|---:|
| Gemma 4 26B A4B | **10/21** | 8/21 | **10/21** | 18/21 | 21/21 | 2.7 / 7.9 / 10.2 s | 6.8 |
| gpt-oss-20b (low) | 9/21 | 2/21 | 7/21 | 10/21 | 14/21 | 10.2 / 21.6 / 29.2 s | 41.5 |
| Llama 3.1 8B (control) | 9/21 | 9/21 | 9/21 | 12/21 | 19/21 | 1.1 / 14.4 / 16.9 s | 11.6 |
| Qwen3 30B A3B | 5/21 | 5/21 | 5/21 | 13/21 | 21/21 | 1.0 / 2.1 / 2.1 s | 5.0 |
| GLM-4.7 Flash | 4/21 | 3/21 | 4/21 | 13/21 | 21/21 | 4.2 / 7.2 / 26.2 s | 7.1 |

Why the rest failed:
- **Gemma:** 8 uneven and 3 wrong lists. Its questions were too narrow (mean YES share 26%).
- **gpt-oss:** 7 unparseable, all cut off at the 2,048-token ceiling by about 1,190 hidden
  tokens per request even at "low" (every one stopped with `length` at 2,048); 4 wrong lists, 1 uneven.
- **Llama:** 7 wrong lists, 3 uneven, 2 unparseable.
- **Qwen:** 8 wrong lists, 7 uneven, and 1 question rejected for asking about a plural.
- **GLM:** 9 uneven, 7 wrong lists, 1 wrong shape.

No question was rejected for letter talk or a blocked term, apart from Qwen's plural.

Only 9 invented sorts could be scored against WordNet (2 Qwen, 1 Gemma, 4 GLM, 2 Llama).
That is too few to rank invent accuracy, and the sort control below measures sorting
instead. Many accepted questions were vague and hard to check: "something related to food
or eating", "something related to a person's name", "a type of movement or sound that is
light and playful". The prompt asks for meaning questions, and these are meaning questions.
But a player and a model can honestly disagree on what is "related to" something.

**Sort: the WordNet control**

| Model | Valid lists | Agrees with WordNet | False YES | False NO | Real word on the wrong side | p50 / p95 | Neurons / request |
|---|---:|---:|---:|---:|---:|---:|---:|
| Gemma 4 26B A4B | **21/21** | **90.2%** (500 words) | 2.9% | 30.2% | **1/17** | 2.9 / 5.5 s | 5.9 |
| gpt-oss-20b (low) | 16/21 | 87.5% (297) | 1.8% | 45.2% | 3/14 | 3.2 / 9.7 s | 20.8 |
| GLM-4.7 Flash | 14/21 | 81.9% (237) | 16.3% | 23.7% | 2/11 | 2.7 / 8.9 s | 6.1 |
| Llama 3.1 8B (control) | 8/21 | 78.9% (76) | 20.0% | 23.8% | 2/7 | 0.9 / 1.8 s | 7.9 |
| Qwen3 30B A3B | 15/21 | 65.7% (230) | 42.0% | 10.7% | 3/12 | 0.9 / 2.4 s | 4.4 |

Accuracy is over each model's own valid sorts, so the word counts differ. Many of Gemma's
false NOs are WordNet's rare senses rather than plain mistakes: `dies`, `ties` and `toes`
count as man-made objects, and `relations` and `yearlings` as persons. Some are genuine
mistakes, though: `cues` is a man-made object. Gemma's one misfiled real word is `rues`,
which WordNet labels a man-made object; a player would answer NO, as Gemma did. gpt-oss
leans towards NO (45% false NO). Qwen leans towards YES (42% false YES), and Llama often
dropped or repeated words.

**Choice, by the rule fixed before the run.** The rule:
1. highest invent accepted rate;
2. then, among models within 10 points of it, the fewest real words on the wrong side;
3. p95 at most 8 s;
4. at most about 50 neurons a request.

Gemma (48%), gpt-oss (43%) and Llama (43%) qualify on rate. Gemma has the fewest misfiled
real words (1/17 against 3/14 and 2/7), a p95 of 7.9 s for invent and 5.5 s for sort, and
costs about 6–7 neurons a request. **The pick is `@cf/google/gemma-4-26b-a4b-it` with
reasoning off.** At the planned ~50 requests a day it would use about 350 neurons, 3.5% of
the 10,000 free allowance.

## Second round: four bigger or reasoning models

Requested 2026-10-02 after round one, run the same day: Llama 3.3 70B, gpt-oss-120b and
Qwen3.8 27B (both at `reasoning_effort: "low"`, their lowest; Qwen3.8 has no off switch),
and DeepSeek R1 Distill Qwen 32B, which always reasons and has no control. The owner raised
the daily ledger ceiling to 9,000 neurons for it.

**States.** Five frozen states chosen for spread and cost: `4-apprentice`, `6-scholar`,
`8-master`, `9-scholar`, `10-apprentice`. They cover three tiers, five lengths, four
control categories (man-made object, person, place, adjective), and answers WordNet knows.
They also have the smallest lists (9–16 candidates), to keep R1 affordable, so they are
**easier than the full set**: Gemma scored 4/4 on them against 10/21 overall.

**Runs and stops.**
- **R1** (`illucia-d1-r1-invent.json`): invent only, a 3,000-neuron ceiling and a 120 s
  timeout. It spent 2,450 neurons on 4 requests. The ceiling, which now counts the next
  request's worst case (about 920 neurons for R1), refused the fifth.
- **The other three** (`illucia-d1-round2.json`): both tasks, interleaved by state, a
  2,600-neuron ceiling and a 60 s timeout. The ceiling stopped them after 21 requests: the
  `9-scholar` sorts and all of `10-apprentice` were not run. Qwen3.8 alone spent 2,028
  of the round's 2,487 neurons.

**Comparison on the four states every model ran** (round-one models' results restricted
to the same states):

| Model | Invent usable | Usable ≤3 s / ≤8 s | Invent p50 / max | Agrees with WordNet (both tasks) | Real word on the wrong side | Neurons / request |
|---|---:|---:|---:|---:|---:|---:|
| Gemma 4 26B A4B (round-one pick) | 4/4 | 3 / 4 | 1.9 / 7.9 s | 36/38 | 0/5 | ~4–5 |
| **Llama 3.3 70B** | 3/4 | 3 / 3 | 1.6 / 2.4 s | 38/40 | 0/6 | ~17–23 |
| Llama 3.1 8B | 4/4 | 4 / 4 | 0.7 / 0.8 s | 33/45 | 3/5 | ~3 |
| gpt-oss-120b (low) | 1/4 | 0 / 1 | 5.3 / 11.7 s | 15/15 | 0/2 | ~24–61 |
| Qwen3.8 27B (low) | 2/4 | 0 / 0 | 38.0 / 43.8 s | 23/25 | 0/4 | ~130–410 |
| DeepSeek R1 Distill 32B | 1/4 | 0 / 0 | 25.8 / 84.4 s | 5/5 | 0/1 | ~610 |

What happened to each new model:
- **Llama 3.3 70B** gave clean, even, checkable questions ("Can your word mean a person?",
  "… a place?"), every reply within 2.4 s. Its one failure was an uneven "a bird?" on
  9 words.
- **gpt-oss-120b** asked sensible questions but broke the required wording three times
  out of four ("Can your word be a proper name of a person?", "… refer to a mental health
  condition …"), so the validator rejected them.
- **Qwen3.8** answered correctly when it finished, but each reply took 10–44 s. Twice it
  hit the 2,048-token ceiling without answering, at about 608 neurons each.
- **R1** spent 773–2,048 tokens thinking per request. Two invents were cut off still
  thinking (67–84 s, about 920 neurons each). One produced JSON the validator could not
  parse, and one was usable after 17.8 s ("a place or country?", 7 of 15 YES).

**Result.** Qwen3.8 and R1 are out: too slow for the 8 s pause and 30–150 times Gemma's
cost per request. gpt-oss-120b's quality is promising, but it needs a wording fix and is
still too slow at its lowest effort. **Llama 3.3 70B is the only new contender.** On these
easier boards it matches Gemma's accuracy and is faster, at about 4× Gemma's cost
(~20 neurons, so ~1,000 a day at the planned 50 requests). Four boards cannot separate it
from Gemma. A full 21-state run of Llama 3.3 70B (about 1,000 neurons, next UTC day) would.

## Stopped run: reasoning on (`benchmarks/illucia-d1-reasoning-on.json`)

The first run used each model's default reasoning (gpt-oss-20b at "low"), a 4,096-token
ceiling and the same prompts. **It was stopped by hand after 13 requests**, because the
evidence was already clear and further requests were spending budget without adding
information:

- **Qwen3:** a 9-word invent took 15.0 s and 2,203 output tokens for a 152-character reply
  (68 neurons). A 36-word invent hit the 4,096-token ceiling after 25.6 s without
  replying (126 neurons).
- **Gemma and GLM:** both timed out at 30 s on both invents.
- **gpt-oss-20b:** 8.0 s and 785 tokens for the 9-word invent, then a timeout on the
  36-word one.
- **Sorts:** all four sorted the 9 words correctly, but took 1.3–15.5 s, with up to 873
  tokens.

A skip-rule bug made it worse: a fast sort between two invent timeouts reset the count, so
slow models were never skipped, and each timeout kept its full ledger reservation. Fixed in
`5e6792b` (counted per model and mode), with a test seen failing on the old code. The
report keeps all 13 requests unchanged; `status`, `stopReason` and an `operatorNote` were
added afterwards to say so. Probes for both settings are kept: `illucia-d1-probe-reasoning-on.json`
and `illucia-d1-probe.json`.

**Reasoning on is not viable for experimental mode** with these models: it is slow, often
never finishes, and costs more than 20 times as much per request (Qwen3: 126 neurons against about 5).

## Cost (UTC 2026-10-02, shared I7a/D1 ledger)

| Part | Requests | Measured neurons |
|---|---:|---:|
| Probe, reasoning on | 4 | 55.3 |
| Stopped run, reasoning on | 13 (5 timeouts) | 342.9 |
| Switch probe and one envelope diagnostic | 5 | 9.2 |
| Probe, reasoning off | 5 | 14.5 |
| Scored run, reasoning off | 210 (1 timeout) | 2,439.3 |
| **Total** | **237** | **2,861** |

The ledger counts 238 requests and 3,770 neurons. The difference is about 910 neurons still
reserved for the 7 requests whose usage is unknown: the 6 timeouts, and one request in flight
when the first run was stopped. Cloudflare may or may not bill those. Either way the day
stayed under the local 6,000 cap and the account's 10,000 free allowance. The scored run
stayed under its agreed 3,000-neuron ceiling (`--max-run-neurons`).

The second round then spent a further 4,937 measured neurons (R1 2,450, the other three
2,487). That brings the day to about 7,800 measured, and the ledger to 8,708 of the raised
9,000 cap.

## What this means for D2 (not decided here)

- **Half the time she falls back.** Even the best model gives a usable question on about
  half the boards. The fallback is her normal move, so a bad reply costs only latency, but
  the mode will feel like a sometimes-feature.
- **Don't hard-filter on the model's sort.** Against WordNet, Gemma put 30% of WordNet YES
  words in NO. Many are rare senses, but some are real mistakes. If her filter drops those
  words and one is the player's, she can reach zero candidates, which throws at Master
  (`Master invariant: zero candidates`). A soft filter that only lowers those words'
  weight survives such mistakes.
- **Keep reasoning off and check the switch on each deploy.** The setting depends on the
  provider's chat template. It already put Qwen3's reply in the reasoning field, which the
  normalizer reads, labelled `choices-reasoning-field`.
- **Tune the prompt on new boards.** These 21 states are now development data. To push
  questions towards an even split and away from "related to", test a revised prompt on a
  separate, held-out set of states.
- **Cap by neurons, not just requests.** Gemma is cheap (≈6–7 neurons), but a model or
  setting change could cost 6× more (gpt-oss: 21–42).

## Run

From `tools/`, with the Workers Free account's Wrangler login:

```powershell
$env:CLOUDFLARE_ACCOUNT_ID = '<your account ID>'
node benchmark-illucia-questions.js --build-states   # offline; already committed
node benchmark-illucia-questions.js --live --free-plan --wrangler-auth --phase probe --output benchmarks/illucia-d1-probe.json
node benchmark-illucia-questions.js --live --free-plan --wrangler-auth --phase run --output benchmarks/illucia-d1.json
node benchmark-illucia-questions.js --summarize benchmarks/illucia-d1.json --mapping benchmarks/illucia-d1-mapping.json
```

The probe sends one six-word sort per model, records each envelope and its hidden reasoning,
and projects the full run's cost from it. That projection is a floor for models whose
reasoning grows with the list. `--options-json '{"<model>": {...}}'` overrides one run's
model settings, and `--max-run-neurons` (default 3,000) caps a run inside the shared daily
ledger of 1,800 requests and 9,000 reserved or measured neurons (6,000 before 2026-10-02). `--state-ids`, `--modes` and `--timeout-ms` select states, tasks and the request timeout. Use a new output path to
keep earlier evidence. No npm script was added, to stay out of `package.json` while other
tracks edit it.
