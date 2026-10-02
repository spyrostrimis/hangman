import { env, applyD1Migrations } from 'cloudflare:test';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../src/index';
import { claimIlluciaRound } from '../src/illucia';
import { KDF } from '../../shared/auth-protocol.js';
import { ILLUCIA_ALREADY_WON_MESSAGE } from '../../shared/scoring-protocol.js';

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
  await env.DB.batch(['illucia_beaten_words', 'illucia_player_words', 'illucia_tier_stats', 'word_counts', 'illucia_rounds',
    'illucia_players', 'rounds', 'scores', 'users', 'deleted_accounts']
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

// Six letters that are in none of the fixture words below, so they are her six misses.
const LOSS = [...'dgkopq'];
const mature = (roundId: string) => env.DB.prepare('UPDATE illucia_rounds SET issued_at = ? WHERE id = ?').bind(Date.now() - 12000, roundId).run();
const claim = (cookie: string, roundId: string, extra: object = {}) =>
  request('illucia/claim', { cookie, body: { roundId, guesses: LOSS, ...extra } });
const total = async (id: string) => env.DB.prepare('SELECT total FROM scores WHERE user_id = ?').bind(id).first('total');
const beaten = async (id: string) => (await env.DB.prepare('SELECT word, points, paid_round_id FROM illucia_beaten_words WHERE user_id = ? ORDER BY word').bind(id).all()).results;
// Claim responses without the ladder view, which has its own tests.
const bare = (response: unknown) => { const { ladder: _, ...rest } = response as { ladder?: object }; return rest; };
async function won(cookie: string, body: object, extra: object = {}) {
  const ticket = await start(cookie, body);
  await mature(ticket.roundId);
  const response = await claim(cookie, ticket.roundId, extra);
  expect(response.status).toBe(200);
  const { ladder, ...result } = await response.json() as { ladder: object };
  return { ticket, result, ladder };
}

describe('Illucia claims', () => {
  it('rejects at 11,999 ms without consuming or awarding, then accepts the same ticket at 12,000 ms', async () => {
    const { cookie, id } = await signup();
    const ticket = await start(cookie);
    const clock = vi.spyOn(Date, 'now').mockReturnValue(ticket.issuedAt + 11999);
    const early = await claim(cookie, ticket.roundId);
    expect(early.status).toBe(409);
    expect(await early.json()).toMatchObject({ code: 'ROUND_TOO_EARLY', retryAfterMs: 1 });
    expect(await env.DB.prepare('SELECT claimed_at FROM illucia_rounds WHERE id = ?').bind(ticket.roundId).first('claimed_at')).toBeNull();
    expect(await total(id)).toBe(0);
    expect(await beaten(id)).toEqual([]);
    clock.mockReturnValue(ticket.issuedAt + 12000);
    expect(bare(await (await claim(cookie, ticket.roundId)).json())).toEqual({ score: 50, awarded: { stump: 50, ladder: 0 } });
  });

  it('accepts only legal guesses that end exactly at her sixth miss on the committed word', async () => {
    const { cookie, id } = await signup();
    const ticket = await start(cookie);
    await mature(ticket.roundId);
    for (const guesses of [null, 'bdfgkm', [], [...'bdfgk'], [...'jazbdfg'], [...'jaz'], [...'bdfgkmn'], [...'bdfgkmj'], [...'bdfgkj'],
      ['b', 'b', 'd', 'f', 'g', 'k', 'm'], [...'BDFGKM'], ['b', 'd', 'f', 'g', 'k', '!'], [1, 2, 3, 4, 5, 6], Array(27).fill('b')]) {
      expect((await claim(cookie, ticket.roundId, { guesses })).status).toBe(400);
    }
    expect(await total(id)).toBe(0);
    // Hits between misses are fine, as long as the word is never solved.
    expect(bare(await (await claim(cookie, ticket.roundId, { guesses: [...'jbdfgkm'] })).json())).toMatchObject({ score: 50 });
  });

  it('rejects unknown fields, bad round IDs, foreign and replaced tickets, and out-of-range question counts', async () => {
    const { cookie } = await signup(); const other = await signup('Other');
    const foreign = await start(other.cookie); await mature(foreign.roundId);
    const replaced = await start(cookie); await mature(replaced.roundId);
    const ticket = await start(cookie, { word: 'crane', tier: 'master' }); await mature(ticket.roundId);
    expect((await claim('', ticket.roundId)).status).toBe(401);
    expect((await claim(cookie, 'not-a-round')).status).toBe(400);
    for (const answeredQuestions of [3, -1, 1.5, '1', null]) expect((await claim(cookie, ticket.roundId, { answeredQuestions })).status).toBe(400);
    expect((await claim(cookie, ticket.roundId, { score: 9000 })).status).toBe(400);
    expect((await claim(cookie, foreign.roundId)).status).toBe(409);
    expect((await claim(cookie, replaced.roundId)).status).toBe(409);
    expect((await claim(cookie, crypto.randomUUID())).status).toBe(409);
    expect(bare(await (await claim(cookie, ticket.roundId)).json())).toEqual({ score: 100, awarded: { stump: 100, ladder: 0 } });
    expect(bare(await (await claim(other.cookie, foreign.roundId)).json())).toMatchObject({ score: 50 });
  });

  it('pays tier base × min(length − 3, 3) and multiplies it for one or two answered questions', async () => {
    const { cookie, id } = await signup();
    const cases: [object, number, number][] = [
      [{ word: 'jazz', tier: 'master' }, 0, 50], [{ word: 'crane', tier: 'master' }, 1, 125], [{ word: 'abacas', tier: 'master' }, 2, 225],
      [{ word: 'lynx', tier: 'scholar' }, 1, 50], [{ word: 'rhythm', tier: 'apprentice' }, 0, 90], [{ word: 'fizz', tier: 'apprentice' }, 1, 38],
    ];
    let expected = 0;
    for (const [body, answeredQuestions, stump] of cases) {
      expected += stump;
      expect((await won(cookie, body, { answeredQuestions })).result).toEqual({ score: expected, awarded: { stump, ladder: 0 } });
    }
    expect(await total(id)).toBe(expected);
    expect((await beaten(id)).map(row => [row.word, row.points])).toEqual(
      [['abacas', 225], ['crane', 125], ['fizz', 38], ['jazz', 50], ['lynx', 50], ['rhythm', 90]]);
  });

  it('pays a word once at any tier; an out-of-tier win pays nothing and leaves the word unspent', async () => {
    const { cookie, id } = await signup();
    expect((await won(cookie, { word: 'lynx', tier: 'apprentice' }, { answeredQuestions: 2 })).result)
      .toEqual({ score: 0, awarded: { stump: 0, ladder: 0 }, reason: 'OUTSIDE_TIER' });
    expect(await beaten(id)).toEqual([{ word: 'lynx', points: 0, paid_round_id: null }]);
    const paid = await won(cookie, { word: 'lynx', tier: 'scholar' });
    expect(paid.result).toEqual({ score: 40, awarded: { stump: 40, ladder: 0 } });
    expect(await beaten(id)).toEqual([{ word: 'lynx', points: 40, paid_round_id: paid.ticket.roundId }]);
    for (const tier of ['scholar', 'master']) {
      expect((await won(cookie, { word: 'lynx', tier }, { answeredQuestions: 2 })).result)
        .toEqual({ score: 40, awarded: { stump: 0, ladder: 0 }, reason: 'ALREADY_WON' });
    }
    // Out of tier is checked first, so a spent word at a tier that never knew it says so.
    expect((await won(cookie, { word: 'lynx', tier: 'apprentice' })).result).toMatchObject({ score: 40, reason: 'OUTSIDE_TIER' });
    expect(await beaten(id)).toEqual([{ word: 'lynx', points: 40, paid_round_id: paid.ticket.roundId }]);
    expect(ILLUCIA_ALREADY_WON_MESSAGE).toBe('You already beat me with this word, no more points from it.');
    // Another account's history is separate.
    const other = await signup('Other');
    expect((await won(other.cookie, { word: 'lynx', tier: 'master' })).result).toMatchObject({ score: 50 });
  });

  it('pays nothing and records no beaten word for experimental rounds', async () => {
    const { cookie, id } = await signup();
    expect((await won(cookie, { word: 'jazz', tier: 'master', experimental: true }, { answeredQuestions: 2 })).result)
      .toEqual({ score: 0, awarded: { stump: 0, ladder: 0 }, reason: 'EXPERIMENTAL' });
    expect(await beaten(id)).toEqual([]);
    expect((await won(cookie, { word: 'jazz', tier: 'master' })).result).toEqual({ score: 50, awarded: { stump: 50, ladder: 0 } });
  });

  it('awards once under concurrent claims and returns the stored award on later retries', async () => {
    const { cookie, id } = await signup();
    const ticket = await start(cookie, { word: 'crane', tier: 'master' });
    await mature(ticket.roundId);
    const responses = await Promise.all(Array.from({ length: 5 }, () => claim(cookie, ticket.roundId, { answeredQuestions: 1 })));
    for (const response of responses) expect(bare(await response.json())).toEqual({ score: 125, awarded: { stump: 125, ladder: 0 } });
    const next = await start(cookie, { word: 'jazz', tier: 'master' });
    expect(next.roundId).not.toBe(ticket.roundId);
    expect(bare(await (await claim(cookie, ticket.roundId, { answeredQuestions: 2 })).json())).toEqual({ score: 125, awarded: { stump: 125, ladder: 0 } });
    expect(await total(id)).toBe(125);
    // The Hangman ticket is untouched by Illucia claims.
    expect((await request('round/start', { cookie })).status).toBe(200);
  });

  it('does not consume a ticket at the score ceiling and rolls everything back when the increment fails', async () => {
    const { cookie, id } = await signup();
    const ticket = await start(cookie); await mature(ticket.roundId);
    await env.DB.prepare('UPDATE scores SET total = 9007199254740900 WHERE user_id = ?').bind(id).run();
    expect((await claim(cookie, ticket.roundId)).status).toBe(409);
    expect(await env.DB.prepare('SELECT claimed_at FROM illucia_rounds WHERE id = ?').bind(ticket.roundId).first('claimed_at')).toBeNull();
    await env.DB.prepare('UPDATE scores SET total = 0 WHERE user_id = ?').bind(id).run();
    await env.DB.exec("CREATE TRIGGER test_fail_illucia_award BEFORE UPDATE ON scores BEGIN SELECT RAISE(ABORT, 'test failure'); END;");
    try {
      expect((await claim(cookie, ticket.roundId)).status).toBe(500);
      expect(await env.DB.prepare('SELECT claimed_at FROM illucia_rounds WHERE id = ?').bind(ticket.roundId).first('claimed_at')).toBeNull();
      expect(await beaten(id)).toEqual([]);
      expect(await total(id)).toBe(0);
    } finally { await env.DB.exec('DROP TRIGGER test_fail_illucia_award;'); }
    expect(bare(await (await claim(cookie, ticket.roundId)).json())).toEqual({ score: 50, awarded: { stump: 50, ladder: 0 } });
  });
});

describe('Illucia ladder', () => {
  const view = (rung: number, next: string, minLength: number) => ({ rung, next, minLength });
  const step = async (cookie: string, word: string, tier: string, extra: object = {}) => {
    const ticket = await start(cookie, { word, tier, ...extra });
    await mature(ticket.roundId);
    const response = await claim(cookie, ticket.roundId);
    expect(response.status).toBe(200);
    return { ticket, result: await response.json() as { score: number; awarded: { stump: number; ladder: number }; ladder: object } };
  };

  it('pays +100 for Apprentice, then Scholar, then Master in a row with longer words, and shows each rung', async () => {
    const { cookie } = await signup();
    const apprentice = await step(cookie, 'jazz', 'apprentice');
    expect(apprentice.ticket.ladder).toEqual(view(0, 'apprentice', 4));
    expect(apprentice.result).toEqual({ score: 30, awarded: { stump: 30, ladder: 0 }, ladder: view(1, 'scholar', 5) });
    const scholar = await step(cookie, 'zebra', 'scholar');
    expect(scholar.ticket.ladder).toEqual(view(1, 'scholar', 5));
    expect(scholar.result).toEqual({ score: 110, awarded: { stump: 80, ladder: 0 }, ladder: view(2, 'master', 6) });
    const master = await step(cookie, 'rhythm', 'master');
    expect(master.ticket.ladder).toEqual(view(2, 'master', 6));
    expect(master.result).toEqual({ score: 360, awarded: { stump: 150, ladder: 100 }, ladder: view(0, 'apprentice', 4) });
    // The next Apprentice win starts a new ladder; retrying the Master claim returns its stored bonus without paying again.
    expect((await step(cookie, 'faith', 'apprentice')).result.ladder).toEqual(view(1, 'scholar', 6));
    expect((await (await claim(cookie, master.ticket.roundId)).json())).toMatchObject({ score: 420, awarded: { stump: 150, ladder: 100 } });
    expect((await start(cookie, { word: 'rhythm', tier: 'scholar' })).ladder).toEqual(view(1, 'scholar', 6));
  });

  it('needs each word longer than the last; an Apprentice win restarts the ladder at any rung', async () => {
    const { cookie } = await signup();
    await step(cookie, 'zebra', 'apprentice');
    expect((await step(cookie, 'faith', 'scholar')).result).toMatchObject({ awarded: { ladder: 0 }, ladder: view(0, 'apprentice', 4) });
    expect((await step(cookie, 'chimney', 'master')).result.awarded.ladder).toBe(0);
    await step(cookie, 'jazz', 'apprentice');
    await step(cookie, 'crane', 'apprentice');
    expect((await step(cookie, 'rhythm', 'scholar')).result.ladder).toEqual(view(2, 'master', 7));
    expect((await step(cookie, 'lantern', 'master')).result.awarded).toEqual({ stump: 150, ladder: 100 });
  });

  it('resets after a loss or abandoned round, an expired ticket, or tiers out of order', async () => {
    const { cookie } = await signup();
    await step(cookie, 'jazz', 'apprentice');
    // She won this one: no claim; the player starts another round.
    await start(cookie, { word: 'zebra', tier: 'scholar' });
    const lost = await start(cookie, { word: 'zebra', tier: 'scholar' });
    expect(lost.ladder).toEqual(view(1, 'scholar', 5));
    const rematch = await start(cookie, { word: 'zebra', tier: 'scholar', previousRoundId: lost.roundId });
    expect(rematch.ladder).toEqual(view(0, 'apprentice', 4));
    await mature(rematch.roundId);
    expect(bare(await (await claim(cookie, rematch.roundId)).json())).toEqual({ score: 110, awarded: { stump: 80, ladder: 0 } });
    expect((await step(cookie, 'rhythm', 'master')).result.awarded.ladder).toBe(0);

    await step(cookie, 'fizz', 'apprentice');
    const open = await start(cookie, { word: 'crane', tier: 'scholar' });
    // Control: the same start resumes the open round and the ladder is still alive.
    expect(await start(cookie, { word: 'crane', tier: 'scholar' })).toMatchObject({ roundId: open.roundId, ladder: view(1, 'scholar', 5) });
    await env.DB.prepare('UPDATE illucia_rounds SET expires_at = ? WHERE id = ?').bind(Date.now() - 1, open.roundId).run();
    expect((await start(cookie, { word: 'crane', tier: 'scholar' })).ladder).toEqual(view(0, 'apprentice', 4));

    const fresh = await signup('Other');
    expect((await step(fresh.cookie, 'jazz', 'scholar')).result.ladder).toEqual(view(0, 'apprentice', 4));
    await step(fresh.cookie, 'fizz', 'apprentice');
    expect((await step(fresh.cookie, 'abacas', 'master')).result).toMatchObject({ awarded: { ladder: 0 }, ladder: view(0, 'apprentice', 4) });
  });

  it('only point-earning wins climb: spent, out-of-tier and experimental wins break the ladder', async () => {
    const { cookie } = await signup();
    await step(cookie, 'jazz', 'master');
    await step(cookie, 'fizz', 'apprentice');
    expect((await step(cookie, 'jazz', 'scholar')).result).toMatchObject({ awarded: { stump: 0 }, ladder: view(0, 'apprentice', 4) });
    await step(cookie, 'faith', 'apprentice');
    expect((await step(cookie, 'chimney', 'scholar', { experimental: true })).result.ladder).toEqual(view(0, 'apprentice', 4));
    await step(cookie, 'crane', 'apprentice');
    const outside = await step(cookie, 'abacas', 'scholar');
    expect(outside.result).toMatchObject({ awarded: { stump: 0, ladder: 0 }, ladder: view(0, 'apprentice', 4) });
    // Control: the same climb with paying words reaches the bonus.
    await step(cookie, 'sixty', 'apprentice');
    await step(cookie, 'rhythm', 'scholar');
    expect((await step(cookie, 'lantern', 'master')).result.awarded).toEqual({ stump: 150, ladder: 100 });
  });

  it('consumes nothing if the ladder changed between the claim read and its batch', async () => {
    const { cookie, id } = await signup();
    await step(cookie, 'jazz', 'apprentice');
    await step(cookie, 'zebra', 'scholar');
    const master = await start(cookie, { word: 'rhythm', tier: 'master' });
    await mature(master.roundId);
    const interfering = { prepare: env.DB.prepare.bind(env.DB), batch: async (statements: D1PreparedStatement[]) => {
      await env.DB.prepare('UPDATE illucia_players SET ladder_rung = 0, ladder_length = NULL, ladder_seq = NULL WHERE user_id = ?').bind(id).run();
      return env.DB.batch(statements);
    } } as unknown as D1Database;
    expect(await claimIlluciaRound(interfering, id, master.roundId, LOSS, 0)).toMatchObject({ status: 409 });
    expect(await env.DB.prepare('SELECT claimed_at FROM illucia_rounds WHERE id = ?').bind(master.roundId).first('claimed_at')).toBeNull();
    expect(await total(id)).toBe(110);
    // Control: claimed again from the state as it now stands, the round pays stump points without the bonus.
    expect(bare(await (await claim(cookie, master.roundId)).json())).toEqual({ score: 260, awarded: { stump: 150, ladder: 0 } });
  });

  it('pays the ladder bonus once under concurrent Master claims', async () => {
    const { cookie, id } = await signup();
    await step(cookie, 'jazz', 'apprentice');
    await step(cookie, 'zebra', 'scholar');
    const master = await start(cookie, { word: 'rhythm', tier: 'master' });
    await mature(master.roundId);
    const responses = await Promise.all(Array.from({ length: 5 }, () => claim(cookie, master.roundId)));
    for (const response of responses) expect(bare(await response.json())).toEqual({ score: 360, awarded: { stump: 150, ladder: 100 } });
    expect(await total(id)).toBe(360);
    expect(await env.DB.prepare('SELECT ladder_rung, ladder_length, ladder_seq FROM illucia_players WHERE user_id = ?').bind(id).first())
      .toEqual({ ladder_rung: 0, ladder_length: null, ladder_seq: null });
  });
});

describe('Illucia memory: counting', () => {
  const plays = async (id: string) => (await env.DB.prepare('SELECT word, plays FROM illucia_player_words WHERE user_id = ? ORDER BY word').bind(id).all()).results;
  const global = async () => (await env.DB.prepare('SELECT word, count FROM word_counts ORDER BY word').all()).results;
  const tiers = async (id: string) => (await env.DB.prepare('SELECT tier, games, wins FROM illucia_tier_stats WHERE user_id = ? ORDER BY tier').bind(id).all()).results;
  const counted = async (roundId: string) => env.DB.prepare('SELECT counted FROM illucia_rounds WHERE id = ?').bind(roundId).first('counted');

  it('counts a new normal-mode ticket once, never a resume or an experimental round, and again for a replay', async () => {
    const { cookie, id } = await signup();
    const first = await Promise.all(Array.from({ length: 4 }, () => start(cookie, { word: 'jazz', tier: 'master' })));
    expect(new Set(first.map(ticket => ticket.roundId)).size).toBe(1);
    expect(await counted(first[0].roundId)).toBe(1);
    await start(cookie, { word: 'jazz', tier: 'master' });
    expect(await plays(id)).toEqual([{ word: 'jazz', plays: 1 }]);
    expect(await global()).toEqual([{ word: 'jazz', count: 1 }]);
    const replay = await start(cookie, { word: 'jazz', tier: 'master', previousRoundId: first[0].roundId });
    expect(replay.roundId).not.toBe(first[0].roundId);
    await start(cookie, { word: 'crane', tier: 'scholar' });
    const experimental = await start(cookie, { word: 'lynx', tier: 'scholar', experimental: true });
    expect(await counted(experimental.roundId)).toBe(0);
    expect(await plays(id)).toEqual([{ word: 'crane', plays: 1 }, { word: 'jazz', plays: 2 }]);
    expect(await global()).toEqual([{ word: 'crane', count: 1 }, { word: 'jazz', count: 2 }]);
    expect(await tiers(id)).toEqual([{ tier: 'master', games: 2, wins: 0 }, { tier: 'scholar', games: 1, wins: 0 }]);
    // Global counts add up across accounts without naming them.
    const other = await signup('Other');
    await start(other.cookie, { word: 'jazz', tier: 'apprentice' });
    expect(await global()).toEqual([{ word: 'crane', count: 1 }, { word: 'jazz', count: 3 }]);
    expect(await plays(other.id)).toEqual([{ word: 'jazz', plays: 1 }]);
  });

  it('counts a win once per counted round, paid or not, and never for experimental or uncounted tickets', async () => {
    const { cookie, id } = await signup();
    const paid = await start(cookie, { word: 'crane', tier: 'master' }); await mature(paid.roundId);
    const responses = await Promise.all(Array.from({ length: 4 }, () => claim(cookie, paid.roundId)));
    for (const response of responses) expect(response.status).toBe(200);
    expect(await tiers(id)).toEqual([{ tier: 'master', games: 1, wins: 1 }]);
    await won(cookie, { word: 'lynx', tier: 'apprentice' }); // out of tier: pays 0, still a win
    await won(cookie, { word: 'jazz', tier: 'master', experimental: true });
    // A ticket opened before counting existed (counted = 0) can still be claimed, without a win.
    const old = await start(cookie, { word: 'fizz', tier: 'scholar' }); await mature(old.roundId);
    await env.DB.prepare('UPDATE illucia_rounds SET counted = 0 WHERE id = ?').bind(old.roundId).run();
    expect(bare(await (await claim(cookie, old.roundId)).json())).toEqual({ score: 140, awarded: { stump: 40, ladder: 0 } });
    expect(await tiers(id)).toEqual([{ tier: 'apprentice', games: 1, wins: 1 }, { tier: 'master', games: 1, wins: 1 },
      { tier: 'scholar', games: 1, wins: 0 }]);
    expect(await (await claim(cookie, paid.roundId)).json()).toMatchObject({ score: 140 });
    expect(await tiers(id)).toEqual([{ tier: 'apprentice', games: 1, wins: 1 }, { tier: 'master', games: 1, wins: 1 },
      { tier: 'scholar', games: 1, wins: 0 }]);
  });

  it('gives each account a stable personality seed, and the migration backfills missing ones', async () => {
    const { cookie, id } = await signup(); const other = await signup('Other');
    await start(cookie); await start(other.cookie);
    const seedOf = async (user: string) => env.DB.prepare('SELECT personality_seed FROM illucia_players WHERE user_id = ?').bind(user).first('personality_seed');
    const seed = await seedOf(id);
    expect(Number.isInteger(seed) && (seed as number) >= 0 && (seed as number) <= 0xffffffff).toBe(true);
    await start(cookie, { word: 'crane', tier: 'master' });
    expect(await seedOf(id)).toBe(seed);
    expect(await seedOf(other.id)).not.toBe(seed);
    const otherSeed = await seedOf(other.id);
    await env.DB.prepare('UPDATE illucia_players SET personality_seed = NULL WHERE user_id = ?').bind(id).run();
    const migration = (env.TEST_MIGRATIONS as { name: string; queries: string[] }[]).find(entry => entry.name.startsWith('0007'))!;
    const backfill = migration.queries.filter(query => query.includes('UPDATE illucia_players SET personality_seed'));
    expect(backfill).toHaveLength(1);
    await env.DB.prepare(backfill[0]).run();
    expect(await seedOf(id)).toEqual(expect.any(Number));
    expect(await seedOf(other.id)).toBe(otherSeed);
  });

  it('account deletion removes the player history and stats but keeps the global word counts', async () => {
    const owner = await signup(); const other = await signup('Other');
    await start(owner.cookie, { word: 'jazz', tier: 'master' });
    await start(other.cookie, { word: 'jazz', tier: 'master' });
    expect(await global()).toEqual([{ word: 'jazz', count: 2 }]);
    const removed = await request('delete-account', { cookie: owner.cookie, body: { credential: 'cd'.repeat(32) } });
    expect(removed.status).toBe(200);
    expect(await plays(owner.id)).toEqual([]);
    expect(await tiers(owner.id)).toEqual([]);
    expect(await plays(other.id)).toEqual([{ word: 'jazz', plays: 1 }]);
    expect(await tiers(other.id)).toEqual([{ tier: 'master', games: 1, wins: 0 }]);
    expect(await global()).toEqual([{ word: 'jazz', count: 2 }]);
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
