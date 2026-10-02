// Track D1: a model invents a yes/no meaning question over Illucia's candidates and sorts them.
// Pure: prompts, request bodies, reply validation and scoring against the B1 WordNet labels.
// The request carries the candidate list only: never the board, the answer or the player.

export const QUESTION_PROMPT_VERSION = 'd1-1';
export const MIN_YES_SHARE = 0.25;
export const MAX_YES_SHARE = 0.75;
export const MAX_QUESTION_LENGTH = 120;
export const MAX_REPLY_LENGTH = 6000;
export const SEED = 20261002;

export const INVENT_PROMPT = [
  'You help Illucia, a Hangman player, narrow down a hidden English word by its MEANING. The user message is a JSON object whose "candidates" field lists every word the hidden word could be.',
  '1. Invent ONE yes/no question about what the word can mean: what kind of thing, action or quality it is. Start it with "Can your word mean" and end it with "?". It must not be about letters, spelling, sounds, rhymes or length.',
  '2. A word is YES if ANY of its meanings fits, even a less common one ("crane" is YES for "Can your word mean a bird?"). Otherwise it is NO.',
  '3. Choose a question that puts roughly half of the candidates in YES and half in NO.',
  '4. Put EVERY candidate in exactly one list, spelled exactly as given. Do not add, drop or repeat words.',
  'Reply with only one JSON object and nothing else: {"question": "...", "yes": ["..."], "no": ["..."]}',
].join('\n');

export const SORT_PROMPT = [
  'Sort English words by MEANING. The user message is a JSON object with a yes/no "question" and a "candidates" list.',
  '1. A word is YES if ANY of its meanings fits the question, even a less common one ("crane" is YES for "Can your word mean a bird?"). Otherwise it is NO.',
  '2. Put EVERY candidate in exactly one list, spelled exactly as given. Do not add, drop or repeat words.',
  'Reply with only one JSON object and nothing else: {"yes": ["..."], "no": ["..."]}',
].join('\n');

function assertCandidates(candidates) {
  if (!Array.isArray(candidates) || candidates.length < 2 || candidates.length > 80) {
    throw new RangeError('A question needs 2–80 candidates.');
  }
  for (let i = 0; i < candidates.length; i++) {
    if (typeof candidates[i] !== 'string' || !/^[a-z]{4,15}$/.test(candidates[i])) throw new TypeError('Candidates must be lowercase words.');
    if (i && candidates[i - 1] >= candidates[i]) throw new Error('Candidates must be sorted and unique.');
  }
}

// `options` are the model's own request settings (e.g. a reasoning effort), merged last.
export function questionInput(mode, candidates, { question = null, maxTokens, options = {} } = {}) {
  assertCandidates(candidates);
  if (!Number.isInteger(maxTokens) || maxTokens < 1) throw new RangeError('maxTokens is required.');
  let user;
  if (mode === 'invent') {
    if (question !== null) throw new Error('Invent mode takes no question.');
    user = { count: candidates.length, candidates };
  } else if (mode === 'sort') {
    if (typeof question !== 'string' || !question.endsWith('?')) throw new Error('Sort mode needs a question.');
    user = { question, count: candidates.length, candidates };
  } else throw new Error('Unknown question mode.');
  return {
    messages: [
      { role: 'system', content: mode === 'invent' ? INVENT_PROMPT : SORT_PROMPT },
      { role: 'user', content: JSON.stringify(user) },
    ],
    max_tokens: maxTokens, temperature: 0, seed: SEED, stream: false, ...options,
  };
}

const count = value => (Number.isInteger(value) && value >= 0 ? value : null);

// Provider envelopes differ by model: a text `response`, an OpenAI-style `choices` message
// (content may be null when reasoning used up the tokens), or a Responses-style `output` list.
// Hidden reasoning is measured, never kept. An unknown envelope stops the run (BenchmarkStop
// is passed in to keep this module free of transport code).
export function normalizeQuestionResult(result, Stop = Error) {
  let text;
  let envelope;
  let finishReason = null;
  let reasoningChars = 0;
  const choice = Array.isArray(result?.choices) ? result.choices[0] : undefined;
  if (typeof result?.response === 'string') {
    text = result.response;
    envelope = 'response';
  } else if (choice?.message && typeof choice.message === 'object') {
    text = typeof choice.message.content === 'string' ? choice.message.content : '';
    envelope = 'choices';
    finishReason = choice.finish_reason ?? null;
    const reasoning = choice.message.reasoning_content ?? choice.message.reasoning;
    if (typeof reasoning === 'string') reasoningChars = reasoning.length;
  } else if (Array.isArray(result?.output)) {
    const message = result.output.find(item => item?.type === 'message');
    text = (message?.content ?? []).filter(part => part?.type === 'output_text' && typeof part.text === 'string')
      .map(part => part.text).join('');
    envelope = 'output';
    for (const item of result.output.filter(item => item?.type === 'reasoning')) {
      for (const part of [...(item.content ?? []), ...(item.summary ?? [])]) {
        if (typeof part?.text === 'string') reasoningChars += part.text.length;
      }
    }
    finishReason = result.status ?? null;
  } else throw new Stop('response-format');
  // Some models write their reasoning inline, closed by </think>; only what follows is the reply.
  const close = text.lastIndexOf('</think>');
  if (close >= 0) {
    reasoningChars += close;
    text = text.slice(close + '</think>'.length);
  }
  const usage = result.usage ?? null;
  const prompt = count(usage?.prompt_tokens ?? usage?.input_tokens);
  const completion = count(usage?.completion_tokens ?? usage?.output_tokens);
  return {
    response: text, envelope, finishReason, reasoningChars, providerModel: result.model ?? null,
    usage: prompt === null || completion === null ? null : {
      prompt_tokens: prompt, completion_tokens: completion,
      reasoning_tokens: count(usage?.completion_tokens_details?.reasoning_tokens ?? usage?.output_tokens_details?.reasoning_tokens),
      ...(Number.isFinite(usage?.neurons) ? { neurons: usage.neurons } : {}),
    },
  };
}

// "JSON-ish": the whole reply, or else one object inside a code fence or surrounding prose.
export function extractJson(text) {
  if (typeof text !== 'string' || text.length > MAX_REPLY_LENGTH) return null;
  try { return { value: JSON.parse(text.trim()), strict: true }; } catch { /* lenient below */ }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return { value: JSON.parse(text.slice(start, end + 1)), strict: false }; } catch { return null; }
}

const LETTER_TALK = /\b(letters?|spell\w*|vowels?|consonants?|syllables?|rhym\w*|alphabet\w*|(starts?|begins?|ends?) with|pronounc\w*|plural)\b/i;

// Blocked: LDNOOBW entries and project block terms, matched as whole words or phrases.
export function questionProblems(question, blocked = []) {
  const problems = [];
  if (typeof question !== 'string') return ['not-a-string'];
  if (question.length > MAX_QUESTION_LENGTH) problems.push('too-long');
  if (!/^can your word mean\b/i.test(question.trim())) problems.push('wrong-opening');
  if (!question.trim().endsWith('?')) problems.push('no-question-mark');
  if (!/^[\x20-\x7e]+$/.test(question)) problems.push('non-ascii');
  if (LETTER_TALK.test(question) || /["'][a-z]["']/i.test(question)) problems.push('about-letters');
  const text = ` ${question.toLowerCase().replace(/[^a-z]+/g, ' ')} `;
  if (blocked.some(term => text.includes(` ${term} `))) problems.push('blocked-term');
  return problems;
}

// Outcome is the first failure in this order; production falls back on anything but 'accepted'.
export function validateReply(text, candidates, { mode, blocked = [] }) {
  assertCandidates(candidates);
  const parsed = extractJson(text);
  if (!parsed) return { outcome: 'unparseable', strictJson: false };
  const { value, strict } = parsed;
  const keys = mode === 'invent' ? ['no', 'question', 'yes'] : ['no', 'yes'];
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      !keys.every(key => Object.hasOwn(value, key)) ||
      !Array.isArray(value.yes) || !Array.isArray(value.no) ||
      ![...value.yes, ...value.no].every(word => typeof word === 'string')) {
    return { outcome: 'wrong-shape', strictJson: strict };
  }
  const extraKeys = Object.keys(value).filter(key => !keys.includes(key));
  const question = mode === 'invent' ? value.question : null;
  const problems = mode === 'invent' ? questionProblems(question, blocked) : [];
  const normalize = word => word.trim().toLowerCase();
  const yes = value.yes.map(normalize);
  const no = value.no.map(normalize);
  const known = new Set(candidates);
  const seen = new Map();
  for (const word of [...yes, ...no]) seen.set(word, (seen.get(word) ?? 0) + 1);
  const sets = {
    missing: candidates.filter(word => !seen.has(word)),
    extra: [...seen.keys()].filter(word => !known.has(word)),
    duplicated: [...seen].filter(([, count]) => count > 1).map(([word]) => word),
  };
  const setsOk = !sets.missing.length && !sets.extra.length && !sets.duplicated.length;
  const yesShare = setsOk ? yes.length / candidates.length : null;
  const outcome = problems.length ? 'rejected-question'
    : !setsOk ? 'wrong-lists'
    : yesShare < MIN_YES_SHARE || yesShare > MAX_YES_SHARE ? 'uneven'
    : 'accepted';
  return { outcome, strictJson: strict, extraKeys, question, problems, sets,
    yes: setsOk ? [...yes].sort() : null, no: setsOk ? [...no].sort() : null, yesShare };
}

// Labels: Map word -> code string ('-' = known, no category). Absent = unknown, never scored.
// `codes` is the category union the question was judged equivalent to.
export function scoreSort({ yes, no }, labels, codes) {
  if (!Array.isArray(codes) || !codes.length) throw new Error('Scoring needs category codes.');
  const truth = word => {
    const label = labels.get(word);
    return label === undefined ? null : codes.some(code => label.includes(code));
  };
  const rows = [...yes.map(word => [word, true]), ...no.map(word => [word, false])];
  const score = { labelled: 0, unlabelled: 0, correct: 0, falseYes: 0, falseNo: 0, wordnetYes: 0, wordnetNo: 0 };
  for (const [word, said] of rows) {
    const actual = truth(word);
    if (actual === null) { score.unlabelled++; continue; }
    score.labelled++;
    score[actual ? 'wordnetYes' : 'wordnetNo']++;
    if (said === actual) score.correct++;
    else score[said ? 'falseYes' : 'falseNo']++;
  }
  return score;
}

// Where the round's real word landed, against WordNet. null when WordNet doesn't know it.
export function answerPlacement({ yes }, answer, labels, codes) {
  const label = labels.get(answer);
  if (label === undefined) return null;
  const actual = codes.some(code => label.includes(code));
  const said = yes.includes(answer);
  return { wordnet: actual, said, misfiled: actual !== said };
}

// The sort-only control: the noun category (v1 asks nouns only) whose labelled YES share is
// closest to half; ties by category order. If no noun reaches 10–90%, a question every word
// fails tests nothing, so the closest category of any kind (verb, adjective) is used instead.
export function controlCategory(candidates, labels, categories) {
  const labelled = candidates.filter(word => labels.has(word));
  if (!labelled.length) return null;
  const closest = pool => {
    let best = null;
    for (const category of pool) {
      const share = labelled.filter(word => labels.get(word).includes(category.code)).length / labelled.length;
      if (!best || Math.abs(share - 0.5) < Math.abs(best.labelledYesShare - 0.5)) {
        best = { code: category.code, kind: category.kind, question: category.question, labelledYesShare: share };
      }
    }
    return best;
  };
  const noun = closest(categories.filter(c => c.kind === 'noun'));
  return noun.labelledYesShare >= 0.1 && noun.labelledYesShare <= 0.9 ? noun : closest(categories);
}
