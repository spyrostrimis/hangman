// B2: how much do answered yes/no questions help Illucia? Paired design: every word is
// played by every tier in every arm, with the same seed, and compared with the arm in
// which the player declines every question. Decisions §2 and Amendments 1.5 and 2.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { availableParallelism } from 'node:os';
import { dirname, resolve } from 'node:path';
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { createRound, applyGuess, getRoundStatus, getIncorrectGuesses } from '../client/src/lib/hangman-core.js';
import { toPublicState } from '../client/src/lib/illucia/public-state.js';
import { filterCandidates } from '../client/src/lib/illucia/candidates.js';
import { MIN_WORD_LENGTH, VOCABULARY_TIERS, createKnowledge } from '../client/src/lib/illucia/lexicon.js';
import { analyzeDecision } from '../client/src/lib/illucia/strategy.js';
import { B2_RULES, KINDS, checkAnswer, chooseQuestion, narrowKnowledge, parseCategories, parseLabels } from '../client/src/lib/illucia/questions.js';
import { DEFAULT_SEED, loadLexicons, simulate } from './benchmark-illucia.js';
import { gateCells, wordSets } from './benchmark-illucia-strength.js';
import { WORD_BANDS } from './benchmark-illucia-tiers.js';
import { binomialUpperTail, tierGate } from './lib/illucia-gate.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const LABELS = resolve(ROOT, 'client/public/illucia/labels');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const STATS_LENGTHS = Object.freeze([MIN_WORD_LENGTH, 10]);
// Seeds of the committed run. Spaced so that the per-length sample seeds never coincide.
export const SEED_STEP = 7919;
// Stump-point multipliers by answered questions (0, 1, 2): owner decision 2026-10-02,
// replacing x1.25 / x1.5, which are still priced for comparison.
export const MULTIPLIERS = Object.freeze([1, 1.5, 2]);
export const PREVIOUS_MULTIPLIERS = Object.freeze([1, 1.25, 1.5]);
// Selective players: rules a real player can follow, from their own word and the public board.
export const ANSWER_RULES = Object.freeze({
  // Questions barely help her on long words (she solves them anyway), so answer only there.
  long: word => word.length >= 7,
  // Answer only while at most one position is revealed: early, when a question narrows little.
  early: (word, state) => state.pattern.filter(letter => letter !== null).length <= 1,
});

// Decline every question, or answer the first one or both, for each timing and category set.
export const ARMS = Object.freeze([
  Object.freeze({ id: 'decline', answers: 0 }),
  ...[['first', 0], ['third', 2]].flatMap(([timing, earliestTurn]) =>
    [['noun', ['noun']], ['all', [...KINDS]]].flatMap(([categories, kinds]) =>
      [1, 2].map(answers => Object.freeze({ id: `${timing}-${categories}-${answers}`, timing, earliestTurn,
        categories, kinds: Object.freeze(kinds), answers })))),
  ...Object.keys(ANSWER_RULES).map(rule => Object.freeze({ id: `third-noun-${rule}`, timing: 'third', earliestTurn: 2,
    categories: 'noun', kinds: Object.freeze(['noun']), answers: 2, answerIf: rule })),
]);

export async function loadQuestions() {
  const categoryBytes = await readFile(resolve(LABELS, 'categories.json'));
  const spec = JSON.parse(categoryBytes);
  const categories = parseCategories(spec);
  const manifest = JSON.parse(await readFile(resolve(LABELS, 'manifest.json')));
  const labelsByLength = {};
  for (const [name, file] of Object.entries(manifest.files)) {
    const bytes = await readFile(resolve(LABELS, name));
    if (sha256(bytes) !== file.sha256) throw new Error(`Label checksum mismatch for ${name}.`);
    const length = Number.parseInt(name, 10);
    labelsByLength[length] = parseLabels(bytes.toString('ascii'), length, categories);
  }
  // Broad = a whole WordNet lexicographer file (person, man-made object, ...), not a "kind of" class.
  const broad = new Set(spec.categories.filter(category => category.lexfiles).map(category => category.key));
  return { categories, labelsByLength, broad, categoriesSha256: sha256(categoryBytes),
    labelsManifestSha256: sha256(await readFile(resolve(LABELS, 'manifest.json'))) };
}

// One round. The player is honest: a question is answered with the word's true label,
// up to arm.answers times, and declined when WordNet doesn't know the word (no bonus
// is possible). She sees only the public board and the offers so far.
export function play(word, knowledge, labels, categories, arm) {
  const inVocabulary = knowledge.words.includes(word);
  if (knowledge.maxSize === 70 && !inVocabulary) throw new Error('Master invariant: answer is outside the vocabulary.');
  let round = createRound(word);
  // Her vocabulary narrowed by the answers so far, and (for speed) by the board: candidates
  // only ever shrink, so filtering last turn's candidates gives exactly this turn's.
  let pool = knowledge;
  const offers = [];
  const asked = [];
  while (getRoundStatus(round) === 'playing') {
    const state = toPublicState(round);
    if (arm.answers > 0) {
      const question = chooseQuestion(state, pool, labels, categories, offers,
        { ...B2_RULES, kinds: arm.kinds, earliestTurn: arm.earliestTurn });
      if (question) {
        const truth = checkAnswer(labels, word, question.code);
        const answered = offers.filter(offer => offer.answer !== 'declined').length;
        const willing = !arm.answerIf || ANSWER_RULES[arm.answerIf](word, state);
        const answer = truth !== null && answered < arm.answers && willing ? truth : 'declined';
        offers.push(Object.freeze({ code: question.code, answer }));
        asked.push({ key: question.key, turn: state.guessedLetters.length,
          revealed: state.pattern.filter(letter => letter !== null).length,
          candidates: question.candidateCount, answer });
        pool = narrowKnowledge(pool, labels, [offers.at(-1)], categories);
      }
    }
    const decision = analyzeDecision(state, pool, 'count');
    if (decision.candidateCount === 0 && inVocabulary) throw new Error(`Known-word invariant: no candidates for ${word}.`);
    round = applyGuess(round, decision.letter);
    if (round.guesses.length > 26) throw new Error('Solver made no legal progress.');
    if (getRoundStatus(round) === 'playing') {
      pool = Object.freeze({ ...pool, words: Object.freeze(filterCandidates(toPublicState(round), pool.words)) });
    }
  }
  return { word, won: getRoundStatus(round) === 'solved', misses: getIncorrectGuesses(round).length,
    guesses: round.guesses.join(''), inVocabulary, labelled: labels.has(word), asked,
    answered: asked.filter(offer => offer.answer !== 'declined').length };
}

export function playAll(entriesByLength, labelsByLength, categories, sets, arms = ARMS) {
  const knowledge = {};
  const know = (word, tier) => (knowledge[`${tier.maxSize}:${word.length}`] ??=
    createKnowledge(entriesByLength[word.length], tier.maxSize));
  const games = {};
  for (const arm of arms) {
    games[arm.id] = {};
    for (const tier of VOCABULARY_TIERS) {
      games[arm.id][tier.id] = Object.fromEntries(Object.entries(sets).map(([key, set]) => [key,
        set.words.map(word => play(word, know(word, tier), labelsByLength[word.length], categories, arm))]));
    }
  }
  return { games, know };
}

// Positive control: declining everything must be exactly today's play, move for move
// (games[CONTROL] holds the strength benchmark's own simulate() games).
export const CONTROL = 'strength-simulate';
export function declineControl(games, sets) {
  let compared = 0;
  for (const tier of VOCABULARY_TIERS) {
    for (const [key, set] of Object.entries(sets)) {
      set.words.forEach((word, index) => {
        const expected = games[CONTROL][tier.id][key][index].guesses;
        const actual = games.decline[tier.id][key][index].guesses;
        if (actual !== expected) throw new Error(`Decline arm differs from the strength play: ${tier.id} ${word}.`);
        compared++;
      });
    }
  }
  return { games: compared, matches: compared };
}

const mean = values => values.reduce((a, b) => a + b, 0) / (values.length || 1);
const round4 = value => (value === null || value === undefined || Number.isNaN(value) ? null : Number(value.toFixed(4)));
const inStats = game => game.word.length >= STATS_LENGTHS[0] && game.word.length <= STATS_LENGTHS[1];

// Exact two-sided McNemar on the words exactly one arm wins (her wins).
export function paired(declined, answered) {
  if (declined.length !== answered.length) throw new Error('Paired arms need the same words.');
  let armOnly = 0;
  let declineOnly = 0;
  declined.forEach((game, index) => {
    if (game.word !== answered[index].word) throw new Error('Paired arms need the same word order.');
    if (answered[index].won && !game.won) armOnly++;
    if (game.won && !answered[index].won) declineOnly++;
  });
  const n = declined.length;
  const split = armOnly + declineOnly;
  return {
    words: n,
    herWinRateDeclined: round4(mean(declined.map(game => Number(game.won)))),
    herWinRateAnswered: round4(mean(answered.map(game => Number(game.won)))),
    difference: round4(n ? (armOnly - declineOnly) / n : null),
    armOnly, declineOnly,
    p: Number(Math.min(1, 2 * binomialUpperTail(Math.max(armOnly, declineOnly), split)).toPrecision(3)),
    missesSaved: round4(mean(declined.map((game, index) => game.misses - answered[index].misses))),
  };
}

// Two answer arms against each other, word by word: the "to" arm minus the "from" arm.
export function versus(fromGames, toGames, [from, to]) {
  const result = paired(fromGames, toGames);
  return { words: result.words, [from]: result.herWinRateDeclined, [to]: result.herWinRateAnswered,
    difference: result.difference, [`${to}Only`]: result.armOnly, [`${from}Only`]: result.declineOnly,
    p: result.p, missesSaved: result.missesSaved };
}

export function askStats(games, broad) {
  const offers = games.flatMap(game => game.asked);
  const firsts = games.filter(game => game.asked.length).map(game => game.asked[0]);
  const count = list => Object.fromEntries(Object.entries(list.reduce((tally, key) => {
    tally[key] = (tally[key] ?? 0) + 1;
    return tally;
  }, {})).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)));
  const sorted = firsts.map(offer => offer.candidates).sort((a, b) => a - b);
  return {
    rounds: games.length,
    roundsAsked: firsts.length,
    askedShare: round4(firsts.length / (games.length || 1)),
    roundsAskedTwice: games.filter(game => game.asked.length === 2).length,
    offers: offers.length,
    answered: offers.filter(offer => offer.answer !== 'declined').length,
    declinedUnknownWord: games.filter(game => !game.labelled).reduce((sum, game) => sum + game.asked.length, 0),
    firstQuestionTurn: count(firsts.map(offer => String(offer.turn))),
    medianCandidatesAtFirstQuestion: sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : null,
    broadFirstShare: round4(firsts.filter(offer => broad.has(offer.key)).length / (firsts.length || 1)),
    firstCategories: count(firsts.map(offer => offer.key)),
    categories: count(offers.map(offer => offer.key)),
  };
}

// Is the bonus fairly priced? Over in-tier rounds whose word WordNet knows (the only rounds
// that can earn a bonus), compare the player's expected stump points when they answer with
// those when they decline. Stump points are tier base x min(length - 3, 3); the base cancels.
export function pricing(declined, answered, seed = DEFAULT_SEED, multipliers = MULTIPLIERS) {
  const rows = declined.map((game, index) => ({ game, arm: answered[index] }))
    .filter(({ game }) => game.inVocabulary && game.labelled);
  const value = (game, multiplier) => (game.won ? 0 : multiplier * Math.min(game.word.length - 3, 3));
  const ratio = list => {
    const declinedPoints = list.reduce((sum, { game }) => sum + value(game, 1), 0);
    const answeredPoints = list.reduce((sum, { arm }) => sum + value(arm, multipliers[arm.answered]), 0);
    return declinedPoints ? answeredPoints / declinedPoints : null;
  };
  const asked = rows.filter(({ arm }) => arm.answered > 0);
  // Break-even multiplier on rounds with an answer: what the bonus would need to be for
  // answering to pay exactly what declining pays.
  const declinedOnAsked = asked.reduce((sum, { game }) => sum + value(game, 1), 0);
  const answeredOnAsked = asked.reduce((sum, { arm }) => sum + value(arm, 1), 0);
  // Seeded bootstrap over rounds for a 95% interval on the points ratio.
  const draws = [];
  if (rows.length) {
    let state = seed >>> 0;
    const next = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 2 ** 32;
    };
    for (let i = 0; i < 1000; i++) {
      const sample = rows.map(() => rows[Math.floor(next() * rows.length)]);
      const r = ratio(sample);
      if (r !== null) draws.push(r);
    }
    draws.sort((a, b) => a - b);
  }
  return {
    rounds: rows.length,
    roundsAnswered: asked.length,
    averageMultiplierWhenAnswered: round4(mean(asked.map(({ arm }) => multipliers[arm.answered]))),
    playerWinDeclined: round4(mean(rows.map(({ game }) => Number(!game.won)))),
    playerWinAnswered: round4(mean(rows.map(({ arm }) => Number(!arm.won)))),
    breakEvenMultiplier: round4(answeredOnAsked ? declinedOnAsked / answeredOnAsked : null),
    pointsRatio: round4(ratio(rows)),
    pointsRatio95: draws.length ? [round4(draws[Math.floor(0.025 * (draws.length - 1))]),
      round4(draws[Math.ceil(0.975 * (draws.length - 1))])] : null,
  };
}

// Upper bound for a selective player: in each round, the best of declining, answering the
// first question only, and answering both, chosen with hindsight. No real player can do this.
export function hindsight(declined, options, multipliers = MULTIPLIERS) {
  const value = (game, multiplier) => (game.won ? 0 : multiplier * Math.min(game.word.length - 3, 3));
  let declinedPoints = 0;
  let bestPoints = 0;
  let rounds = 0;
  declined.forEach((game, index) => {
    if (!game.inVocabulary || !game.labelled) return;
    rounds++;
    declinedPoints += value(game, 1);
    bestPoints += Math.max(value(game, 1), ...options.map(games => {
      if (games[index].word !== game.word) throw new Error('Hindsight needs the same word order.');
      return value(games[index], multipliers[games[index].answered]);
    }));
  });
  return { rounds, pointsRatio: round4(declinedPoints ? bestPoints / declinedPoints : null) };
}

function bandOf(entriesByLength) {
  return word => {
    const size = entriesByLength[word.length].find(entry => entry.word === word).size;
    return WORD_BANDS.find(band => size >= band.min && size <= band.max).name;
  };
}

export async function questionsBenchmark({ seed = DEFAULT_SEED, seeds = 3, quick = false } = {}) {
  const { entriesByLength, manifestSha256 } = await loadLexicons();
  const { categories, labelsByLength, broad, categoriesSha256, labelsManifestSha256 } = await loadQuestions();
  const band = bandOf(entriesByLength);
  const runs = [];
  for (let i = 0; i < seeds; i++) {
    const runSeed = seed + i * SEED_STEP;
    let { sets } = await wordSets(entriesByLength, runSeed);
    // Sets a and c are fixed lists: play them once. --quick keeps every tenth word of b and d.
    if (i > 0) sets = { b: sets.b, d: sets.d };
    if (quick) sets = Object.fromEntries(Object.entries(sets).map(([key, set]) =>
      [key, { ...set, words: key === 'b' || key === 'd' ? set.words.filter((_, index) => index % 10 === 0) : set.words }]));
    const started = performance.now();
    const words = Object.fromEntries(Object.entries(sets).map(([key, set]) => [key, set.words]));
    const jobs = [...ARMS.map(arm => arm.id), ...(i === 0 ? [CONTROL] : [])]
      .flatMap(arm => VOCABULARY_TIERS.map(tier => ({ arm, tier: tier.id, sets: words })));
    const results = await runJobs(jobs);
    const games = {};
    jobs.forEach((job, index) => ((games[job.arm] ??= {})[job.tier] = results[index]));
    const control = i === 0 ? declineControl(games, sets) : null;
    delete games[CONTROL];
    // The tier-order gate on the full cells, for declining (today's gate) and each answer-both arm.
    const gates = i === 0 && !quick ? Object.fromEntries(ARMS.filter(arm => arm.answers !== 1 && !arm.answerIf).map(arm => {
      const gate = tierGate(gateCells(games[arm.id], band));
      return [arm.id, { passed: gate.passed, comparisons: gate.comparisons, failures: gate.failures,
        nearMisses: gate.nearMisses, lowerTierAhead: gate.lowerTierAhead }];
    })) : null;
    console.error(`seed ${runSeed}: ${Object.values(sets).reduce((n, set) => n + set.words.length, 0)} words x ` +
      `${VOCABULARY_TIERS.length} tiers x ${ARMS.length} arms in ${((performance.now() - started) / 60000).toFixed(1)} min`);
    runs.push({ seed: runSeed, sets: Object.keys(sets), games, control, gates });
  }
  // Pool every seed's games per tier and set, restricted to lengths 4-10 for the statistics.
  const pooled = (armId, tierId, key) => runs.flatMap(run => run.games[armId][tierId][key] ?? []).filter(inStats);
  const setKeys = ['a', 'b', 'c', 'd'];
  const results = {};
  for (const tier of VOCABULARY_TIERS) {
    results[tier.id] = { sets: {}, byLength: {} };
    for (const key of setKeys) {
      const declined = pooled('decline', tier.id, key);
      results[tier.id].sets[key] = Object.fromEntries(ARMS.filter(arm => arm.answers).map(arm => {
        const answered = pooled(arm.id, tier.id, key);
        return [arm.id, { paired: paired(declined, answered), asked: askStats(answered, broad),
          pricing: pricing(declined, answered, seed),
          pricingPrevious: pricing(declined, answered, seed, PREVIOUS_MULTIPLIERS) }];
      }));
    }
    const all = armId => setKeys.flatMap(key => pooled(armId, tier.id, key));
    for (let length = STATS_LENGTHS[0]; length <= STATS_LENGTHS[1]; length++) {
      const declined = all('decline').filter(game => game.word.length === length);
      results[tier.id].byLength[length] = Object.fromEntries(ARMS.filter(arm => arm.answers).map(arm =>
        [arm.id, paired(declined, all(arm.id).filter(game => game.word.length === length))]));
    }
    // Timing (third guess minus first chance) and categories (all minus nouns), same answers.
    results[tier.id].timing = Object.fromEntries(['noun-1', 'noun-2', 'all-1', 'all-2'].map(suffix =>
      [suffix, versus(all(`first-${suffix}`), all(`third-${suffix}`), ['first', 'third'])]));
    results[tier.id].categoryChoice = Object.fromEntries(['first-1', 'first-2', 'third-1', 'third-2'].map(name => {
      const [timing, answers] = name.split('-');
      return [name, versus(all(`${timing}-noun-${answers}`), all(`${timing}-all-${answers}`), ['noun', 'all'])];
    }));
    const declined = all('decline');
    results[tier.id].hindsight = Object.fromEntries([['all', all], ...setKeys.map(key => [key, armId => pooled(armId, tier.id, key)])]
      .map(([name, pick]) => [name, { current: hindsight(pick('decline'), [pick('third-noun-1'), pick('third-noun-2')]),
        previous: hindsight(pick('decline'), [pick('third-noun-1'), pick('third-noun-2')], PREVIOUS_MULTIPLIERS) }]));
    results[tier.id].all = Object.fromEntries(ARMS.filter(arm => arm.answers).map(arm => {
      const answered = all(arm.id);
      return [arm.id, { paired: paired(declined, answered), asked: askStats(answered, broad),
        pricing: pricing(declined, answered, seed),
        pricingPrevious: pricing(declined, answered, seed, PREVIOUS_MULTIPLIERS) }];
    }));
  }
  return {
    configuration: { brain: 'A1: strict commonness-weighted count (no round seed)', seed, seeds, seedStep: SEED_STEP,
      quick, statsLengths: STATS_LENGTHS, arms: ARMS, multipliers: MULTIPLIERS, previousMultipliers: PREVIOUS_MULTIPLIERS,
      player: 'honest: true WordNet label; declines when WordNet does not know the word',
      manifestSha256, categoriesSha256, labelsManifestSha256 },
    environment: { node: process.version, platform: process.platform, architecture: process.arch },
    runs: runs.map(run => ({ seed: run.seed, sets: run.sets, control: run.control, gates: run.gates })),
    results,
  };
}

// Every (arm, tier) pair is an independent, deterministic job, so the results do not
// depend on how jobs are spread over worker threads.
function playJob({ arm: armId, tier: tierId, sets }, { entriesByLength, labelsByLength, categories }) {
  const tier = VOCABULARY_TIERS.find(value => value.id === tierId);
  const arm = ARMS.find(value => value.id === armId);
  const knowledge = {};
  const know = word => (knowledge[word.length] ??= createKnowledge(entriesByLength[word.length], tier.maxSize));
  return Object.fromEntries(Object.entries(sets).map(([key, words]) => [key, words.map(word => armId === CONTROL
    ? simulate(word, know(word), 'count', () => 0)
    : play(word, know(word), labelsByLength[word.length], categories, arm))]));
}

async function runJobs(jobs) {
  const results = new Array(jobs.length);
  let next = 0;
  const workers = Math.min(jobs.length, Math.max(1, availableParallelism() - 1));
  await Promise.all(Array.from({ length: workers }, () => new Promise((resolveWorker, reject) => {
    const worker = new Worker(new URL(import.meta.url));
    const send = () => {
      if (next >= jobs.length) {
        worker.terminate().then(() => resolveWorker());
        return;
      }
      const index = next++;
      worker.postMessage({ index, job: jobs[index] });
    };
    worker.on('message', ({ index, games, error }) => {
      if (error) {
        worker.terminate();
        reject(new Error(error));
        return;
      }
      results[index] = games;
      send();
    });
    worker.on('error', reject);
    send();
  })));
  return results;
}

if (!isMainThread) {
  const context = (async () => ({ ...(await loadLexicons()), ...(await loadQuestions()) }))();
  parentPort.on('message', async ({ index, job }) => {
    try {
      parentPort.postMessage({ index, games: playJob(job, await context) });
    } catch (error) {
      parentPort.postMessage({ index, error: error.stack ?? String(error) });
    }
  });
}

async function main() {
  const options = {};
  let output = null;
  for (let i = 2; i < process.argv.length; i++) {
    const flag = process.argv[i];
    if (flag === '--quick') { options.quick = true; options.seeds = 1; continue; }
    const value = process.argv[++i];
    if (value === undefined) throw new Error(`Missing value for ${flag}`);
    if (flag === '--seed') options.seed = Number(value);
    else if (flag === '--seeds') options.seeds = Number(value);
    else if (flag === '--output') output = resolve(value);
    else throw new Error(`Unknown option ${flag}`);
  }
  if (options.quick && !output) throw new Error('--quick needs --output, so it never replaces the committed report.');
  output ??= fileURLToPath(new URL('benchmarks/illucia-bets.json', import.meta.url));
  const report = await questionsBenchmark(options);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(`Report: ${output}`);
}

if (isMainThread && process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
