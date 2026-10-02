# How strong is Illucia? (measurement, 2026-09-30)

Measured at `4f86f0f` on `main`, as she plays on `/illucia` and `/illucia-observatory` today.
Measurement only: no application code, vocabulary or policy changed.

- Script: `tools/benchmark-illucia-strength.js` (seeded, deterministic; `--speed` for the browser pass)
- Reports: `tools/benchmarks/illucia-strength.json`, `tools/benchmarks/illucia-strength-speed.json`
- Page harness: `client/src/Components/illucia-parity.measure.jsx` (run by the script; outside `npm run test:ui`)

## Update 2026-10-02: 3-letter words removed (v2 A1)

The sections below are the 2026-09-30 measurement over lengths 3–15. Players may now
choose only 4–15-letter words, and `3.txt` is gone, so the committed reports were
regenerated. Every sample depends only on the seed and its own length, so each
length-4–15 result below is unchanged (checked cell by cell); only the totals move.
Set a is unchanged. Set b loses its 498 three-letter words, set c its 12, set d its 300.

| Tier | a) manifest (105) | b) Common 4–6 (1,500) | c) Trickster (36) | d) Balanced (3,600) |
|---|---|---|---|---|
| Apprentice | 75.2% / 2.40 / 9.30 | **72.9%** / 3.87 / 8.01 | 16.7% / 5.58 / 7.56 | 40.6% / 4.31 / 10.47 |
| Scholar | 95.2% / 1.47 / 8.82 | 67.4% / 4.06 / 8.12 | 27.8% / 5.36 / 7.81 | 65.7% / 3.01 / 9.72 |
| Master | 98.1% / 1.48 / 8.90 | **63.1%** / 4.24 / 8.23 | 30.6% / 5.33 / 7.75 | 91.0% / 1.79 / 9.00 |

Page parity: 108/108 on both pages (36 words × 3 tiers; 36 out-of-tier cases, 34 that
used fallback; control: 35 of 36 Apprentice sequences differ from Master's). The
tier inversion on common short words (flag 1) remains at lengths 4–6.

## Tier-order gate (v2 acceptance test)

`benchmark-illucia-strength.js` now ends with the gate from the v2 decisions
(Amendments 2), computed by `tools/lib/illucia-gate.js` and stored under `gate` in
the report. Rule: **no tier may win less than a lower tier beyond noise.**

- **Cells (57):** set a overall; sets b and c overall and at each length 4–6; set d at
  each length 4–15, and at each length per size band (common, medium, rare).
- **Comparisons (171):** in every cell, Scholar vs Apprentice, Master vs Scholar and
  Master vs Apprentice.
- **Test:** every tier plays the same words, so each comparison is paired word by
  word. Only words exactly one of the two tiers solves carry information; the
  one-sided exact McNemar test asks whether the lower tier owns more of them than a
  fair coin would give. Holm's correction runs across all 171 comparisons, at 5%.
  A comparison fails when its Holm-adjusted p is ≤ 0.05.
- **Reported for every comparison:** both win rates, the difference (higher minus
  lower; negative means the lower tier is ahead), the discordant counts, raw p and
  Holm p. Near misses are comparisons with raw p ≤ 0.05 that the correction clears.
- **Limits:** set c has 12 words per length, so its cells can hardly fail. The play
  is deterministic, so "noise" means the luck of which words were sampled, not
  random play.

**Baseline, unweighted policy (2026-10-02): FAIL**, 8 of 171 comparisons. The lower
tier is ahead in 28 comparisons, and 7 more are near misses.

| Cell | Higher vs lower | Wins (of words) | Difference | Holm p |
|---|---|---|---|---|
| b all | Scholar vs Apprentice | 1,011 vs 1,094 (1,500) | −5.5 pts | 0.000001 |
| b all | Master vs Scholar | 947 vs 1,011 (1,500) | −4.3 pts | 0.0003 |
| b all | Master vs Apprentice | 947 vs 1,094 (1,500) | −9.8 pts | < 0.000001 |
| b length 4 | Scholar vs Apprentice | 230 vs 280 (500) | −10.0 pts | 0.0002 |
| b length 4 | Master vs Apprentice | 212 vs 280 (500) | −13.6 pts | < 0.000001 |
| b length 5 | Master vs Scholar | 311 vs 347 (500) | −7.2 pts | 0.002 |
| b length 5 | Master vs Apprentice | 311 vs 375 (500) | −12.8 pts | < 0.000001 |
| d length 5 common | Master vs Apprentice | 66 vs 84 (100) | −18.0 pts | 0.003 |

This is the known inversion (flag 1), and it shows the gate can fail on real data.
Unit tests (`tools/lib/illucia-gate.test.js`) check exact tails, Holm adjustment, a
clear inversion failing, an even split passing, and correction turning a lone
borderline cell into a near miss.

## Weighted candidates (v2 A1, 2026-10-02): gate PASS

Her letter choice now counts each candidate word by commonness: ESDB size ≤35 → 10,
40–50 → 3, 55–70 → 1. The fallback stays unweighted. The committed reports are this
policy. Apprentice knows only size-35 words, so all her results are identical to
the unweighted run.

**Gate: PASS**, 0 of 171 comparisons fail. The lower tier is still ahead in 22
comparisons, all within noise; the largest gaps are 4 words of 100 (set d,
4-letter rare, Scholar vs Apprentice: 0 vs 4, p 0.06) and 2.6 points (set b, length
4, Scholar 267 vs Apprentice 280 of 500, raw p 0.043, the one near miss; Holm p 1).

Illucia's win rate / average misses / average turns, weighted (unweighted in brackets):

| Tier | a) manifest (105) | b) Common 4–6 (1,500) | c) Trickster (36) | d) Balanced (3,600) |
|---|---|---|---|---|
| Apprentice | 75.2% / 2.40 | 72.9% / 3.87 | 16.7% / 5.58 | 40.6% / 4.31 |
| Scholar | 95.2% / 1.46 (1.47) | **72.3%** (67.4%) / 3.83 | 30.6% (27.8%) / 5.19 | 65.0% (65.7%) / 3.05 |
| Master | 98.1% / 1.29 (1.48) | **72.5%** (63.1%) / 3.83 | 36.1% (30.6%) / 5.17 | 90.0% (91.0%) / 1.84 |

Set b by length (Apprentice / Scholar / Master):

| Length | Unweighted | Weighted |
|---|---|---|
| 4 | 56.0 / 46.0 / 42.4% | 56.0 / 53.4 / 54.4% |
| 5 | 75.0 / 69.4 / 62.2% | 75.0 / 74.4 / 73.0% |
| 6 | 87.8 / 86.8 / 84.8% | 87.8 / 89.2 / 90.0% |

What it costs: Scholar and Master lose some strength on the rarer words they know.
In I3b's balanced sample, Master's rare band falls from 92.1% to 87.2%, and from
90.6% to 83.6% at 5–9 letters; Scholar's medium band from 92.8% to 90.1%. Common
words gain for both: Master 89.7% → 92.9%, Scholar 91.1% → 92.9%
(`tools/ILLUCIA-TIERS.md`).

As the amended decisions expected (Amendments 1), weighting brings Master level with
Apprentice on common words, not above her: ESDB gives every word up to size 35 the
same level. Master's average misses on the manifest set fall from 1.48 to 1.29.

Page parity: 108/108 on both pages (control: 32 of 36 Apprentice sequences differ from
Master's). Feel on set d: Master's rounds that come down to her last miss rise from
13.4% to 15.0%; Scholar's from 38.7% to 39.3%.

Speed was not re-measured in the browser. The desktop decision timing in I3 rose
from 1.56 / 11.61 ms to 1.82 / 18.62 ms (p50 / p95; not a contract, one machine),
so the 8-letter first turn on a throttled phone should be re-checked with `--speed`
before it is treated as unchanged.

## Temperament (v2 A2, 2026-10-02): gate PASS, cap PASS

Her letter now comes from her temperament (`strategy.js`), seeded per round: strictly
the best letter with 1–2 misses left (a tie settled by the seed); otherwise a weighted
pick among letters within the tier's shortlist width of her best weighted share, plus a
fading early vowel bonus. Starting values were kept, as both checks passed:

| Tier | Shortlist | Vowel bonus |
|---|---|---|
| Apprentice | 10 points | +6, fading over 3 turns |
| Scholar | 7 points | +4 over 2 turns |
| Master | 4 points | +2 over 1 turn |

**Method.** Every word is played with 8 seeds (`roundSeed(seed, word, index)`), the same
seeds at every tier. The gate compares each word's win fraction over its 8 games: a
one-sided exact sign test per comparison (McNemar when each word is played once), Holm
across the 171 comparisons at 5%. The **strength cap** compares each tier's win rate on
sets b and d with the strict A1 policy (one game per word, played in the same run) and
allows at most 2 points lost. Page parity plays her temperament too: each case's seed is
handed to the page in place of its local seed, and both pages match the benchmark on all
108 cases (control: 33 of 36 Apprentice sequences differ from Master's).

**Gate: PASS**, 0 of 171 fail; 2 near misses (set d, 4-letter rare, Scholar vs
Apprentice, raw p 0.020; set d, 5-letter common, Master vs Scholar, raw p 0.032; both
Holm p 1). The lower tier is ahead in 10 comparisons, the largest gap 3.9 points.

**Strength cap: PASS.** Win rate, temperament (A1 strict in brackets):

| Tier | a) manifest | b) Common 4–6 | c) Trickster | d) Balanced |
|---|---|---|---|---|
| Apprentice | 74.9% (75.2%) | 72.2% (72.9%) | 17.4% (16.7%) | 40.6% (40.6%) |
| Scholar | 95.2% (95.2%) | 72.7% (72.3%) | 30.2% (30.6%) | 65.1% (65.0%) |
| Master | 98.3% (98.1%) | 72.9% (72.5%) | 36.8% (36.1%) | 90.0% (90.0%) |

The largest loss is Apprentice on set b, 0.75 points; Scholar and Master gain slightly.

**Variety** (8 games per word): distinct guess sequences per word, then distinct opening
letters and their spread (entropy, bits), with the commonest openings:

| Tier | Set | Sequences / word | Openings | Commonest openings |
|---|---|---|---|---|
| Apprentice | b | 7.10 | 3 (1.18 bits) | E 70%, S 18%, A 12% |
| Apprentice | d | 5.96 | 6 (1.51 bits) | E 54%, I 37%, S 4%, A 3% |
| Scholar | b | 6.51 | 3 (1.12 bits) | E 73%, A 15%, S 12% |
| Scholar | d | 6.33 | 4 (1.32 bits) | E 57%, I 36%, A 4%, S 3% |
| Master | b | 5.38 | 3 (1.15 bits) | E 71%, A 16%, S 13% |
| Master | d | 6.56 | 4 (1.33 bits) | E 58%, I 34%, A 4%, S 3% |

Before A2 every word had exactly one sequence and one opening per tier (on 4-letter words,
E for Scholar and Master). Now 96–100% of words get more than one sequence. Openings
remain dominated by E, with I common on longer words: the shortlist only admits letters
close to her best, and on most boards few letters are.

Set b by length (temperament): Apprentice 53.2 / 75.4 / 87.9%, Scholar 54.0 / 75.6 /
88.4%, Master 53.8 / 75.6 / 89.3% at 4 / 5 / 6 letters. Feel on set d: the share of
rounds that come down to her last miss is 64.8% / 39.4% / 15.0%
(Apprentice / Scholar / Master).

## 1. Reproduction

I3 and I3b re-run at HEAD match their committed reports exactly. The manifest SHA-256
(`30124c8b…`) and the sample SHA-256s (I3 `4169f282…`, I3b `f27ff814…`) are unchanged, and
there are 0 differences outside timing and environment fields. As a check, the comparison
does catch a one-win change. I3b still gives Apprentice 38.92%, Scholar 62.51% and Master 86.13%.

## 2. Parity with the live pages

Both pages build `createKnowledge(entries, tier.maxSize)` from the fetched length file. Each
turn, they call `analyzeDecision(toPublicState(round), knowledge)` with the default `count`
policy and apply the letter with `applyGuess`. The duel page does this in its thinking timer;
the Observatory does it in `readMind`, then applies the letter in its timer. This is the same
path as the benchmark, including the tier fallback.

The harness renders the real page components (jsdom, fake timers, a stand-in session, the real
word files) and plays each round to the end. For the duel page, it shows every hit tile and
answers every miss. It then reads her guesses back from the page.

| Page | Cases | Match | Out-of-tier cases | Cases that used fallback |
|---|---|---|---|---|
| `/illucia` | 117 | **117** | 39 | 35 |
| `/illucia-observatory` | 117 | **117** | 39 | 35 |

The 117 cases are 39 words × 3 tiers. The words are one per size band per length 3–15, taken
from the I3b sample. The harness was checked against deliberate failures:
- Control: 38 of 39 Apprentice page sequences differ from Master's for the same word.
- Sabotage: temporarily building duel knowledge at size 70 dropped `/illucia` to 6/12 matches.
  That change was reverted.

The browser speed pass (§5) also replayed 30 Master games on the production build, and all 30
matched the benchmark.

## 3. Player-like words

Win rate is Illucia's win rate (she solves the word). Each cell shows win rate / average misses / average turns.

| Tier | a) Hangman manifest (105) | b) Common 3–6 letters (1,998) | c) Trickster (48) | d) I3b balanced (3,900) |
|---|---|---|---|---|
| Apprentice | 75.2% / 2.40 / 9.30 | **65.3%** / 4.13 / 7.75 | 16.7% / 5.65 / 7.52 | 38.9% / 4.40 / 10.21 |
| Scholar | 95.2% / 1.47 / 8.82 | 58.3% / 4.36 / 7.87 | 20.8% / 5.52 / 7.60 | 62.5% / 3.19 / 9.50 |
| Master | 98.1% / 1.48 / 8.90 | **53.3%** / 4.54 / 7.97 | 22.9% / 5.50 / 7.54 | 86.1% / 2.06 / 8.84 |

- a) All 105 manifest words are in the accepted list. Apprentice wins 97.4% of the 77 in her tier
  and 14.3% of the 28 outside it. Scholar has 3 words outside her tier.
- b) All size 35, so every tier knows every word. ESDB has no frequency rank finer than size 35,
  its smallest bucket. So "top 500" here is a **seeded sample of 500 size-35 words per length**
  (all 498 for length 3), not a frequency ranking.
- c) The fixed list is in the script: `jazz fuzz lynx rhythm glyph crypt quiz jinx …`. It has
  12 words each of lengths 3–6 (36 at size 35, 12 rarer).

Per-length results for b and c (Illucia's win rate):

| Length | b Apprentice | b Scholar | b Master | c Apprentice | c Scholar | c Master |
|---|---|---|---|---|---|---|
| 3 | 42.2% | 30.7% | 23.5% | 2/12 | 0/12 | 0/12 |
| 4 | 56.0% | 46.0% | 42.4% | 0/12 | 1/12 | 1/12 |
| 5 | 75.0% | 69.4% | 62.2% | 1/12 | 3/12 | 4/12 |
| 6 | 87.8% | 86.8% | 84.8% | 5/12 | 6/12 | 6/12 |

## 4. Feel of a round (set d)

| Tier | Wins with 0 / 1 / 2 / 3 / 4 / 5 misses (share of her wins) | Won on last chance | Lost | Decided on the last miss | Used fallback |
|---|---|---|---|---|---|
| Apprentice | 33.9 / 17.2 / 12.6 / 11.6 / 10.6 / 14.0% | 5.5% | 61.1% | 66.5% | 56.1% |
| Scholar | 38.1 / 22.3 / 13.8 / 9.7 / 8.8 / 7.3% | 4.5% | 37.5% | 42.0% | 27.4% |
| Master | 38.0 / 25.3 / 12.5 / 10.0 / 8.7 / 5.5% | 4.7% | 13.9% | 18.6% | 0% |

"Decided on the last miss" means the round reached her last chance: she won with exactly
5 misses, or lost on the 6th. The other shares are of all games.

## 5. Speed

This is the production build (`npm run build` + `vite preview`) in headless Edge 154. The
viewport is 360×800 with mobile emulation, and the CPU is throttled 4× through DevTools.
**Throttling is an emulation on a desktop CPU, not a physical phone.**

The test ran 30 Master rounds on `/illucia` with the 8-letter bucket. That bucket is the
largest by word count (21,426 words); `9.txt` is the largest file by bytes. A stand-in
`/user/me` response opened the registered-only page. Each turn was timed around the page's
own 1100 ms thinking-timer callback. That callback covers her whole turn: the decision plus
the page's bookkeeping, which includes a second candidate filter. So it is an upper bound on
the decision itself.

| Measure | p50 | p95 | Max |
|---|---|---|---|
| Her turn, all 277 turns | 36.7 ms | 158.6 ms | 172.2 ms |
| Her turn, first turn only (all 21,426 candidates) | 158.2 ms | 172.1 ms | 172.2 ms |
| Her turn, later turns | 34.6 ms | 88.7 ms | 98.5 ms |
| First turn end to end (submit → first guess on screen, minus the 1100 ms pause) | 468 ms | 547 ms | 614 ms (cold, first game) |

The end-to-end figure includes fetching the file from the local preview (no network
throttling, cache disabled), parsing, building knowledge, the first decision and the renders.
In an unthrottled control (10 rounds), the first turn took 24 ms p50 and end to end took
91 ms p50, which confirms the throttle was active. A throttled 10-round repeat agreed: 163 ms
first turn and 477 ms end to end, both p50.

Transfer sizes from production (`hangman.spyrostrimis.com`, brotli, as DevTools reports them,
response headers included). The decoded sizes equal the committed files.

| Length | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Raw KB | 10.4 | 33.9 | 76.7 | 139.6 | 212.9 | 257.1 | 265.8 | 238.5 | 187.8 | 135.1 | 89.6 | 53.8 | 32.2 |
| Transferred KB | 4.2 | 12.0 | 27.6 | 49.6 | 74.8 | 89.4 | 91.4 | 79.9 | 61.9 | 43.9 | 29.0 | 17.6 | 10.9 |

`vite preview` serves gzip rather than brotli (8.txt: 86.1 KB).

## Flags (not fixed)

1. **The tiers invert on common short words.** On set b, Apprentice beats Scholar, and Scholar
   beats Master, at every length from 3 to 6. At 3 letters it is 42% vs 31% vs 24%. A bigger
   vocabulary means more short look-alikes. The tier order holds on random words (set d) but
   reverses on the words players are most likely to pick.
2. **Short words beat every tier.** On the trickster set, she wins 17–23% overall and 0–2 of
   12 at 3 letters. Common 3-letter words already hold Master to 23.5%.
3. **Apprentice's weakness is almost all out-of-tier words.** She wins 89% of in-tier balanced
   words but 14% of out-of-tier ones. 56% of her balanced rounds hit the fallback.
4. **Hangman manifest words are easy for her:** 95–98% at Scholar and Master.
5. **Master's first turn on 8 letters is one main-thread task of about 160 ms** under 4×
   throttling. That is above the 50 ms long-task threshold, but it runs inside the 1100 ms
   thinking pause.

## Caveats

- Win rates are for her policy against a fixed list, not against real players. Set b's "most
  common" is size-35 membership, not a frequency ranking.
- Parity ran in jsdom with a stand-in session. The browser pass checked 30 more rounds on the
  real production build.
- The speed numbers come from one machine: one committed 30-round run plus two scratch
  checks. They are not deterministic and are not committed as a contract.

## Commands

```sh
cd tools
node benchmark-illucia.js --output <tmp>/i3.json          # then compare with benchmarks/illucia-i3.json
node benchmark-illucia-tiers.js --output <tmp>/i3b.json   # then compare with benchmarks/illucia-i3b.json
node benchmarks/check-illucia-reproduction.js <tmp>/i3.json <tmp>/i3b.json   # compares both, ignoring timing and environment
node benchmark-illucia-strength.js                        # sets a–d, feel, page parity (~4.5 min)
# with `vite preview` of a fresh build on :4173 and Edge installed:
node benchmark-illucia-strength.js --speed                # 30 throttled Master rounds (~6 min)
```
