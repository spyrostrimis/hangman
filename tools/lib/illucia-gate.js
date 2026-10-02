// Tier-order acceptance gate for Illucia v2 (docs/planning/ILLUCIA-V2-DECISIONS.md,
// Amendments 2): no tier may win less than a lower tier beyond noise. Every tier
// plays the same words, so each comparison is paired word by word: a one-sided
// exact McNemar test on the words only one of the two tiers solves, with Holm's
// correction across every comparison in the run.

export const GATE_ALPHA = 0.05;
export const TIER_PAIRS = Object.freeze([
  Object.freeze({ higher: 'scholar', lower: 'apprentice' }),
  Object.freeze({ higher: 'master', lower: 'scholar' }),
  Object.freeze({ higher: 'master', lower: 'apprentice' }),
]);

const logFactorials = [0];
function logFactorial(n) {
  for (let i = logFactorials.length; i <= n; i++) logFactorials[i] = logFactorials[i - 1] + Math.log(i);
  return logFactorials[n];
}

// P(X >= k) for X ~ Binomial(n, 1/2), summed exactly in log space.
export function binomialUpperTail(k, n) {
  if (k <= 0) return 1;
  if (k > n) return 0;
  const terms = [];
  for (let i = k; i <= n; i++) terms.push(logFactorial(n) - logFactorial(i) - logFactorial(n - i) - n * Math.LN2);
  const peak = Math.max(...terms);
  return Math.min(1, Math.exp(peak) * terms.reduce((sum, term) => sum + Math.exp(term - peak), 0));
}

// One-sided exact McNemar: is the lower tier ahead on the words they split?
export function pairedComparison(lowerGames, higherGames) {
  if (lowerGames.length !== higherGames.length) throw new Error('Paired comparison needs the same words.');
  let lowerOnly = 0;
  let higherOnly = 0;
  let lowerWins = 0;
  let higherWins = 0;
  for (let i = 0; i < lowerGames.length; i++) {
    if (lowerGames[i].word !== higherGames[i].word) throw new Error('Paired comparison needs the same word order.');
    const lower = lowerGames[i].won;
    const higher = higherGames[i].won;
    lowerWins += Number(lower);
    higherWins += Number(higher);
    if (lower && !higher) lowerOnly++;
    if (higher && !lower) higherOnly++;
  }
  const n = lowerGames.length;
  return {
    words: n, lowerWins, higherWins, lowerOnly, higherOnly,
    lowerWinRate: n ? lowerWins / n : null,
    higherWinRate: n ? higherWins / n : null,
    // Effect size: the higher tier's win rate minus the lower tier's (negative = inversion).
    difference: n ? (higherWins - lowerWins) / n : null,
    p: binomialUpperTail(lowerOnly, lowerOnly + higherOnly),
  };
}

// Holm step-down adjusted p-values, in input order.
export function holmAdjust(pValues) {
  const order = pValues.map((p, index) => ({ p, index })).sort((a, b) => a.p - b.p || a.index - b.index);
  const adjusted = new Array(pValues.length);
  let running = 0;
  order.forEach(({ p, index }, rank) => {
    running = Math.max(running, Math.min(1, (pValues.length - rank) * p));
    adjusted[index] = running;
  });
  return adjusted;
}

const round = value => (value === null ? null : Number(value.toFixed(6)));

// cells: [{ set, slice, games: { apprentice: [...], scholar: [...], master: [...] } }]
export function tierGate(cells, alpha = GATE_ALPHA) {
  const comparisons = cells.flatMap(cell => TIER_PAIRS.map(pair => ({
    set: cell.set, slice: cell.slice, higher: pair.higher, lower: pair.lower,
    ...pairedComparison(cell.games[pair.lower], cell.games[pair.higher]),
  })));
  const adjusted = holmAdjust(comparisons.map(comparison => comparison.p));
  const rows = comparisons.map((comparison, index) => {
    // One-sided: p <= alpha already means the lower tier solved more of the split words.
    const fails = adjusted[index] <= alpha;
    return {
      ...comparison,
      lowerWinRate: round(comparison.lowerWinRate),
      higherWinRate: round(comparison.higherWinRate),
      difference: round(comparison.difference),
      p: round(comparison.p),
      holmP: round(adjusted[index]),
      fails,
      // Lower tier ahead and significant before correction, but not after it.
      nearMiss: !fails && comparison.p <= alpha,
    };
  });
  return {
    test: 'one-sided exact McNemar (lower tier ahead on discordant words), Holm-corrected',
    alpha, comparisons: rows.length, cells: cells.length,
    passed: rows.every(row => !row.fails),
    failures: rows.filter(row => row.fails),
    nearMisses: rows.filter(row => row.nearMiss),
    lowerTierAhead: rows.filter(row => row.difference < 0).length,
    rows,
  };
}
