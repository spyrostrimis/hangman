import { assertPublicState } from '../../client/src/lib/illucia/public-state.js';

// Allowlist and neuron rates checked against Cloudflare pricing on 2026-09-29.
export const MODELS = Object.freeze({
  '@cf/meta/llama-3.2-3b-instruct': Object.freeze({ input: 4625, output: 30475 }),
  '@cf/meta/llama-3.1-8b-instruct-fp8-fast': Object.freeze({ input: 4119, output: 34868 }),
});
// Track D1 (question models), a separate allowlist so the I7a runner keeps its own two.
// Neuron rates checked against Cloudflare pricing on 2026-10-02.
export const QUESTION_MODELS = Object.freeze({
  '@cf/qwen/qwen3-30b-a3b-fp8': Object.freeze({ input: 4625, output: 30475 }),
  '@cf/google/gemma-4-26b-a4b-it': Object.freeze({ input: 9091, output: 27273 }),
  '@cf/zai-org/glm-4.7-flash': Object.freeze({ input: 5500, output: 36400 }),
  '@cf/openai/gpt-oss-20b': Object.freeze({ input: 18182, output: 27273 }),
});
const RATES = Object.freeze({ ...MODELS, ...QUESTION_MODELS });
export const PROMPT_VERSION = 'i7a-1';
export const SYSTEM_PROMPT = 'Play Hangman. Choose one unused English letter to solve the hidden word before six misses. The pattern uses _ for unknown positions. A hit reveals ALL occurrences, so guessed letters cannot occur in blanks. Hits cost nothing; misses cost one chance. Return exactly one ASCII letter A-Z, with no explanation, punctuation or word guess.';

export function modelInput(state, retry = false) {
  assertPublicState(state);
  if (!state.pattern.includes(null) || state.missesLeft === 0) throw new Error('No requests after a round ends.');
  // Explicit projection: no answer, candidate words, rarity, username or conversation history.
  const board = {
    length: state.length,
    pattern: state.pattern.map(letter => letter ?? '_').join(' '),
    guessedLetters: state.guessedLetters.join(''),
    missedLetters: state.missedLetters.join(''),
    missesLeft: state.missesLeft,
    availableLetters: [...'abcdefghijklmnopqrstuvwxyz'].filter(letter => !state.guessedLetters.includes(letter)).join(''),
  };
  return {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(board) + (retry ? '\nYour previous reply was invalid. Return exactly ONE available letter.' : '') },
    ],
    max_tokens: 4, temperature: 0, seed: 20260929, stream: false,
  };
}

export function parseModelLetter(response, state) {
  assertPublicState(state);
  if (typeof response !== 'string' || response.length > 16 || !/^[a-z]$/i.test(response.trim())) {
    return { letter: null, reason: 'invalid' };
  }
  const letter = response.trim().toLowerCase();
  return state.guessedLetters.includes(letter) ? { letter: null, reason: 'repeated' } : { letter, reason: null };
}

export function neuronEstimate(model, usage) {
  const rate = RATES[model];
  if (!rate) throw new Error('Model is not in the free-eligible allowlist.');
  if (!usage || !Number.isInteger(usage.prompt_tokens) || usage.prompt_tokens < 0 ||
      !Number.isInteger(usage.completion_tokens) || usage.completion_tokens < 0) return null;
  return (usage.prompt_tokens * rate.input + usage.completion_tokens * rate.output) / 1e6;
}

export class BenchmarkStop extends Error {
  constructor(reason) { super(reason); this.name = 'BenchmarkStop'; }
}

export function normalizeModelResult(result) {
  // Cloudflare may expose generated JSON as a parsed `response` object while
  // retaining the original text in the OpenAI-compatible choices envelope.
  const response = typeof result?.response === 'string' ? result.response : result?.choices?.[0]?.message?.content;
  if (typeof response !== 'string') throw new BenchmarkStop('response-format');
  return { response, usage: result.usage, providerModel: result.model ?? null };
}

export function createCloudflareTransport({ accountId, token, fetchImpl = fetch, timeoutMs = 10000, normalize = normalizeModelResult }) {
  if (!/^[a-f0-9]{32}$/.test(accountId ?? '') || !token) throw new Error('Cloudflare account and token are required.');
  return async (model, input) => {
    if (!Object.hasOwn(RATES, model)) throw new Error('Unknown model.');
    try {
      const response = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!response.ok) throw new BenchmarkStop(`http-${response.status}`);
      const body = await response.json();
      if (body.success !== true) throw new BenchmarkStop('cloudflare-error');
      return normalize(body.result);
    } catch (error) {
      // Never expose request headers, credentials or provider response bodies in errors.
      if (error instanceof BenchmarkStop) throw error;
      throw new BenchmarkStop(error?.name === 'TimeoutError' ? 'timeout' : 'transport-error');
    }
  };
}
