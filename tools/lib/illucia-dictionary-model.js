import { filterCandidates } from '../../client/src/lib/illucia/candidates.js';
import { assertPublicState } from '../../client/src/lib/illucia/public-state.js';
import { modelInput, parseModelLetter } from './illucia-model.js';

export const EXPLANATION_PROMPT = 'Play Hangman with six misses allowed. Hits reveal ALL occurrences and cost nothing. Choose an unused letter based on the remaining possible words, not just general English frequency. Consider letters shared by several possibilities instead of committing to one word. Return only a JSON object with exactly two keys: "reason" (a short explanation, at most 240 characters) followed by "letter" (one ASCII letter A-Z).';
export const DICTIONARY_PROMPT = EXPLANATION_PROMPT + ' The candidates field contains the COMPLETE alphabetically ordered dictionary consistent with this board. All candidates are equally weighted. No candidate is identified as the answer. Choose the letter yourself; no letter scores or suggested moves are supplied.';

export function explainedInput(state, knowledge, retry = false, dictionary = false) {
  // Reuse the public-state and terminal-state guards before consulting knowledge.
  const input = modelInput(state);
  const board = JSON.parse(input.messages[1].content);
  if (dictionary) {
    if (knowledge.length !== state.length) throw new Error('Knowledge length mismatch.');
    board.candidates = filterCandidates(state, knowledge.words);
    if (!board.candidates.length) throw new Error('No dictionary candidates.');
    // Never silently truncate or select candidates using the private answer.
    if (JSON.stringify(board.candidates).length > 100000) throw new Error('Candidate list exceeds experiment input limit.');
  }
  input.messages = [
    { role: 'system', content: dictionary ? DICTIONARY_PROMPT : EXPLANATION_PROMPT },
    { role: 'user', content: JSON.stringify(board) + (retry ? '\nInvalid reply. Return only JSON with reason (max 240 characters) and one UNUSED letter.' : '') },
  ];
  input.max_tokens = 160;
  return input;
}

export function parseExplainedLetter(response, state) {
  assertPublicState(state);
  if (typeof response !== 'string' || response.length > 1200) return { letter: null, reason: 'invalid' };
  try {
    const value = JSON.parse(response);
    if (!value || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'letter,reason' ||
        typeof value.reason !== 'string' || value.reason.length > 240) return { letter: null, reason: 'invalid' };
    return { ...parseModelLetter(value.letter, state), explanation: value.reason };
  } catch { return { letter: null, reason: 'invalid' }; }
}
