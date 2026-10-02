// Illucia's yes/no questions (v2 B2): "Can your word mean a bird?". Labels come from the
// static WordNet files (tools/ILLUCIA-LABELS.md): a word is YES for a category if any of its
// meanings belongs to it, and a word missing from the file is unknown to WordNet.
import { assertPublicState } from './public-state.js';
import { filterCandidates } from './candidates.js';

export const MAX_QUESTIONS = 2;  // offers per round; declined offers count
export const MIN_SHARE = 0.25;   // each answer must rule out this share of her weight (start)
export const EARLIEST_TURN = 2;  // letters she guesses before her first question
export const KINDS = Object.freeze(['noun', 'verb', 'adjective']);
const ANSWERS = Object.freeze(['yes', 'no', 'declined']);

export function parseCategories(spec) {
  const list = spec?.categories;
  if (!Array.isArray(list) || list.length === 0) throw new TypeError('Invalid question categories.');
  const codes = new Set();
  return Object.freeze(list.map(({ code, key, kind, question }) => {
    if (!/^[a-zA-Z]$/.test(code) || codes.has(code) || typeof key !== 'string' ||
        !KINDS.includes(kind) || typeof question !== 'string') {
      throw new TypeError('Invalid question category.');
    }
    codes.add(code);
    return Object.freeze({ code, key, kind, question });
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
// questions already offered. Never the secret word. Returns null when no question
// splits her candidates reasonably, or when she may not ask (yet).
export function chooseQuestion(publicState, knowledge, labels, categories, offers, options = {}) {
  assertPublicState(publicState);
  const { kinds = ['noun'], minShare = MIN_SHARE, earliestTurn = EARLIEST_TURN,
    maxQuestions = MAX_QUESTIONS } = options;
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
  let best = null;
  for (const category of categories) {
    if (!kinds.includes(category.kind) || offered.has(category.code)) continue;
    const yesWeight = yes.get(category.code) ?? 0;
    const noWeight = labelled - yesWeight;
    if (yesWeight < minShare * total || noWeight < minShare * total) continue;
    // Best worst case: the answer that rules out less should still rule out the most.
    const worst = Math.min(yesWeight, noWeight);
    if (!best || worst > best.worst) best = { category, yesWeight, noWeight, worst };
  }
  if (!best) return null;
  return Object.freeze({ code: best.category.code, key: best.category.key, kind: best.category.kind,
    question: best.category.question, yesWeight: best.yesWeight, noWeight: best.noWeight,
    unknownWeight: total - labelled, totalWeight: total, candidateCount: candidates.length });
}

// Game code's side: checks the player's answer against the labels. It takes the secret,
// so it must never feed her choices except through the answer recorded in the history.
// 'yes' / 'no', or null when WordNet doesn't know the word (no bonus possible).
export function checkAnswer(labels, secret, code) {
  const codes = labels.get(secret);
  return codes === undefined ? null : codes.includes(code) ? 'yes' : 'no';
}
