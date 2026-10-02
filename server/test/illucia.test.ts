import { env, applyD1Migrations } from 'cloudflare:test';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../src/index';
import { KDF } from '../../shared/auth-protocol.js';

const origin = 'https://hangman.spyrostrimis.com';
const allow = { limit: async () => ({ success: true }) };
let requestNumber = 0;
function request(path: string, options: { method?: string; body?: unknown; cookie?: string } = {}) {
  const { method = 'POST', body, cookie } = options;
  return app.fetch(new Request(`${origin}/user/${path}`, {
    method,
    headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': `198.51.100.${++requestNumber % 250}`,
      ...(cookie ? { Cookie: cookie } : {}) },
    ...(method === 'GET' ? {} : { body: JSON.stringify(body ?? {}) }),
  }), { ...env, IP_LIMIT: allow, AUTH_LIMIT: allow });
}
async function signup(username = 'Player') {
  const response = await request('signup', { body: { username, salt: 'ab'.repeat(16), credential: 'cd'.repeat(32), version: KDF.version } });
  expect(response.status).toBe(200);
  return { cookie: response.headers.get('Set-Cookie')!.split(';')[0], id: (await response.json() as { user: { id: string } }).user.id };
}
type Start = {
  roundId: string; word: string; tier: string; experimental: boolean; seed: number;
  issuedAt: number; expiresAt: number; serverNow: number; points: { eligible: boolean; stump: number; reason?: string };
};
const begin = (cookie: string, body: object) => request('illucia/start', { cookie, body });
async function start(cookie: string, body: object = { word: 'jazz', tier: 'master' }) {
  const response = await begin(cookie, body);
  expect(response.status).toBe(200);
  return await response.json() as Start;
}
const seqOf = async (id: string) => env.DB.prepare('SELECT round_seq FROM illucia_players WHERE user_id = ?').bind(id).first('round_seq');
const openRounds = async () => (await env.DB.prepare('SELECT id, user_id, seq, word FROM illucia_rounds WHERE claimed_at IS NULL ORDER BY user_id').all()).results;

beforeAll(async () => { await applyD1Migrations(env.DB, env.TEST_MIGRATIONS); });
beforeEach(async () => {
  await env.DB.batch(['illucia_beaten_words', 'illucia_rounds', 'illucia_players', 'rounds', 'scores', 'users', 'deleted_accounts']
    .map(table => env.DB.prepare(`DELETE FROM ${table}`)));
});
afterEach(() => { vi.restoreAllMocks(); });

describe('Illucia round start', () => {
  it('requires a session, a known tier, an accepted word and no extra fields', async () => {
    const { cookie } = await signup();
    expect((await begin('', { word: 'jazz', tier: 'master' })).status).toBe(401);
    for (const body of [{ word: 'jazz' }, { word: 'jazz', tier: 'grandmaster' }, { word: 'jazz', tier: 'master', experimental: 'yes' },
      { word: 'jazz', tier: 'master', previousRoundId: 'old' }, { word: 'jazz', tier: 'master', seed: 1 }]) {
      expect((await begin(cookie, body)).status).toBe(400);
    }
    for (const word of ['cat', 'JAZZ', 'jazzz', 'zzzz', 'jazz ', 7]) {
      const response = await begin(cookie, { word, tier: 'master' });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ code: 'NOT_ACCEPTED_WORD' });
    }
    expect(await openRounds()).toEqual([]);
    const ticket = await start(cookie);
    expect(ticket).toMatchObject({ word: 'jazz', tier: 'master', experimental: false, points: { eligible: true, stump: 50 } });
  });

  it('issues a seeded 30-minute ticket that is separate from the Hangman ticket', async () => {
    const { cookie, id } = await signup();
    const hangman = await (await request('round/start', { cookie })).json() as { roundId: string };
    const ticket = await start(cookie, { word: 'rhythm', tier: 'scholar' });
    expect(ticket.roundId).toMatch(/^[0-9a-f-]{36}$/);
    expect(ticket.roundId).not.toBe(hangman.roundId);
    expect(Number.isInteger(ticket.seed) && ticket.seed >= 0 && ticket.seed <= 0xffffffff).toBe(true);
    expect(ticket.expiresAt - ticket.issuedAt).toBe(30 * 60 * 1000);
    expect(ticket.points).toEqual({ eligible: true, stump: 120 });
    expect(await seqOf(id)).toBe(1);
    // Each mode keeps its own single outstanding ticket.
    expect((await (await request('round/start', { cookie })).json() as { roundId: string }).roundId).toBe(hangman.roundId);
    expect((await start(cookie, { word: 'rhythm', tier: 'scholar' })).roundId).toBe(ticket.roundId);
  });

  it('resumes the same word, tier and mode, and abandons the open round for anything else', async () => {
    const { cookie, id } = await signup();
    const first = (await Promise.all(Array.from({ length: 5 }, () => start(cookie)))).map(ticket => ticket.roundId);
    expect(new Set(first).size).toBe(1);
    expect(await seqOf(id)).toBe(1);
    const resumed = await start(cookie);
    expect(resumed.roundId).toBe(first[0]);
    const changes = [{ word: 'fizz', tier: 'master' }, { word: 'fizz', tier: 'scholar' }, { word: 'fizz', tier: 'scholar', experimental: true }];
    let previous = resumed;
    for (const [index, body] of changes.entries()) {
      const next = await start(cookie, body);
      expect(next.roundId).not.toBe(previous.roundId);
      expect(await seqOf(id)).toBe(index + 2);
      previous = next;
    }
    expect((await openRounds()).map(row => row.id)).toEqual([previous.roundId]);
  });

  it('replaces the named previous round, while a delayed duplicate resumes its replacement', async () => {
    const { cookie, id } = await signup();
    const other = await signup('Other');
    const foreign = await start(other.cookie);
    const first = await start(cookie);
    // Naming someone else's round does not touch it.
    expect((await start(cookie, { word: 'jazz', tier: 'master', previousRoundId: foreign.roundId })).roundId).toBe(first.roundId);
    const again = await start(cookie, { word: 'jazz', tier: 'master', previousRoundId: first.roundId });
    expect(again.roundId).not.toBe(first.roundId);
    expect(await seqOf(id)).toBe(2);
    expect((await start(cookie, { word: 'jazz', tier: 'master', previousRoundId: first.roundId })).roundId).toBe(again.roundId);
    expect(await seqOf(id)).toBe(2);
    expect((await openRounds()).map(row => row.id).sort()).toEqual([again.roundId, foreign.roundId].sort());
  });

  it('replaces an expired open round and never issues a ticket before the last Illucia award', async () => {
    const { cookie, id } = await signup();
    const expired = await start(cookie);
    await env.DB.prepare('UPDATE illucia_rounds SET expires_at = ? WHERE id = ?').bind(Date.now() - 1, expired.roundId).run();
    const fresh = await start(cookie);
    expect(fresh.roundId).not.toBe(expired.roundId);
    const later = Date.now() + 60000;
    await env.DB.prepare('UPDATE illucia_rounds SET claimed_at = ?, claim_token = ?, stump_points = 0, ladder_points = 0 WHERE id = ?')
      .bind(later, 'token', fresh.roundId).run();
    const next = await start(cookie);
    expect(next.issuedAt).toBe(later);
    expect(await seqOf(id)).toBe(3);
  });

  it('previews no points for experimental rounds, out-of-tier words and words that already paid', async () => {
    const { cookie, id } = await signup();
    expect((await start(cookie, { word: 'lynx', tier: 'apprentice' })).points).toEqual({ eligible: false, stump: 0, reason: 'OUTSIDE_TIER' });
    expect((await start(cookie, { word: 'lynx', tier: 'scholar' })).points).toEqual({ eligible: true, stump: 40 });
    expect((await start(cookie, { word: 'abacas', tier: 'scholar' })).points).toMatchObject({ reason: 'OUTSIDE_TIER' });
    expect((await start(cookie, { word: 'abacas', tier: 'master' })).points).toEqual({ eligible: true, stump: 150 });
    expect((await start(cookie, { word: 'crane', tier: 'master', experimental: true })).points)
      .toEqual({ eligible: false, stump: 0, reason: 'EXPERIMENTAL' });
    // A word that beat her without paying (out of tier) can still pay; one that paid cannot, at any tier.
    await env.DB.batch([
      env.DB.prepare('INSERT INTO illucia_beaten_words (user_id, word, points, paid_round_id, beaten_at) VALUES (?, ?, 0, NULL, 1)').bind(id, 'lynx'),
      env.DB.prepare("INSERT INTO illucia_beaten_words (user_id, word, points, paid_round_id, beaten_at) VALUES (?, ?, 50, 'r', 1)").bind(id, 'jazz'),
    ]);
    expect((await start(cookie, { word: 'lynx', tier: 'master' })).points).toEqual({ eligible: true, stump: 50 });
    for (const tier of ['apprentice', 'scholar', 'master']) {
      expect((await start(cookie, { word: 'jazz', tier })).points).toEqual({ eligible: false, stump: 0, reason: 'ALREADY_WON' });
    }
    const other = await signup('Other');
    expect((await start(other.cookie, { word: 'jazz', tier: 'master' })).points).toEqual({ eligible: true, stump: 50 });
  });
});

describe('Illucia data and accounts', () => {
  const remove = (cookie: string) => request('delete-account', { cookie, body: { credential: 'cd'.repeat(32) } });
  const rows = async (table: string) => (await env.DB.prepare(`SELECT user_id FROM ${table} ORDER BY user_id`).all()).results.map(row => row.user_id);

  it('account deletion removes only that account\'s Illucia rows and stale sessions cannot start rounds', async () => {
    const owner = await signup(); const other = await signup('Other');
    for (const account of [owner, other]) {
      await start(account.cookie);
      await env.DB.prepare('INSERT INTO illucia_beaten_words (user_id, word, points, paid_round_id, beaten_at) VALUES (?, ?, 0, NULL, 1)').bind(account.id, 'lynx').run();
    }
    for (const table of ['illucia_players', 'illucia_rounds', 'illucia_beaten_words']) expect(await rows(table)).toEqual([owner.id, other.id].sort());
    expect((await remove(owner.cookie)).status).toBe(200);
    for (const table of ['illucia_players', 'illucia_rounds', 'illucia_beaten_words']) expect(await rows(table)).toEqual([other.id]);
    expect((await begin(owner.cookie, { word: 'jazz', tier: 'master' })).status).toBe(401);
    expect(await rows('illucia_players')).toEqual([other.id]);
  });
});
