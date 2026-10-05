// Illucia's AI meaning question (v2 Track D): a model invents a yes/no question over her
// candidates and sorts them. Shared by the Worker (D2) and the offline model test (D1, which
// adds scoring in tools/lib/illucia-question-model.js). Pure: prompts, request bodies, reply
// normalization and validation. The request carries the candidate list only: never the
// board, the answer or the player.

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

// Added to the invent prompt only when there are earlier questions this round (2026-10-05), so
// the prompt D1 measured is unchanged without them.
export const AVOID_INSTRUCTION = 'The "avoid" field lists questions already asked this round: ask a different question, not one of those.';

// `options` are the model's own request settings (e.g. a reasoning effort), merged last.
// `avoid`: questions already asked this round (invent mode only).
/** @param {string} mode @param {string[]} candidates @param {{ question?: string | null, maxTokens: number, options?: object, avoid?: string[] }} settings */
export function questionInput(mode, candidates, { question = null, maxTokens, options = {}, avoid = [] } = {}) {
  assertCandidates(candidates);
  if (!Number.isInteger(maxTokens) || maxTokens < 1) throw new RangeError('maxTokens is required.');
  let user;
  if (mode === 'invent') {
    if (question !== null) throw new Error('Invent mode takes no question.');
    user = { count: candidates.length, candidates, ...(avoid.length ? { avoid } : {}) };
  } else if (mode === 'sort') {
    if (typeof question !== 'string' || !question.endsWith('?')) throw new Error('Sort mode needs a question.');
    user = { question, count: candidates.length, candidates };
  } else throw new Error('Unknown question mode.');
  return {
    messages: [
      { role: 'system', content: mode === 'invent' ? (avoid.length ? `${INVENT_PROMPT}\n${AVOID_INSTRUCTION}` : INVENT_PROMPT) : SORT_PROMPT },
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
    // With reasoning switched off, Qwen3's provider parser returns the whole reply in the
    // reasoning field and null content (seen 2026-10-02). Only a normal stop with empty
    // content is read this way, and it is labelled so every such reply can be found.
    if (!text && finishReason === 'stop' && typeof reasoning === 'string' && reasoning) {
      text = reasoning;
      reasoningChars = 0;
      envelope = 'choices-reasoning-field';
    }
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
// Grammar is not meaning: "Can your word mean a verb?" asks about the word, not what it means.
const GRAMMAR_TALK = /\b(nouns?|verbs?|adjectives?|adverbs?|pronouns?|prepositions?|conjunctions?|interjections?|parts? of speech|singular|tenses?|prefix\w*|suffix\w*|grammar\w*|describing words?)\b/i;
// Openings accepted since 2026-10-04 (owner's decision): any wording that asks what the word
// can be or stand for. The prompt still asks for "Can your word mean".
const OPENING = /^can your word (mean|be|refer to|describe|stand for|name)\b/i;

// Blocked: LDNOOBW entries and project block terms, matched as whole words or phrases.
export function questionProblems(question, blocked = []) {
  const problems = [];
  if (typeof question !== 'string') return ['not-a-string'];
  if (question.length > MAX_QUESTION_LENGTH) problems.push('too-long');
  if (!OPENING.test(question.trim())) problems.push('wrong-opening');
  if (!question.trim().endsWith('?')) problems.push('no-question-mark');
  if (!/^[\x20-\x7e]+$/.test(question)) problems.push('non-ascii');
  if (LETTER_TALK.test(question) || /["'][a-z]["']/i.test(question)) problems.push('about-letters');
  if (GRAMMAR_TALK.test(question)) problems.push('about-grammar');
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

// Short words a question may use; every longer word must be one of Illucia's accepted words,
// which are already profanity-filtered (LDNOOBW, ESDB's offensive groups, the project list).
export const QUESTION_SHORT_WORDS = Object.freeze(new Set(('a an the or of to in on for and can be you it its is as by at '
  + 'any one two way kind type act art pet toy car bus sea sky sun day age job use eat dog cat set fun old new big red tea '
  + 'oil gas ice war law who out how not are has had was all off up get own sit run fly few low top end').split(' ')));

// The words of a question that are neither short allowlisted words nor known words.
// A possessive 's is dropped first ("a person's name" checks "person").
export function questionVocabularyProblems(question, isKnownWord) {
  return question.toLowerCase().replace(/'s\b/g, '').split(/[^a-z]+/).filter(Boolean)
    .filter(word => (word.length <= 3 ? !QUESTION_SHORT_WORDS.has(word) : !isKnownWord(word)));
}
