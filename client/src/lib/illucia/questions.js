// Illucia's yes/no questions (v2 B2): "Can your word mean a bird?". Labels come from the
// static WordNet files (tools/ILLUCIA-LABELS.md): a word is YES for a category if any of its
// meanings belongs to it, and a word missing from the file is unknown to WordNet.
import { assertPublicState } from './public-state.js';
import { filterCandidates } from './candidates.js';
import { randomStream, weightedIndex } from './random.js';

export const MAX_QUESTIONS = 2;  // offers per round; declined offers count
export const EARLIEST_TURN = 2;  // letters she guesses before her first question
// Her question rules (owner decision 2026-10-03). Shares are hundredths of a percent of her
// candidate weight. A broad category (a whole WordNet lexicographer file: person, man-made
// object, ...) needs 25% on each side and waits until she has at most 2 misses left; a narrow
// one ("kind of": bird, fruit, ...) needs 10% and gets a 10-point bonus. With a round seed she
// picks among the questions within 10 points of her best, better ones more likely.
export const QUESTION_RULES = Object.freeze({
  broadFloor: 2500, narrowFloor: 1000, holdBroadUntil: 2, narrowBonus: 1000, shortlist: 1000,
});
// B2's first rules (benchmark comparison): 25% for every category, no holding, strictly the best.
export const B2_RULES = Object.freeze({
  broadFloor: 2500, narrowFloor: 2500, holdBroadUntil: null, narrowBonus: 0, shortlist: 0,
});
// Her letter uses randomStream(seed, turn); questions use a salted seed, so the two draws differ.
const QUESTION_SALT = 0x51ed270b;
export const KINDS = Object.freeze(['noun', 'verb', 'adjective']);
const ANSWERS = Object.freeze(['yes', 'no', 'declined']);

export function parseCategories(spec) {
  const list = spec?.categories;
  if (!Array.isArray(list) || list.length === 0) throw new TypeError('Invalid question categories.');
  const codes = new Set();
  return Object.freeze(list.map(({ code, key, kind, question, lexfiles, kindOf }) => {
    if (!/^[a-zA-Z]$/.test(code) || codes.has(code) || typeof key !== 'string' ||
        !KINDS.includes(kind) || typeof question !== 'string' || Boolean(lexfiles) === Boolean(kindOf)) {
      throw new TypeError('Invalid question category.');
    }
    codes.add(code);
    // Broad: a whole lexicographer file. Narrow: a "kind of" class.
    return Object.freeze({ code, key, kind, question, broad: Boolean(lexfiles) });
  }));
}

// One length's label file -> Map(word -> codes). '' means WordNet knows the word but no
// category fits; a word that is absent is unknown (its answer cannot be checked).
export function parseLabels(text, length, categories) {
  if (typeof text !== 'string' || (text !== '' && !text.endsWith('\n'))) throw new TypeError('Invalid label text.');
  const order = new Map(categories.map((category, index) => [category.code, index]));
  const labels = new Map();
  let previous = '';
  for (const line of text === '' ? [] : text.slice(0, -1).split('\n')) {
    const match = /^([a-z]+) (-|[a-zA-Z]+)$/.exec(line);
    if (!match || match[1].length !== length || match[1] <= previous) {
      throw new Error('Labels must contain sorted unique words of the requested length.');
    }
    const codes = match[2] === '-' ? '' : match[2];
    let rank = -1;
    for (const code of codes) {
      if (!order.has(code) || order.get(code) <= rank) throw new Error('Unknown or misordered label code.');
      rank = order.get(code);
    }
    previous = match[1];
    labels.set(match[1], codes);
  }
  return labels;
}

function answered(offers, categories) {
  const known = new Set(categories.map(category => category.code));
  const seen = new Set();
  for (const offer of offers) {
    if (!known.has(offer?.code) || !ANSWERS.includes(offer.answer) || seen.has(offer.code)) {
      throw new TypeError('Invalid question history.');
    }
    seen.add(offer.code);
  }
  return offers.filter(offer => offer.answer !== 'declined');
}

// Her vocabulary after the answers so far. YES keeps the words labelled with that category,
// NO keeps those without it; unknown words stay on both sides, and a declined offer tells
// her nothing. Returns the same knowledge shape, so the letter choice works unchanged.
export function narrowKnowledge(knowledge, labels, offers, categories) {
  const answers = answered(offers, categories);
  if (answers.length === 0) return knowledge;
  const words = knowledge.words.filter(word => {
    const codes = labels.get(word);
    return codes === undefined || answers.every(({ code, answer }) => codes.includes(code) === (answer === 'yes'));
  });
  return Object.freeze({ ...knowledge, words: Object.freeze(words) });
}

// Her side of the boundary: public state, her vocabulary, the public labels and the
// questions already offered (and her round seed). Never the secret word. Returns null when
// no question qualifies, or when she may not ask (yet). Without a seed she takes strictly the
// best question (ties by category order).
export function chooseQuestion(publicState, knowledge, labels, categories, offers, options = {}) {
  assertPublicState(publicState);
  const { kinds = ['noun'], earliestTurn = EARLIEST_TURN, maxQuestions = MAX_QUESTIONS, seed = null,
    ...overrides } = options;
  const rules = { ...QUESTION_RULES, ...overrides };
  const narrowed = narrowKnowledge(knowledge, labels, offers, categories);
  if (offers.length >= maxQuestions || publicState.guessedLetters.length < earliestTurn ||
      publicState.missesLeft === 0 || publicState.pattern.every(letter => letter !== null)) {
    return null;
  }
  const candidates = filterCandidates(publicState, narrowed.words);
  if (candidates.length < 2) return null;
  const yes = new Map();
  let total = 0;
  let labelled = 0;
  for (const word of candidates) {
    const weight = knowledge.weights.get(word);
    const codes = labels.get(word);
    total += weight;
    if (codes === undefined) continue;
    labelled += weight;
    for (const code of codes) yes.set(code, (yes.get(code) ?? 0) + weight);
  }
  const offered = new Set(offers.map(offer => offer.code));
  const holding = rules.holdBroadUntil !== null && publicState.missesLeft > rules.holdBroadUntil;
  const choices = [];
  for (const category of categories) {
    if (!kinds.includes(category.kind) || offered.has(category.code)) continue;
    if (category.broad && holding) continue;
    const yesWeight = yes.get(category.code) ?? 0;
    const noWeight = labelled - yesWeight;
    const floor = category.broad ? rules.broadFloor : rules.narrowFloor;
    // Each answer must rule out at least `floor` of the weight (exact integer comparison).
    if (yesWeight * 10000 < floor * total || noWeight * 10000 < floor * total) continue;
    // Best worst case: the answer that rules out less should still rule out the most.
    const share = Math.floor(Math.min(yesWeight, noWeight) * 10000 / total);
    const score = share + (category.broad ? 0 : rules.narrowBonus);
    choices.push({ category, yesWeight, noWeight, share, score });
  }
  if (!choices.length) return null;
  const top = Math.max(...choices.map(option => option.score));
  const cutoff = top - rules.shortlist;
  const varied = seed !== null && rules.shortlist > 0;
  const shortlist = varied ? choices.filter(option => option.score > cutoff) : [choices.find(option => option.score === top)];
  const odds = varied ? shortlist.map(option => option.score - cutoff) : [1];
  const pick = varied ? shortlist[weightedIndex(randomStream((seed ^ QUESTION_SALT) >>> 0,
    publicState.guessedLetters.length), odds)] : shortlist[0];
  const totalOdds = odds.reduce((sum, value) => sum + value, 0);
  const { category } = pick;
  return Object.freeze({ code: category.code, key: category.key, kind: category.kind,
    question: category.question, broad: category.broad,
    // For her lines (E1): a broad question is held back until she is nearly out of misses.
    tag: category.broad ? (rules.holdBroadUntil === null ? 'early-broad' : 'late-broad') : 'early-narrow',
    missesLeft: publicState.missesLeft, share: pick.share, choseBest: pick.score === top,
    yesWeight: pick.yesWeight, noWeight: pick.noWeight, unknownWeight: total - labelled,
    totalWeight: total, candidateCount: candidates.length,
    // What she considered, best first: share and her chance of asking it, hundredths of a percent.
    shortlist: Object.freeze(shortlist.map((option, index) => ({ option, chance: Math.floor(odds[index] * 10000 / totalOdds) }))
      .sort((a, b) => b.option.score - a.option.score || (a.option.category.key < b.option.category.key ? -1 : 1))
      .map(({ option, chance }) => Object.freeze({ key: option.category.key, share: option.share, chance }))) });
}

// Game code's side: checks the player's answer against the labels. It takes the secret,
// so it must never feed her choices except through the answer recorded in the history.
// 'yes' / 'no', or null when WordNet doesn't know the word (no bonus possible).
export function checkAnswer(labels, secret, code) {
  const codes = labels.get(secret);
  return codes === undefined ? null : codes.includes(code) ? 'yes' : 'no';
}
