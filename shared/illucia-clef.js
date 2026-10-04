// Cloudflare's Clef decision models as the SORTER for Illucia's AI question (v2 Track D), shared
// by the Worker (D2) and the offline test (D1, tools/benchmark-illucia-clef.js). Clef
// cannot write a question (it returns probabilities, not text); given one, it says for each
// candidate how likely YES is. One "noul" (yes/no) question per candidate, at most 64 per
// request. The request carries the question and the candidates only.

export const CLEF_MODELS = Object.freeze({
  '@cf/cloudflare/clef': 'clef',
  '@cf/cloudflare/clef-flash': 'clef-flash',
});
export const CLEF_MAX_QUESTIONS = 64;
export const CLEF_STATE = 'An English word game. Each question asks about the word it names. '
  + 'A word counts as YES if ANY of its meanings fits, even a less common one ("crane" can mean a bird).';

// "Can your word mean a bird?" → "Can the word "crane" mean a bird?"
export function aboutWord(question, word) {
  if (!/^can your word\b/i.test(question)) throw new Error('Questions must start "Can your word".');
  return question.replace(/^can your word\b/i, `Can the word "${word}"`);
}

export function clefInputs(model, candidates, question) {
  const name = CLEF_MODELS[model];
  if (!name) throw new Error('Not a Clef model.');
  if (!Array.isArray(candidates) || !candidates.length || candidates.some(word => !/^[a-z]{4,15}$/.test(word))) {
    throw new Error('Candidates must be lowercase words.');
  }
  const inputs = [];
  for (let start = 0; start < candidates.length; start += CLEF_MAX_QUESTIONS) {
    const chunk = candidates.slice(start, start + CLEF_MAX_QUESTIONS);
    inputs.push({ model: name, state: CLEF_STATE,
      questions: Object.fromEntries(chunk.map(word => [word, { type: 'noul', instructions: aboutWord(question, word) }])) });
  }
  return inputs;
}

// Clef's usage counts input tokens only; returned in the ledger's shape (also accepted in it).
export function clefUsage(raw) {
  const input = raw?.usage?.input_tokens ?? raw?.usage?.prompt_tokens;
  return Number.isInteger(input) && input >= 0 ? { prompt_tokens: input, completion_tokens: 0 } : null;
}

// Probabilities for the candidates a reply covers; null if any is missing or malformed.
export function clefProbabilities(raw, words) {
  const answers = raw?.answers;
  if (!answers || typeof answers !== 'object') return null;
  const probabilities = {};
  for (const word of words) {
    const value = answers[word]?.noul;
    if (typeof value !== 'number' || !(value >= 0 && value <= 1)) return null;
    probabilities[word] = value;
  }
  return probabilities;
}

// YES at or above the threshold; lists sorted like the candidates.
export function clefSort(probabilities, candidates, threshold = 0.5) {
  const yes = candidates.filter(word => probabilities[word] >= threshold);
  const no = candidates.filter(word => probabilities[word] < threshold);
  return { yes, no, yesShare: yes.length / candidates.length };
}

// Clef's hidden template costs about 90–99 input tokens per question (measured 2026-10-03),
// more than the request's bytes: reserve 150 per question plus the bytes and some overhead.
export const clefReserveTokens = input => Object.keys(input.questions ?? {}).length * 150
  + new TextEncoder().encode(JSON.stringify(input)).length + 256;
