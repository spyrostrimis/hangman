import { env, applyD1Migrations } from 'cloudflare:test';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../src/index';
import { AI_MODELS, askIllucia, readAiRound, readReply } from '../src/illucia-ai';
import { purgeExpiredData } from '../src/retention';
import { illuciaWordSize } from '../src/illucia-words';
import { KDF } from '../../shared/auth-protocol.js';

const origin = 'https://hangman.spyrostrimis.com';
const allow = { limit: async () => ({ success: true }) };
const WORDS = ['bird', 'boat', 'cake', 'fish', 'lamp', 'tree', 'wolf', 'yarn'];
const ANIMALS = ['bird', 'fish', 'wolf'];
type Call = { model: string; input: { messages: { role: string; content: string }[]; max_tokens: number } };
let calls: Call[] = [];
let reply: () => Promise<unknown> = async () => good();
const good = (question = 'Can your word mean an animal?', yes = ANIMALS) => ({
  response: JSON.stringify({ question, yes, no: WORDS.filter(word => !yes.includes(word)) }),
  usage: { prompt_tokens: 300, completion_tokens: 60 },
});
type ClefInput = { model: string; state: string; questions: Record<string, { type: string; instructions: string }> };
// Clef-flash's side of the fake: a probability per word it is asked about.
const clefDefault = async (input: ClefInput): Promise<unknown> => ({
  answers: Object.fromEntries(Object.keys(input.questions).map(word => [word, { type: 'noul', noul: clefYes(word) }])),
  usage: { input_tokens: 90 * Object.keys(input.questions).length, output_tokens: 0 },
});
let clefYes: (word: string) => number = word => (ANIMALS.includes(word) ? 0.9 : 0.1);
let clefReply: (input: ClefInput) => Promise<unknown> = clefDefault;
const fakeAi = { run: async (model: string, input: Call['input']) => {
  calls.push({ model, input });
  return model.includes('clef') ? clefReply(input as unknown as ClefInput) : reply();
} };
let vars: Record<string, unknown> = {};
let requestNumber = 0;
function request(path: string, options: { body?: unknown; cookie?: string } = {}) {
  return app.fetch(new Request(`${origin}/user/${path}`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': `198.51.100.${++requestNumber % 250}`,
      ...(options.cookie ? { Cookie: options.cookie } : {}) },
    body: JSON.stringify(options.body ?? {}),
  }), { ...env, IP_LIMIT: allow, AUTH_LIMIT: allow, AI: fakeAi, AI_ENABLED: 'true', ...vars });
}
async function signup(username = 'Player') {
  const response = await request('signup', { body: { username, salt: 'ab'.repeat(16), credential: 'cd'.repeat(32), version: KDF.version } });
  expect(response.status).toBe(200);
  return { cookie: response.headers.get('Set-Cookie')!.split(';')[0], id: (await response.json() as { user: { id: string } }).user.id };
}
async function startRound(cookie: string, experimental = true, word = 'jazz') {
  const response = await request('illucia/start', { cookie, body: { word, tier: 'master', experimental } });
  expect(response.status).toBe(200);
  return (await response.json() as { roundId: string }).roundId;
}
const ask = (cookie: string, roundId: string, candidates: unknown = WORDS) =>
  request('illucia/ask', { cookie, body: { roundId, candidates } });
const budget = async () => env.DB.prepare('SELECT requests, neurons FROM ai_budget').first<{ requests: number; neurons: number }>();

beforeAll(async () => { await applyD1Migrations(env.DB, env.TEST_MIGRATIONS); });
beforeEach(async () => {
  calls = [];
  vars = {};
  reply = async () => good();
  clefYes = word => (ANIMALS.includes(word) ? 0.9 : 0.1);
  clefReply = clefDefault;
  await env.DB.batch(['illucia_ai_users', 'ai_budget', 'illucia_beaten_words', 'illucia_player_words', 'illucia_tier_stats', 'word_counts',
    'illucia_rounds', 'illucia_players', 'rounds', 'scores', 'users', 'deleted_accounts']
    .map(table => env.DB.prepare(`DELETE FROM ${table}`)));
});
afterEach(() => { vi.restoreAllMocks(); });

describe('Illucia AI question (D2)', () => {
  it('uses real accepted words in its fixtures', () => {
    for (const word of [...WORDS, 'jazz', 'your', 'word', 'mean', 'animal']) expect(illuciaWordSize(word), word).not.toBeNull();
  });

  it('asks Llama 3.3 70B with the candidate list only, and returns the validated question', async () => {
    const { cookie } = await signup();
    const roundId = await startRound(cookie);
    const response = await ask(cookie, roundId);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, question: 'Can your word mean an animal?', yes: ANIMALS,
      no: WORDS.filter(word => !ANIMALS.includes(word)), questionsLeft: 1, model: 'Llama 3.3 70B' });
    expect(calls).toHaveLength(1);
    expect(calls[0].model).toBe(AI_MODELS['llama-3.3-70b'].id);
    expect(calls[0].model).toBe('@cf/meta/llama-3.3-70b-instruct-fp8-fast');
    // The model never sees the player's word, round or account: only the candidates.
    expect(JSON.parse(calls[0].input.messages[1].content)).toEqual({ count: WORDS.length, candidates: WORDS });
    expect(JSON.stringify(calls[0].input)).not.toContain('jazz');
    expect(JSON.stringify(calls[0].input)).not.toContain(roundId);
    expect(calls[0].input.max_tokens).toBe(768);
    // Measured usage replaces the reservation: 300 × 26,668 + 60 × 204,805 per million.
    expect((await budget())!.requests).toBe(1);
    expect((await budget())!.neurons).toBeCloseTo((300 * 26668 + 60 * 204805) / 1e6, 6);
  });

  it('requires a session, an open experimental round of yours, and valid candidates; refusals never reach the model', async () => {
    const { cookie } = await signup();
    const other = await signup('Other');
    const normal = await startRound(other.cookie, false);
    expect((await ask('', normal)).status).toBe(401);
    expect((await ask(other.cookie, normal)).status).toBe(409);
    const roundId = await startRound(cookie);
    expect((await ask(other.cookie, roundId)).status).toBe(409);
    expect((await request('illucia/ask', { cookie, body: { roundId, candidates: WORDS, extra: 1 } })).status).toBe(400);
    for (const candidates of [[...WORDS].reverse(), ['bird', 'bird', 'cake'], ['bird'], ['bird', 'boats'], ['bird', 'zzzq'],
      ['Bird', 'cake'], 'bird', [1, 2], Array.from({ length: 81 }, () => 'bird')]) {
      expect((await ask(cookie, roundId, candidates)).status, JSON.stringify(candidates).slice(0, 40)).toBe(400);
    }
    expect(calls).toHaveLength(0);
    expect((await ask(cookie, roundId)).status).toBe(200);
    expect(calls).toHaveLength(1);
  });

  it('allows two questions per round, then refuses without calling the model', async () => {
    const { cookie } = await signup();
    const roundId = await startRound(cookie);
    expect(await (await ask(cookie, roundId)).json()).toMatchObject({ ok: true, questionsLeft: 1 });
    expect(await (await ask(cookie, roundId)).json()).toMatchObject({ ok: true, questionsLeft: 0 });
    expect(await (await ask(cookie, roundId)).json()).toEqual({ ok: false, reason: 'round-limit', questionsLeft: 0 });
    expect(calls).toHaveLength(2);
  });

  it('limits each player per UTC day across rounds', async () => {
    vars = { AI_USER_DAILY_QUESTIONS: '3' };
    const { cookie } = await signup();
    const other = await signup('Other');
    const first = await startRound(cookie);
    await ask(cookie, first);
    await ask(cookie, first);
    const second = await startRound(cookie, true, 'quiz');
    expect(await (await ask(cookie, second)).json()).toMatchObject({ ok: true, questionsLeft: 1 });
    expect(await (await ask(cookie, second)).json()).toEqual({ ok: false, reason: 'user-limit', questionsLeft: 1 });
    // Another player is unaffected.
    expect(await (await ask(other.cookie, await startRound(other.cookie))).json()).toMatchObject({ ok: true });
  });

  it('stops for the day when the site-wide neuron or request budget would be exceeded', async () => {
    const { cookie } = await signup();
    vars = { AI_DAILY_NEURONS: '100' };
    const roundId = await startRound(cookie);
    expect(await (await ask(cookie, roundId)).json()).toEqual({ ok: false, reason: 'budget', questionsLeft: 2 });
    expect(calls).toHaveLength(0);
    vars = { AI_DAILY_REQUESTS: '1' };
    expect(await (await ask(cookie, roundId)).json()).toMatchObject({ ok: true });
    expect(await (await ask(cookie, roundId)).json()).toEqual({ ok: false, reason: 'budget', questionsLeft: 1 });
    expect(calls).toHaveLength(1);
  });

  it('is off when disabled, misconfigured or without a binding, and spends nothing', async () => {
    const { cookie } = await signup();
    const roundId = await startRound(cookie);
    for (const setting of [{ AI_ENABLED: 'false' }, { AI_DAILY_NEURONS: 'lots' }, { AI: undefined }, { AI_MODEL: 'gpt-5' }]) {
      vars = setting;
      expect(await (await ask(cookie, roundId)).json()).toEqual({ ok: false, reason: 'disabled', questionsLeft: 2 });
    }
    expect(calls).toHaveLength(0);
    expect(await budget()).toBeNull();
  });

  it('uses the model AI_MODEL names, with its own settings and prices', async () => {
    vars = { AI_MODEL: 'gpt-oss-120b-medium' };
    const { cookie } = await signup();
    const reply = await (await ask(cookie, await startRound(cookie))).json();
    expect(reply).toMatchObject({ ok: true, model: 'gpt-oss-120b' });
    expect(calls[0].model).toBe('@cf/openai/gpt-oss-120b');
    expect(calls[0].input).toMatchObject({ reasoning_effort: 'medium', max_tokens: 4096 });
    expect(JSON.parse(calls[0].input.messages[1].content)).toEqual({ count: WORDS.length, candidates: WORDS });
    // Settled at gpt-oss-120b's rates, not Llama's.
    expect((await budget())!.neurons).toBeCloseTo((300 * 31818 + 60 * 68182) / 1e6, 6);
  });

  it('runs gpt-oss-120b at its lowest effort when AI_MODEL says low', async () => {
    vars = { AI_MODEL: 'gpt-oss-120b-low' };
    const { cookie } = await signup();
    expect(await (await ask(cookie, await startRound(cookie))).json()).toMatchObject({ ok: true, model: 'gpt-oss-120b' });
    expect(calls[0].model).toBe('@cf/openai/gpt-oss-120b');
    expect(calls[0].input).toMatchObject({ reasoning_effort: 'low', max_tokens: 4096 });
  });

  it('rejects bad model replies, so the page falls back; each still uses a question', async () => {
    const { cookie } = await signup();
    const cases: [() => Promise<unknown>, string][] = [
      [async () => ({ response: 'I think animals.' }), 'invalid'],
      [async () => good('Can your word mean an animal?', ['bird']), 'invalid'],
      [async () => good('Does your word have an E?'), 'invalid'],
      [async () => good('Can your word mean a zorbx?'), 'invalid'],
      [async () => { throw new Error('model down'); }, 'unavailable'],
      [async () => ({ unexpected: true }), 'unavailable'],
    ];
    for (const [behaviour, reason] of cases) {
      reply = behaviour;
      const roundId = await startRound(cookie, true, ['jazz', 'quiz', 'fizz', 'buzz', 'whiz', 'zone'][calls.length]);
      expect(await (await ask(cookie, roundId)).json(), reason).toMatchObject({ ok: false, reason, questionsLeft: 1 });
    }
  });

  it('accepts the binding\'s parsed-JSON and chat envelopes', async () => {
    const parsed = good();
    expect(readReply({ response: JSON.parse(parsed.response), usage: parsed.usage })?.response).toBe(parsed.response);
    expect(readReply({ choices: [{ finish_reason: 'stop', message: { content: parsed.response } }] })?.response).toBe(parsed.response);
    expect(readReply({ nothing: 1 })).toBeNull();
    const { cookie } = await signup();
    reply = async () => ({ response: JSON.parse(good().response), usage: good().usage });
    expect(await (await ask(cookie, await startRound(cookie))).json()).toMatchObject({ ok: true });
  });

  it('times out to a fallback and settles the budget when the late reply arrives', async () => {
    const { cookie, id } = await signup();
    const roundId = await startRound(cookie);
    let finish: (value: unknown) => void = () => {};
    reply = () => new Promise(resolve => { finish = resolve; });
    const deferred: Promise<unknown>[] = [];
    const round = (await readAiRound(env.DB, id, roundId, Date.now()))!;
    const result = await askIllucia({ ...env, AI: fakeAi, AI_ENABLED: 'true' }, id, roundId, WORDS, round,
      { timeoutMs: 20, defer: work => { deferred.push(work); } });
    expect(result).toEqual({ ok: false, reason: 'timeout', questionsLeft: 1 });
    const reserved = (await budget())!.neurons;
    expect(reserved).toBeGreaterThan(100);
    finish(good());
    await Promise.all(deferred);
    expect((await budget())!.neurons).toBeCloseTo((300 * 26668 + 60 * 204805) / 1e6, 6);
  });

  it('the grant itself enforces the round limit, even for a stale read', async () => {
    const { cookie, id } = await signup();
    const roundId = await startRound(cookie);
    const stale = (await readAiRound(env.DB, id, roundId, Date.now()))!;
    await ask(cookie, roundId);
    await ask(cookie, roundId);
    // A request that read the round before both grants still gets no third question.
    const result = await askIllucia({ ...env, AI: fakeAi, AI_ENABLED: 'true' }, id, roundId, WORDS, stale);
    expect(result).toEqual({ ok: false, reason: 'round-limit', questionsLeft: 0 });
    expect(calls).toHaveLength(2);
  });

  it('experimental rounds still pay nothing', async () => {
    const { cookie } = await signup();
    const response = await request('illucia/start', { cookie, body: { word: 'jazz', tier: 'master', experimental: true } });
    expect(await response.json()).toMatchObject({ experimental: true, points: { eligible: false, stump: 0 } });
  });

  it('deletes a player\'s question counts with the account and sweeps old days', async () => {
    const { cookie, id } = await signup();
    await ask(cookie, await startRound(cookie));
    const counts = () => env.DB.prepare('SELECT COUNT(*) AS n FROM illucia_ai_users').first('n');
    expect(await counts()).toBe(1);
    await env.DB.prepare("INSERT INTO illucia_ai_users (user_id, day, questions) VALUES (?, '2026-01-01', 3)").bind(id).run();
    await purgeExpiredData(env.DB, Date.now());
    expect(await counts()).toBe(1);
    const deleted = await request('delete-account', { cookie, body: { credential: 'cd'.repeat(32) } });
    expect(deleted.status).toBe(200);
    expect(await counts()).toBe(0);
    // The site-wide budget holds no account and stays.
    expect((await budget())!.requests).toBe(1);
  });
});

describe('Llama writes, Clef-flash sorts (AI_MODEL llama-3.3-70b-clef-flash)', () => {
  const pipeline = { AI_MODEL: 'llama-3.3-70b-clef-flash' };
  const llamaNeurons = (300 * 26668 + 60 * 204805) / 1e6;
  const clefNeurons = (words: number) => (90 * words * 21818) / 1e6;

  it('uses Llama for the question and Clef-flash for the lists, and settles both', async () => {
    vars = pipeline;
    // Llama's own lists are wrong (fish missing); with a sorter they are not used.
    reply = async () => ({ ...good(), response: JSON.stringify({ question: 'Can your word be an animal?', yes: ['bird', 'wolf'],
      no: ['boat', 'cake', 'lamp', 'tree', 'yarn'] }) });
    const { cookie } = await signup();
    const result = await (await ask(cookie, await startRound(cookie))).json();
    expect(result).toEqual({ ok: true, question: 'Can your word be an animal?', yes: ANIMALS,
      no: WORDS.filter(word => !ANIMALS.includes(word)), questionsLeft: 1, model: 'Llama 3.3 70B and Clef-flash' });
    expect(calls.map(c => c.model)).toEqual(['@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/cloudflare/clef-flash']);
    const clef = calls[1].input as unknown as ClefInput;
    expect(clef.model).toBe('clef-flash');
    expect(Object.keys(clef.questions)).toEqual(WORDS);
    expect(clef.questions.bird.instructions).toBe('Can the word "bird" be an animal?');
    // The player's word (jazz) is not among these candidates, and nothing else carries it.
    expect(JSON.stringify(clef)).not.toContain('jazz');
    expect((await budget())!.neurons).toBeCloseTo(llamaNeurons + clefNeurons(WORDS.length), 6);
  });

  it('splits more than 64 candidates over two Clef requests', async () => {
    vars = pipeline;
    const { cookie } = await signup();
    const roundId = await startRound(cookie);
    // Accepted four-letter words, found in the word list rather than hard-coded.
    const candidates: string[] = [];
    for (const first of 'bcdfghlmnprst') for (const vowel of 'aeiou') for (const last of 'dgknpt') {
      const word = `${first}${vowel}${last}s`;
      if (illuciaWordSize(word) !== null) candidates.push(word);
    }
    candidates.sort();
    candidates.splice(70);
    expect(candidates.length).toBe(70);
    clefYes = word => (candidates.indexOf(word) % 2 === 0 ? 0.8 : 0.2);
    reply = async () => ({ response: JSON.stringify({ question: 'Can your word mean a thing?', yes: [], no: [] }),
      usage: { prompt_tokens: 300, completion_tokens: 60 } });
    const result = await (await ask(cookie, roundId, candidates)).json() as { ok: boolean; yes: string[] };
    expect(result.ok).toBe(true);
    const sizes = calls.filter(c => c.model.includes('clef')).map(c => Object.keys((c.input as unknown as ClefInput).questions).length);
    expect(sizes).toEqual([64, 6]);
    expect(result.yes).toEqual(candidates.filter((_, i) => i % 2 === 0));
  });

  it('a bad question never reaches Clef, and its sort reservation is released', async () => {
    vars = pipeline;
    const { cookie } = await signup();
    const words = ['jazz', 'quiz', 'fizz'];
    for (const [index, question] of ['Can your word mean a verb?', 'Does your word have an E?', 'Can your word mean a zorbx?'].entries()) {
      reply = async () => good(question);
      const roundId = await startRound(cookie, true, words[index]);
      expect(await (await ask(cookie, roundId)).json(), question).toMatchObject({ ok: false, reason: 'invalid' });
    }
    expect(calls.every(c => !c.model.includes('clef'))).toBe(true);
    expect((await budget())!.neurons).toBeCloseTo(3 * llamaNeurons, 6);
  });

  it('falls back when Clef-flash splits unevenly, fails or answers only part', async () => {
    vars = pipeline;
    const { cookie } = await signup();
    const cases: [() => void, string][] = [
      [() => { clefYes = word => (word === 'bird' ? 0.9 : 0.1); }, 'invalid'],
      [() => { clefReply = async () => { throw new Error('down'); }; }, 'unavailable'],
      [() => { clefReply = async () => ({ answers: { bird: { noul: 0.9 } }, usage: { input_tokens: 90 } }); }, 'unavailable'],
    ];
    const words = ['jazz', 'quiz', 'fizz'];
    for (const [index, [setup, reason]] of cases.entries()) {
      setup();
      const roundId = await startRound(cookie, true, words[index]);
      expect(await (await ask(cookie, roundId)).json(), reason).toMatchObject({ ok: false, reason });
    }
  });

  it('times out to a fallback when Clef-flash is slow, and settles it when it answers', async () => {
    const { cookie, id } = await signup();
    const roundId = await startRound(cookie);
    let finish: () => void = () => {};
    clefReply = input => new Promise(resolve => { finish = () => resolve(clefDefault(input)); });
    const deferred: Promise<unknown>[] = [];
    const round = (await readAiRound(env.DB, id, roundId, Date.now()))!;
    const sorterTimeout = AI_MODELS['llama-3.3-70b-clef-flash'].sorter!.timeoutMs;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const pending = askIllucia({ ...env, AI: fakeAi, AI_ENABLED: 'true', ...pipeline }, id, roundId, WORDS, round,
      { defer: work => { deferred.push(work); } });
    await vi.waitFor(() => expect(calls.some(c => c.model.includes('clef'))).toBe(true));
    await vi.advanceTimersByTimeAsync(sorterTimeout + 1);
    vi.useRealTimers();
    expect(await pending).toEqual({ ok: false, reason: 'timeout', questionsLeft: 1 });
    finish();
    await Promise.all(deferred);
    expect((await budget())!.neurons).toBeCloseTo(llamaNeurons + clefNeurons(WORDS.length), 6);
  });
});

