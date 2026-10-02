import { mkdir, readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MAX_WORD_LENGTH, MIN_WORD_LENGTH, VOCABULARY_TIERS, createKnowledge, isAcceptedWord } from '../client/src/lib/illucia/lexicon.js';
import { DEFAULT_SEED, loadLexicons, perWord, roundSeed, sampleWords, simulate, variety } from './benchmark-illucia.js';
import { WORD_BANDS, tierSamples } from './benchmark-illucia-tiers.js';
import { tierGate } from './lib/illucia-gate.js';

// Strength of Illucia as she plays on the live pages: player-like word sets,
// the feel of a round, and page parity. Measurement only; nothing here feeds the app.
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CLIENT = resolve(ROOT, 'client');
const PARITY_HARNESS = 'src/Components/illucia-parity.measure.jsx';
const sha256 = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Short words built on rare letters. Every one must be in the accepted list.
// The 12 three-letter words were dropped with the 4-letter minimum (v2 A1).
export const TRICKSTER_WORDS = Object.freeze([
  'jazz', 'fuzz', 'buzz', 'fizz', 'jinx', 'lynx', 'quiz', 'quip', 'whiz', 'myth', 'hymn', 'onyx',
  'glyph', 'crypt', 'fjord', 'nymph', 'sylph', 'lymph', 'psych', 'tryst', 'jazzy', 'fuzzy', 'waltz', 'kayak',
  'rhythm', 'zephyr', 'quartz', 'zigzag', 'jigsaw', 'sphinx', 'syzygy', 'squawk', 'jockey', 'buzzer', 'sizzle', 'puzzle',
]);
export const COMMON_PER_LENGTH = 500;
// v2 A2: every word is played with this many seeds, the same seeds at every tier.
export const SEEDS_PER_WORD = 8;
// Strength cap (v2 A2): her temperament may cost each tier at most this much win rate on
// sets b and d against the strict A1 policy, on top of the tier-order gate.
export const STRENGTH_CAP = 0.02;

const sizeOf = (entriesByLength, word) => entriesByLength[word.length].find(entry => entry.word === word).size;

export async function wordSets(entriesByLength, seed = DEFAULT_SEED) {
  const manifest = JSON.parse(await readFile(resolve(CLIENT, 'src/data/words.json'), 'utf8'));
  const accepted = word => isAcceptedWord(word, entriesByLength[word.length] ?? []);
  const manifestWords = manifest.words.map(record => record.word);
  const rejectedTrickster = TRICKSTER_WORDS.filter(word => !accepted(word));
  if (rejectedTrickster.length) throw new Error(`Trickster words outside the accepted list: ${rejectedTrickster}`);
  // ESDB has no frequency rank finer than size 35, its smallest bucket, so
  // "most common" means size 35 and "top 500" is a seeded sample per length.
  const common = [];
  for (let length = MIN_WORD_LENGTH; length <= 6; length++) {
    const pool = entriesByLength[length].filter(entry => entry.size <= 35);
    common.push(...sampleWords(pool, COMMON_PER_LENGTH, seed + 1000 + length).map(entry => entry.word).sort());
  }
  const balanced = tierSamples(entriesByLength, 100, seed);
  return {
    sampleSha256I3b: sha256(balanced),
    manifestRejected: manifestWords.filter(word => !accepted(word)),
    sets: {
      a: { name: 'manifest', description: 'Accepted words among the 105 Hangman manifest words',
        words: manifestWords.filter(accepted) },
      b: { name: 'common', description: `Size-35 words of length ${MIN_WORD_LENGTH}-6, seeded sample of ${COMMON_PER_LENGTH} per length (all of them when fewer)`,
        words: common },
      c: { name: 'trickster', description: 'Hand-picked short words with rare letters (accepted list only)',
        words: [...TRICKSTER_WORDS] },
      d: { name: 'balanced', description: `The I3b sample: 100 words per length ${MIN_WORD_LENGTH}-${MAX_WORD_LENGTH} per size band (common/medium/rare)`,
        words: Object.values(balanced).flatMap(bands => WORD_BANDS.flatMap(band => bands[band.name].map(entry => entry.word))) },
    },
  };
}

const mean = values => values.reduce((a, b) => a + b, 0) / (values.length || 1);
const rounded = value => Number(value.toFixed(4));
const rate = games => (games.length ? rounded(mean(games.map(game => Number(game.won)))) : null);

function summary(games) {
  const wins = games.filter(game => game.won);
  return {
    games: games.length, wins: wins.length,
    winRate: rounded(wins.length / (games.length || 1)),
    averageMisses: rounded(mean(games.map(game => game.misses))),
    averageTurns: rounded(mean(games.map(game => game.turns))),
    outOfTierGames: games.filter(game => !game.inVocabulary).length,
    inTierWinRate: rate(games.filter(game => game.inVocabulary)),
    outOfTierWinRate: rate(games.filter(game => !game.inVocabulary)),
    gamesUsingFallback: games.filter(game => game.candidateSizes.includes(0)).length,
  };
}

// How a round feels: how close her wins are, and how often it comes down to the last miss.
export function feel(games) {
  const missesAtWin = Object.fromEntries([0, 1, 2, 3, 4, 5].map(misses =>
    [misses, games.filter(game => game.won && game.misses === misses).length]));
  const wonOnLastChance = missesAtWin[5];
  const lost = games.filter(game => !game.won).length;
  const fallback = games.filter(game => game.candidateSizes.includes(0)).length;
  return {
    games: games.length, missesAtWin,
    missesAtWinShare: Object.fromEntries(Object.entries(missesAtWin).map(([misses, count]) =>
      [misses, rounded(count / ((games.length - lost) || 1))])),
    wonOnLastChance, lost,
    decidedOnLastMissShare: rounded((wonOnLastChance + lost) / games.length),
    wonOnLastChanceShare: rounded(wonOnLastChance / games.length),
    fallbackShare: rounded(fallback / games.length),
  };
}

// Her temperament with `seeds` shared seeds per word, and the strict A1 policy once per word
// as the reference for the strength cap. `temperaments` overrides the tiers' own (tuning).
export function playSets(entriesByLength, sets, { seeds = SEEDS_PER_WORD, baseSeed = DEFAULT_SEED, temperaments = {}, strictReference = true } = {}) {
  const knowledge = {};
  const know = (word, tier) => (knowledge[`${tier.maxSize}:${word.length}`] ??=
    createKnowledge(entriesByLength[word.length], tier.maxSize));
  const results = {};
  const games = {};
  const words = {};
  const reference = {};
  for (const tier of VOCABULARY_TIERS) {
    const temperament = temperaments[tier.id] ?? tier.temperament;
    results[tier.id] = {};
    games[tier.id] = {};
    words[tier.id] = {};
    reference[tier.id] = {};
    for (const [key, set] of Object.entries(sets)) {
      // Fixed clock: timing is measured in the browser pass, not here.
      const played = set.words.flatMap(word => Array.from({ length: seeds }, (_, index) =>
        simulate(word, know(word, tier), { seed: roundSeed(baseSeed, word, index), temperament }, () => 0)));
      games[tier.id][key] = played;
      words[tier.id][key] = perWord(played);
      results[tier.id][key] = { ...summary(played), variety: variety(played) };
      if (strictReference) reference[tier.id][key] = summary(set.words.map(word => simulate(word, know(word, tier), 'count', () => 0)));
      if (key === 'b' || key === 'c') {
        results[tier.id][`${key}ByLength`] = Object.fromEntries([...new Set(set.words.map(word => word.length))]
          .map(length => [length, summary(played.filter(game => game.word.length === length))]));
      }
    }
    results[tier.id].feelOnD = feel(games[tier.id].d);
  }
  return { results, games, words, reference, know };
}

// The strength cap on sets b and d: win rate lost against the strict A1 policy.
export function strengthCap(results, reference, limit = STRENGTH_CAP) {
  const rows = VOCABULARY_TIERS.flatMap(tier => ['b', 'd'].map(key => {
    const drop = reference[tier.id][key].winRate - results[tier.id][key].winRate;
    return { tier: tier.id, set: key, a1: reference[tier.id][key].winRate, temperament: results[tier.id][key].winRate,
      drop: rounded(drop), ok: drop <= limit + 1e-9 };
  }));
  return { limit, passed: rows.every(row => row.ok), rows };
}

// Tier-order gate cells (v2 decisions, Amendments 2): set a overall; sets b and c
// overall and per length 4-6; set d per length 4-15 and per length x size band.
export function gateCells(games, bandOf) {
  const pick = (key, keep) => Object.fromEntries(VOCABULARY_TIERS.map(tier =>
    [tier.id, games[tier.id][key].filter(keep)]));
  const all = () => true;
  const cells = [{ set: 'a', slice: 'all', games: pick('a', all) }];
  for (const key of ['b', 'c']) {
    cells.push({ set: key, slice: 'all', games: pick(key, all) });
    for (let length = MIN_WORD_LENGTH; length <= 6; length++) {
      cells.push({ set: key, slice: `length ${length}`, games: pick(key, game => game.word.length === length) });
    }
  }
  for (let length = MIN_WORD_LENGTH; length <= MAX_WORD_LENGTH; length++) {
    cells.push({ set: 'd', slice: `length ${length}`, games: pick('d', game => game.word.length === length) });
    for (const band of WORD_BANDS) {
      cells.push({ set: 'd', slice: `length ${length} ${band.name}`,
        games: pick('d', game => game.word.length === length && bandOf(game.word) === band.name) });
    }
  }
  return cells;
}

// 3 sampled words per length (one per size band, the first of each I3b band):
// in-tier and out-of-tier words for Apprentice and Scholar at every length.
// Each case has its seed; the harness makes the page's newLocalSeed return it.
export function parityCases(entriesByLength, balancedWords, know, baseSeed = DEFAULT_SEED) {
  const words = [];
  for (let length = MIN_WORD_LENGTH; length <= MAX_WORD_LENGTH; length++) {
    for (const band of WORD_BANDS) {
      words.push(balancedWords.find(word => word.length === length &&
        sizeOf(entriesByLength, word) >= band.min && sizeOf(entriesByLength, word) <= band.max));
    }
  }
  return VOCABULARY_TIERS.flatMap(tier => words.map(word => {
    const seed = roundSeed(baseSeed, word, 0);
    const game = simulate(word, know(word, tier), { seed }, () => 0);
    return { word, tier: tier.id, seed, size: sizeOf(entriesByLength, word), inTier: game.inVocabulary,
      fallback: game.candidateSizes.includes(0), expected: game.guesses, expectedOutcome: game.won ? 'solved' : 'failed' };
  }));
}

export async function runPages(cases) {
  const scratch = await mkdtemp(join(tmpdir(), 'illucia-parity-'));
  const input = join(scratch, 'input.json');
  const output = join(scratch, 'output.json');
  await writeFile(input, JSON.stringify({ wordsDir: resolve(CLIENT, 'public/illucia/words'),
    tiers: VOCABULARY_TIERS.map(tier => tier.id), cases }));
  process.env.ILLUCIA_PARITY_INPUT = input;
  process.env.ILLUCIA_PARITY_OUTPUT = output;
  const cwd = process.cwd();
  process.chdir(CLIENT);
  try {
    const { startVitest } = await import(pathToFileURL(resolve(CLIENT, 'node_modules/vitest/dist/node.js')));
    const vitest = await startVitest('test', [], { run: true, watch: false, root: CLIENT,
      config: resolve(CLIENT, 'vitest.config.js'), include: [PARITY_HARNESS], reporters: ['default'] });
    const failed = vitest?.state.getCountOfFailedTests() ?? 1;
    await vitest?.close();
    if (failed) throw new Error('Parity harness failed to run.');
    return JSON.parse(await readFile(output, 'utf8'));
  } finally {
    process.chdir(cwd);
    await rm(scratch, { recursive: true, force: true });
  }
}

export function compareParity(cases, observed) {
  const key = value => `${value.tier}:${value.word}`;
  const expected = new Map(cases.map(value => [key(value), value]));
  const pages = {};
  for (const page of ['illucia', 'illucia-observatory']) {
    const rows = observed.filter(value => value.page === page);
    const mismatches = rows.filter(row => {
      const want = expected.get(key(row));
      return row.guesses !== want.expected || row.outcome !== want.expectedOutcome;
    }).map(row => ({ ...row, expected: expected.get(key(row)).expected, expectedOutcome: expected.get(key(row)).expectedOutcome }));
    // Control on the same page recordings: Apprentice games compared against
    // Master's sequence for the same word must differ somewhere, or the
    // comparison could not detect a knowledge/fallback divergence.
    const masterFor = new Map(cases.filter(value => value.tier === 'master').map(value => [value.word, value.expected]));
    const controlDifferences = rows.filter(row => row.tier === 'apprentice' && row.guesses !== masterFor.get(row.word)).length;
    pages[page] = {
      cases: rows.length, matches: rows.length - mismatches.length, mismatches,
      missingCases: cases.length - rows.length,
      fallbackCases: rows.filter(row => expected.get(key(row)).fallback).length,
      outOfTierCases: rows.filter(row => !expected.get(key(row)).inTier).length,
      control: { description: 'Apprentice page sequences vs Master benchmark sequences for the same words', differing: controlDifferences },
    };
  }
  return pages;
}

export async function strength({ seed = DEFAULT_SEED, pages = true, seeds = SEEDS_PER_WORD, temperaments = {} } = {}) {
  const { entriesByLength, manifestSha256 } = await loadLexicons();
  const { sets, sampleSha256I3b, manifestRejected } = await wordSets(entriesByLength, seed);
  const { results, games, words, reference, know } = playSets(entriesByLength, sets, { seeds, baseSeed: seed, temperaments });
  const bandOf = word => WORD_BANDS.find(band =>
    sizeOf(entriesByLength, word) >= band.min && sizeOf(entriesByLength, word) <= band.max).name;
  const gate = tierGate(gateCells(words, bandOf));
  const cap = strengthCap(results, reference);
  const cases = parityCases(entriesByLength, sets.d.words, know, seed);
  const report = {
    configuration: { seed, policy: 'temperament', seedsPerWord: seeds, seedDerivation: 'roundSeed(seed, word, index)',
      temperaments: Object.fromEntries(VOCABULARY_TIERS.map(tier => [tier.id, temperaments[tier.id] ?? tier.temperament])),
      strictReference: 'count (A1), one game per word', parityPolicy: 'temperament, seed roundSeed(seed, word, 0) per case',
      tiers: VOCABULARY_TIERS, manifestSha256, sampleSha256I3b, commonPerLength: COMMON_PER_LENGTH },
    environment: { node: process.version, platform: process.platform, architecture: process.arch },
    sets: Object.fromEntries(Object.entries(sets).map(([key, set]) => [key, {
      ...set, count: set.words.length, sha256: sha256(set.words),
      byLength: Object.fromEntries([...new Set(set.words.map(word => word.length))].sort((a, b) => a - b)
        .map(length => [length, set.words.filter(word => word.length === length).length])),
      bySize: Object.fromEntries([...new Set(set.words.map(word => sizeOf(entriesByLength, word)))].sort((a, b) => a - b)
        .map(size => [size, set.words.filter(word => sizeOf(entriesByLength, word) === size).length])),
    }])),
    manifestRejected,
    results,
    reference,
    gate,
    cap,
    hardestTrickster: Object.fromEntries(VOCABULARY_TIERS.map(tier => [tier.id,
      words[tier.id].c.filter(entry => entry.won < 1).map(entry => ({ word: entry.word, winRate: rounded(entry.won) }))])),
    parity: { cases },
  };
  for (const tier of VOCABULARY_TIERS) {
    console.error(`${tier.label}: ` + Object.keys(sets).map(key =>
      `${key} ${(results[tier.id][key].winRate * 100).toFixed(1)}% (A1 ${(reference[tier.id][key].winRate * 100).toFixed(1)}%)`).join(', ') +
      ` | d: ${results[tier.id].d.variety.distinctSequencesPerWord} sequences/word, ` +
      `${results[tier.id].d.variety.openings.distinct} openings (${results[tier.id].d.variety.openings.entropyBits} bits)`);
  }
  console.error(`Strength cap (${cap.limit * 100} points on b and d): ${cap.passed ? 'PASS' : 'FAIL'}` +
    cap.rows.filter(row => !row.ok).map(row => ` ${row.tier} ${row.set} -${(row.drop * 100).toFixed(1)}`).join(''));
  console.error(`Tier gate: ${gate.passed ? 'PASS' : 'FAIL'} (${gate.failures.length} of ${gate.comparisons} ` +
    `comparisons fail, ${gate.nearMisses.length} near misses, lower tier ahead in ${gate.lowerTierAhead})`);
  for (const row of gate.failures) {
    console.error(`  FAIL ${row.set} ${row.slice}: ${row.higher} ${row.higherWins} vs ${row.lower} ${row.lowerWins} ` +
      `of ${row.words} (difference ${row.difference}, Holm p ${row.holmP})`);
  }
  if (pages) {
    report.parity.pages = compareParity(cases, await runPages(cases));
    for (const [page, value] of Object.entries(report.parity.pages)) {
      console.error(`Parity ${page}: ${value.matches}/${value.cases} match, ${value.mismatches.length} mismatches, ` +
        `${value.missingCases} missing; control differing ${value.control.differing}`);
    }
  }
  return report;
}

// ---- Speed (--speed): the production build in a throttled headless browser. ----
// Timing is not deterministic; it goes to its own report. Needs a running
// `vite preview` of a fresh `npm run build` and a Chromium browser (Edge here).

const quantile = (values, fraction) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? null;
};
const stats = values => ({ n: values.length, p50: rounded(quantile(values, 0.5)), p95: rounded(quantile(values, 0.95)),
  max: rounded(Math.max(...values)) });

async function devtools(port) {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = targets.find(target => target.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* The browser is still starting. */ }
    await new Promise(done => setTimeout(done, 200));
  }
  throw new Error('No DevTools page target.');
}

function connect(url) {
  const socket = new WebSocket(url);
  let id = 0;
  const pending = new Map();
  const listeners = new Set();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve: done, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message)); else done(message.result);
    } else for (const listener of listeners) listener(message);
  });
  const send = (method, params = {}) => new Promise((done, reject) => {
    pending.set(++id, { resolve: done, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  return new Promise(ready => socket.addEventListener('open', () => ready({ send, on: listener => listeners.add(listener),
    close: () => socket.close() })));
}

// Runs before the bundle: times the synchronous body of every 1100 ms timer
// callback. On /illucia that timer is her thinking pause, and its callback runs
// guess(): toPublicState, analyzeDecision, applyGuess and the page's bookkeeping.
const TIMER_PROBE = `(() => {
  const original = window.setTimeout;
  window.__turns = [];
  window.setTimeout = function (callback, delay, ...rest) {
    if (delay !== 1100 || typeof callback !== 'function') return original.call(this, callback, delay, ...rest);
    return original.call(this, function (...args) {
      const start = performance.now();
      try { return callback.apply(this, args); } finally { window.__turns.push(performance.now() - start); }
    }, delay, ...rest);
  };
})();`;

// In-page player: pick the tier, submit the word, show every hit, answer every miss.
const PLAY = `async (word, tier) => {
  const wait = ms => new Promise(done => setTimeout(done, ms));
  const input = document.querySelector('#duel-secret');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, word);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  document.querySelector('input[name="duel-tier"][value="' + tier + '"]').click();
  window.__turns = [];
  // Her first guess is on screen when its reasoning note renders (hit or miss).
  let firstTurn = null;
  const observer = new MutationObserver(() => {
    if (firstTurn === null && document.querySelector('.duel-bubble small')) {
      firstTurn = performance.now() - submitted;
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  const submitted = performance.now();
  document.querySelector('.duel-composer button[type="submit"]').click();
  for (let step = 0; step < 4000; step++) {
    const title = document.querySelector('#duel-result-title');
    if (title) {
      const guesses = [...document.querySelectorAll('.duel-board-caption')].map(node => /^Turn \\d+ · ([A-Z])/.exec(node.textContent))
        .filter(Boolean).map(match => match[1].toLowerCase()).join('');
      const result = { word, tier, outcome: title.textContent, guesses, firstTurn, turns: window.__turns };
      [...document.querySelectorAll('button')].find(button => button.textContent === 'Play again').click();
      await wait(50);
      return result;
    }
    const tile = document.querySelector('button.duel-tile.hidden');
    const reply = document.querySelector('.duel-replies button');
    if (tile) tile.click(); else if (reply) reply.click();
    await wait(tile || reply ? 0 : 25);
  }
  throw new Error('Round did not finish: ' + word);
}`;

export async function speed({ baseUrl = 'http://localhost:4173', productionUrl = 'https://hangman.spyrostrimis.com',
  browser = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', length = 8, games = 30, seed = DEFAULT_SEED,
  port = 9333, cpuThrottling = 4 } = {}) {
  const { spawn } = await import('node:child_process');
  const { entriesByLength, manifestSha256 } = await loadLexicons();
  const words = Object.values(tierSamples(entriesByLength, 100, seed)[length]).flat().map(entry => entry.word);
  const chosen = sampleWords(words, games, seed + 2000).sort();
  const profile = await mkdtemp(join(tmpdir(), 'illucia-speed-'));
  const child = spawn(browser, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
  let client;
  try {
    client = await connect(await devtools(port));
    const { send, on } = client;
    const transfers = new Map();
    const urls = new Map();
    on(message => {
      if (message.method === 'Network.responseReceived') urls.set(message.params.requestId, message.params.response);
      if (message.method === 'Network.loadingFinished') {
        const response = urls.get(message.params.requestId);
        if (response && /\/illucia\/words\/\d+\.txt/.test(response.url)) {
          transfers.set(response.url, { transferred: message.params.encodedDataLength,
            encoding: response.headers['content-encoding'] ?? response.headers['Content-Encoding'] ?? null,
            status: response.status });
        }
      }
      // Stand-in session: the Illucia pages are for registered players only.
      if (message.method === 'Fetch.requestPaused') {
        const me = /\/user\/me$/.test(new URL(message.params.request.url).pathname);
        const body = JSON.stringify(me ? { user: { id: 'speed', username: 'speedtest', score: 0 } } : { message: 'Not available' });
        send('Fetch.fulfillRequest', { requestId: message.params.requestId, responseCode: me ? 200 : 404,
          responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(body).toString('base64') });
      }
    });
    await send('Network.enable');
    await send('Network.setCacheDisabled', { cacheDisabled: true });
    await send('Page.enable');
    await send('Runtime.enable');

    // Transfer sizes as a browser receives them from production (unthrottled; read-only GETs).
    await send('Page.navigate', { url: `${productionUrl}/illucia/words/manifest.json` });
    await new Promise(done => setTimeout(done, 3000));
    const decoded = {};
    for (let n = 3; n <= 15; n++) {
      const { result } = await send('Runtime.evaluate', { expression: `fetch('/illucia/words/${n}.txt', { cache: 'no-store' }).then(r => r.text()).then(t => t.length)`,
        awaitPromise: true, returnByValue: true });
      decoded[n] = result.value;
    }
    await new Promise(done => setTimeout(done, 500));
    const production = {};
    for (let n = 3; n <= 15; n++) {
      const raw = (await readFile(resolve(CLIENT, `public/illucia/words/${n}.txt`))).length;
      const seen = transfers.get(`${productionUrl}/illucia/words/${n}.txt`);
      production[n] = { rawBytes: raw, decodedBytes: decoded[n], transferredBytes: seen?.transferred ?? null, contentEncoding: seen?.encoding ?? null, status: seen?.status ?? null };
    }

    // The production build, throttled, at phone size.
    await send('Fetch.enable', { patterns: [{ urlPattern: `${baseUrl}/user/*` }] });
    await send('Emulation.setDeviceMetricsOverride', { width: 360, height: 800, deviceScaleFactor: 2, mobile: true });
    await send('Emulation.setCPUThrottlingRate', { rate: cpuThrottling });
    await send('Page.addScriptToEvaluateOnNewDocument', { source: TIMER_PROBE });
    await send('Page.navigate', { url: `${baseUrl}/illucia` });
    for (let attempt = 0; attempt < 100; attempt++) {
      const { result } = await send('Runtime.evaluate', { expression: `Boolean(document.querySelector('#duel-secret'))`, returnByValue: true });
      if (result.value) break;
      await new Promise(done => setTimeout(done, 200));
    }
    const rounds = [];
    for (const word of chosen) {
      const { result, exceptionDetails } = await send('Runtime.evaluate', {
        expression: `(${PLAY})(${JSON.stringify(word)}, 'master')`, awaitPromise: true, returnByValue: true });
      if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
      rounds.push(result.value);
      console.error(`${word}: ${result.value.guesses} ${result.value.outcome}`);
    }
    await send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const preview = transfers.get(`${baseUrl}/illucia/words/${length}.txt`) ?? null;
    const knowledge = createKnowledge(entriesByLength[length], 70);
    const mismatches = rounds.filter(round => simulate(round.word, knowledge, 'count', () => 0).guesses !== round.guesses)
      .map(round => round.word);
    const { result: agent } = await send('Runtime.evaluate', { expression: 'navigator.userAgent', returnByValue: true });
    return {
      configuration: { page: '/illucia (production build via vite preview)', tier: 'master', length,
        lengthWords: entriesByLength[length].length, games: chosen.length, seed, manifestSha256,
        viewport: '360x800 @2x, mobile emulation', cpuThrottling, networkThrottling: 'none', cacheDisabled: true,
        caveat: 'CPU throttling is DevTools emulation on a desktop CPU, not a physical phone.' },
      environment: { node: process.version, platform: process.platform, browser: agent.value },
      words: chosen,
      turnMilliseconds: {
        all: stats(rounds.flatMap(round => round.turns)),
        firstTurn: stats(rounds.map(round => round.turns[0])),
        laterTurns: stats(rounds.flatMap(round => round.turns.slice(1))),
      },
      firstTurnMilliseconds: {
        description: 'Submit click to her first guess on screen, minus the 1100 ms thinking pause; includes fetch, parse, knowledge build, first decision and renders.',
        coldFirstGame: rounds.length ? rounds[0].firstTurn - 1100 : null,
        all: stats(rounds.map(round => round.firstTurn - 1100)),
      },
      guessSequenceMismatchesVsBenchmark: mismatches,
      outcomes: { solved: rounds.filter(round => round.outcome === 'Illucia wins').length,
        failed: rounds.filter(round => round.outcome !== 'Illucia wins').length },
      previewTransfer: preview && { url: `${baseUrl}/illucia/words/${length}.txt`, ...preview },
      productionTransfers: production,
      rounds: rounds.map(({ word, guesses, outcome, firstTurn, turns }) => ({ word, guesses, outcome,
        firstTurn: rounded(firstTurn), turns: turns.map(rounded) })),
    };
  } finally {
    client?.close();
    child.kill();
    await new Promise(done => setTimeout(done, 1000));
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }
}

async function main() {
  const options = {};
  let output = null;
  let mode = 'strength';
  for (let i = 2; i < process.argv.length; i++) {
    const flag = process.argv[i];
    if (flag === '--no-pages') { options.pages = false; continue; }
    if (flag === '--temperaments') { options.temperaments = JSON.parse(process.argv[++i]); continue; }
    if (flag === '--speed') { mode = 'speed'; continue; }
    const value = process.argv[++i];
    if (value === undefined) throw new Error(`Missing value for ${flag}`);
    if (flag === '--seed') options.seed = Number(value);
    else if (flag === '--seeds') options.seeds = Number(value);
    else if (flag === '--output') output = resolve(value);
    else if (flag === '--base-url') options.baseUrl = value;
    else if (flag === '--browser') options.browser = value;
    else if (flag === '--games') options.games = Number(value);
    else if (flag === '--cpu-throttling') options.cpuThrottling = Number(value);
    else throw new Error(`Unknown option ${flag}`);
  }
  output ??= fileURLToPath(new URL(mode === 'speed' ? 'benchmarks/illucia-strength-speed.json'
    : 'benchmarks/illucia-strength.json', import.meta.url));
  const report = mode === 'speed' ? await speed(options) : await strength(options);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(`Report: ${output}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
