# How strong is Illucia? (measurement, 2026-09-30)

Measured at `4f86f0f` on `main`, as she plays on `/illucia` and `/illucia-observatory` today.
Measurement only: no application code, vocabulary or policy changed.

- Script: `tools/benchmark-illucia-strength.js` (seeded, deterministic; `--speed` for the browser pass)
- Reports: `tools/benchmarks/illucia-strength.json`, `tools/benchmarks/illucia-strength-speed.json`
- Page harness: `client/src/Components/illucia-parity.measure.jsx` (run by the script; outside `npm run test:ui`)

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
node benchmark-illucia-strength.js                        # sets a–d, feel, page parity (~4.5 min)
# with `vite preview` of a fresh build on :4173 and Edge installed:
node benchmark-illucia-strength.js --speed                # 30 throttled Master rounds (~6 min)
```
