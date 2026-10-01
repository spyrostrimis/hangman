import { env, applyD1Migrations } from 'cloudflare:test';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SignJWT } from 'jose';
import app from '../src/index';
import { KDF } from '../../shared/auth-protocol.js';
import { deriveCredential } from '../../client/src/lib/credential.js';
import { AUDIENCE, ISSUER, makeVerifier, secretBytes } from '../src/crypto';
import manifest from '../../client/src/data/words.json';
import words from '../../tools/words.locked.json';

const origin = 'https://hangman.spyrostrimis.com';
let requestNumber = 0;
const allow = { limit: async () => ({ success: true }) };
function request(path: string, options: { method?: string; body?: unknown; cookie?: string; origin?: string; bindings?: object; headers?: object } = {}) {
  const { method = 'GET', body, cookie, bindings, headers } = options;
  return app.fetch(new Request(`${origin}/user/${path}`, {
    method,
    headers: { Origin: options.origin ?? origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': `192.0.2.${++requestNumber}`,
      ...(cookie ? { Cookie: cookie } : {}), ...headers },
    ...(method === 'GET' ? {} : { body: JSON.stringify(body ?? {}) }),
  }), { ...env, IP_LIMIT: allow, AUTH_LIMIT: allow, ...bindings });
}
const registration = (username = 'Player') => ({ username, salt: 'ab'.repeat(16), credential: 'cd'.repeat(32), version: KDF.version });
async function signup(username = 'Player') {
  const response = await request('signup', { method: 'POST', body: registration(username) });
  expect(response.status).toBe(200);
  return { cookie: response.headers.get('Set-Cookie')!.split(';')[0], data: await response.json() as { user: { id: string } } };
}
beforeAll(async () => { await applyD1Migrations(env.DB, env.TEST_MIGRATIONS); });
beforeEach(async () => { await env.DB.batch([env.DB.prepare('DELETE FROM rounds'), env.DB.prepare('DELETE FROM scores'), env.DB.prepare('DELETE FROM users'), env.DB.prepare('DELETE FROM deleted_accounts')]); });

afterEach(() => { vi.restoreAllMocks(); });

// Mature fixtures keep the existing concurrency/retry tests independent of wall time.
async function mature(ticket: Ticket) {
  await env.DB.prepare('UPDATE rounds SET issued_at = ? WHERE id = ?').bind(Date.now() - 5000, ticket.roundId).run();
  return ticket;
}
type Ticket = { roundId: string; word: string; issuedAt: number; expiresAt: number; serverNow: number };
async function start(cookie: string, previousRoundId?: string) {
  const response = await request('round/start', { method: 'POST', cookie, body: previousRoundId ? { previousRoundId } : {} });
  expect(response.status).toBe(200);
  return await response.json() as Ticket;
}
const win = (ticket: Ticket) => [...new Set(ticket.word)];
const claim = (cookie: string, ticket: Ticket, guesses: unknown = win(ticket)) =>
  request('round/claim', { method: 'POST', cookie, body: { roundId: ticket.roundId, guesses } });


describe('five-second scoring floor', () => {
  it('rejects at 4999 ms without consuming or awarding, then accepts the same ticket at 5000 ms', async () => {
    const { cookie } = await signup();
    const ticket = await start(cookie);
    expect(ticket.issuedAt).toBe(await env.DB.prepare('SELECT issued_at FROM rounds WHERE id = ?').bind(ticket.roundId).first('issued_at'));
    const clock = vi.spyOn(Date, 'now').mockReturnValue(ticket.issuedAt + 4999);
    const early = await claim(cookie, ticket);
    expect(early.status).toBe(409);
    expect(await early.json()).toMatchObject({ code: 'ROUND_TOO_EARLY', retryAfterMs: 1 });
    expect(await env.DB.prepare('SELECT claimed_at, claim_token FROM rounds WHERE id = ?').bind(ticket.roundId).first())
      .toEqual({ claimed_at: null, claim_token: null });
    expect(await env.DB.prepare('SELECT total FROM scores').first('total')).toBe(0);
    clock.mockReturnValue(ticket.issuedAt + 5000);
    const accepted = await claim(cookie, ticket);
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toEqual({ score: 100 });
    expect(await (await claim(cookie, ticket)).json()).toEqual({ score: 100 });
  });

  it('keeps a delayed start after the previous award so parallel requests cannot shorten the account floor', async () => {
    const { cookie } = await signup();
    const first = await start(cookie);
    const clock = vi.spyOn(Date, 'now').mockReturnValue(first.issuedAt + 5000);
    expect(await (await claim(cookie, first)).json()).toEqual({ score: 100 });
    // Simulate a start whose clock was sampled before the previous claim committed.
    clock.mockReturnValue(first.issuedAt);
    const next = await start(cookie);
    expect(next.issuedAt).toBe(first.issuedAt + 5000);
    clock.mockReturnValue(first.issuedAt + 9999);
    expect(await (await claim(cookie, next)).json()).toMatchObject({ code: 'ROUND_TOO_EARLY', retryAfterMs: 1 });
    clock.mockReturnValue(first.issuedAt + 10000);
    const claims = await Promise.all(Array.from({ length: 5 }, () => claim(cookie, next)));
    for (const response of claims) expect(await response.json()).toEqual({ score: 200 });
  });
});

describe('account deletion', () => {
  const remove = (cookie: string, credential = registration().credential) => request('delete-account', { method: 'POST', cookie, body: { credential } });
  const snapshot = async () => Promise.all(['users', 'scores', 'rounds', 'deleted_accounts'].map(async table =>
    (await env.DB.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()).results));

  it('wrong proof changes nothing; correct proof removes only the authenticated account and records its tombstone', async () => {
    const owner = await signup(); const other = await signup('Other');
    await claim(owner.cookie, await mature(await start(owner.cookie))); await start(owner.cookie);
    await claim(other.cookie, await mature(await start(other.cookie))); await start(other.cookie);
    const before = await snapshot();
    expect((await remove(owner.cookie, '00'.repeat(32))).status).toBe(403);
    expect(await snapshot()).toEqual(before);
    const response = await remove(owner.cookie);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Set-Cookie')).toContain('__Host-hangman_session=;');
    expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0');
    const after = await snapshot();
    expect(after[0]).toEqual(before[0].filter(row => row.id === other.data.user.id));
    expect(after[1]).toEqual(before[1].filter(row => row.user_id === other.data.user.id));
    expect(after[2]).toEqual(before[2].filter(row => row.user_id === other.data.user.id));
    expect(after[3]).toEqual([{ id: owner.data.user.id, deleted_at: expect.any(Number) }]);
    expect(await (await request('get-best-scores')).json()).toEqual([{ username: 'Other', score: 100 }]);
  });

  it('rejects a stale token on every protected route without recreating rows', async () => {
    const owner = await signup(); const ticket = await start(owner.cookie);
    expect((await request('me', { cookie: owner.cookie })).status).toBe(200);
    expect((await remove(owner.cookie)).status).toBe(200);
    const before = await snapshot();
    expect((await request('me', { cookie: owner.cookie })).status).toBe(401);
    expect((await request('round/start', { method: 'POST', cookie: owner.cookie })).status).toBe(401);
    expect((await claim(owner.cookie, ticket)).status).toBe(401);
    expect((await remove(owner.cookie)).status).toBe(401);
    expect(await snapshot()).toEqual(before);
  });

  it('re-registering the deleted username gets a fresh UUID and never revives its old cookie', async () => {
    const old = await signup();
    expect((await remove(old.cookie)).status).toBe(200);
    const replacement = await signup();
    expect(replacement.data.user.id).not.toBe(old.data.user.id);
    expect((await request('me', { cookie: old.cookie })).status).toBe(401);
    expect((await request('me', { cookie: replacement.cookie })).status).toBe(200);
    expect((await remove(old.cookie)).status).toBe(401);
    expect((await request('me', { cookie: replacement.cookie })).status).toBe(200);
  });

  it('requires cookie, exact Origin, bounded JSON and both rate limits before deleting', async () => {
    const owner = await signup(); const before = await snapshot();
    const options = { method: 'POST', cookie: owner.cookie, body: { credential: registration().credential } };
    expect((await request('delete-account', { ...options, cookie: undefined })).status).toBe(401);
    expect((await request('delete-account', { ...options, origin: 'https://attacker.example' })).status).toBe(403);
    expect((await request('delete-account', { ...options, headers: { 'Content-Type': 'text/plain' } })).status).toBe(415);
    expect((await request('delete-account', { ...options, body: { credential: 'x'.repeat(3000) } })).status).toBe(413);
    expect((await request('delete-account', { ...options, body: { credential: 'invalid' } })).status).toBe(400);
    const deny = { limit: async () => ({ success: false }) };
    for (const binding of ['IP_LIMIT', 'AUTH_LIMIT']) {
      const blocked = await request('delete-account', { ...options, bindings: { [binding]: deny } });
      expect(blocked.status).toBe(429); expect(blocked.headers.get('Retry-After')).toBe('60');
    }
    let limitedKey = '';
    expect((await request('delete-account', { ...options, bindings: { AUTH_LIMIT: { limit: async ({ key }: { key: string }) => { limitedKey = key; return { success: false }; } } } })).status).toBe(429);
    expect(limitedKey).toBe('auth:player');
    expect(await snapshot()).toEqual(before);
    expect((await remove(owner.cookie)).status).toBe(200);
  });

  it('rolls back the tombstone and all deletes when any batch statement fails', async () => {
    const owner = await signup(); await start(owner.cookie); const before = await snapshot();
    await env.DB.exec("CREATE TRIGGER fail_deletion BEFORE DELETE ON users BEGIN SELECT RAISE(ABORT, 'test failure'); END");
    try {
      expect((await remove(owner.cookie)).status).toBe(500);
      expect(await snapshot()).toEqual(before);
    } finally { await env.DB.exec('DROP TRIGGER fail_deletion'); }
    expect((await remove(owner.cookie)).status).toBe(200);

  });
});

describe('account API with real local D1 and Workers crypto', () => {
  it('creates a zero-score user, stores a verifier rather than credential, and issues a secure session', async () => {
    const response = await request('signup', { method: 'POST', body: registration() });
    expect(response.status).toBe(200);
    const cookie = response.headers.get('Set-Cookie')!;
    for (const flag of ['__Host-hangman_session=', 'HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=86400']) expect(cookie).toContain(flag);
    expect(cookie).not.toContain('Domain=');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const data = await response.json() as { user: object };
    expect(Object.keys(data)).toEqual(['user']);
    expect(data.user).toMatchObject({ username: 'Player', score: 0 });
    const stored = await env.DB.prepare('SELECT * FROM users').first();
    expect(stored?.verifier).toMatch(/^[a-f0-9]{64}$/);
    expect(stored?.verifier).not.toBe(registration().credential);
    const me = await request('me', { cookie: cookie.split(';')[0] });
    expect(await me.json()).toEqual(data);
    expect((await request('me')).status).toBe(401);
  });

  it('uses actual browser derivation for signup and login, rejects a different password', async () => {
    const parameters = { ...KDF, salt: registration().salt };
    const credential = await deriveCredential('A test passphrase with spaces', parameters);
    const created = await request('signup', { method: 'POST', body: { ...registration(), credential } });
    expect(created.status).toBe(200);
    const params = await (await request('auth-params', { method: 'POST', body: { username: 'PLAYER' } })).json();
    expect(params).toEqual(parameters);
    const good = await deriveCredential('A test passphrase with spaces', params);
    expect((await request('login', { method: 'POST', body: { username: 'player', credential: good } })).status).toBe(200);
    const wrong = await deriveCredential('A different test passphrase', params);
    expect((await request('login', { method: 'POST', body: { username: 'player', credential: wrong } })).status).toBe(401);
  });

  it('returns stable indistinguishable parameter shapes for unknown names and generic login failures', async () => {
    await signup();
    const params = async (username: string) => (await request('auth-params', { method: 'POST', body: { username } })).json();
    const real = await params('Player') as Record<string, unknown>;
    const fake = await params('Missing') as Record<string, unknown>;
    expect(fake).toEqual(await params('MISSING'));
    expect(Object.keys(fake)).toEqual(Object.keys(real));
    expect(fake).toMatchObject(KDF);
    expect(fake.salt).toMatch(/^[a-f0-9]{32}$/);
    expect(fake.salt).not.toEqual((await params('Different') as Record<string, unknown>).salt);
    const bad = async (username: string) => request('login', { method: 'POST', body: { username, credential: '00'.repeat(32) } });
    const known = await bad('Player'); const unknown = await bad('Missing');
    expect(known.status).toBe(401); expect(unknown.status).toBe(401);
    expect(await unknown.json()).toEqual(await known.json());
    expect((await request('login', { method: 'POST', body: registration() })).status).toBe(200);
  });

  it('caps new usernames at 20 characters while older 35-character accounts can still sign in', async () => {
    expect((await request('signup', { method: 'POST', body: registration('a'.repeat(21)) })).status).toBe(400);
    expect((await request('signup', { method: 'POST', body: registration('a'.repeat(20)) })).status).toBe(200);
    const legacy = 'b'.repeat(28);
    const { salt, credential } = registration();
    await env.DB.batch([
      env.DB.prepare('INSERT INTO users (id, username, username_key, salt, verifier) VALUES (?, ?, ?, ?, ?)')
        .bind('legacy', legacy, legacy, salt, await makeVerifier(env.AUTH_PEPPER, legacy, salt, credential)),
      env.DB.prepare('INSERT INTO scores (user_id) VALUES (?)').bind('legacy'),
    ]);
    expect((await request('auth-params', { method: 'POST', body: { username: legacy } })).status).toBe(200);
    expect((await request('login', { method: 'POST', body: { username: legacy, credential } })).status).toBe(200);
    expect((await request('login', { method: 'POST', body: { username: 'b'.repeat(36), credential } })).status).toBe(400);
  });

  it('handles duplicate-name races atomically and rejects malformed credentials', async () => {
    const responses = await Promise.all(['Player', 'PLAYER'].map(username => request('signup', { method: 'POST', body: registration(username) })));
    expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM scores').first('count')).toBe(1);
    for (const change of [{ username: '<script>' }, { credential: 'password' }, { salt: 'short' }, { version: 0 }]) {
      expect((await request('signup', { method: 'POST', body: { ...registration('Other'), ...change } })).status).toBe(400);
    }
    expect((await request('signup', { method: 'POST', body: registration('Other') })).status).toBe(200);
  });

  it('requires trusted origin and bounded JSON, and applies both rate limit bindings', async () => {
    expect((await request('signup', { method: 'POST', body: registration(), origin: 'https://attacker.example' })).status).toBe(403);
    expect((await request('signup', { method: 'POST', body: registration(), headers: { 'Content-Type': 'text/plain' } })).status).toBe(415);
    expect((await request('signup', { method: 'POST', body: { extra: 'a'.repeat(3000) } })).status).toBe(413);
    const deny = { limit: async () => ({ success: false }) };
    const blocked = await request('auth-params', { method: 'POST', body: { username: 'Player' }, bindings: { IP_LIMIT: deny } });
    expect(blocked.status).toBe(429); expect(blocked.headers.get('Retry-After')).toBe('60');
    expect((await request('signup', { method: 'POST', body: registration(), bindings: { AUTH_LIMIT: deny } })).status).toBe(429);
    expect((await request('signup', { method: 'POST', body: registration() })).status).toBe(200);
  });

  it('rejects expired and incorrectly scoped sessions and clears the cookie on logout', async () => {
    const { cookie, data } = await signup();
    const base = () => new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject(data.user.id).setIssuer(ISSUER).setAudience(AUDIENCE).setIssuedAt();
    const tokens = [
      await base().setExpirationTime(Math.floor(Date.now() / 1000) - 60).sign(secretBytes(env.JWT_SECRET)),
      await base().setAudience('other').setExpirationTime('1h').sign(secretBytes(env.JWT_SECRET)),
      await base().setExpirationTime('1h').sign(crypto.getRandomValues(new Uint8Array(32))),
    ];
    for (const token of tokens) expect((await request('me', { cookie: `__Host-hangman_session=${token}` })).status).toBe(401);
    expect((await request('me', { cookie })).status).toBe(200);
    const logout = await request('logout', { method: 'POST', cookie });
    expect(logout.status).toBe(200); expect(logout.headers.get('Set-Cookie')).toContain('Max-Age=0');
  });

  it('awards mature wins once under concurrent claims and exposes only safe leaderboard fields', async () => {
    expect(await (await request('get-best-scores')).json()).toEqual([]);
    const { cookie } = await signup(); await signup('Other');
    expect((await request('add100', { method: 'PUT', cookie })).status).toBe(404);
    expect((await request('round/start', { method: 'POST' })).status).toBe(401);
    const ticket = await start(cookie);
    await mature(ticket);
    expect(words).toContain(ticket.word);
    expect(ticket.expiresAt).toBeGreaterThan(Date.now());
    const responses = await Promise.all(Array.from({ length: 5 }, () => claim(cookie, ticket)));
    expect(responses.map(r => r.status)).toEqual([200, 200, 200, 200, 200]);
    for (const response of responses) expect(await response.json()).toEqual({ score: 100 });
    // A lost success response can be retried even after the next round starts.
    const next = await start(cookie);
    await mature(next);
    expect(next.roundId).not.toBe(ticket.roundId);
    expect(await (await claim(cookie, ticket)).json()).toEqual({ score: 100 });
    expect(await (await claim(cookie, next)).json()).toEqual({ score: 200 });
    expect(await (await request('get-best-scores')).json()).toEqual([{ username: 'Player', score: 200 }, { username: 'Other', score: 0 }]);
  });

  it('keeps the server vocabulary aligned with the browser manifest', () => {
    expect([...words].sort()).toEqual(manifest.words.map(record => record.word).sort());
  });

  it('resumes one outstanding round across concurrent starts and replaces only an owned round', async () => {
    const { cookie } = await signup();
    const other = await signup('Other');
    const tickets = await Promise.all(Array.from({ length: 5 }, () => start(cookie)));
    expect(new Set(tickets.map(ticket => ticket.roundId)).size).toBe(1);
    const foreign = await start(other.cookie);
    await mature(foreign);
    const same = await start(cookie, foreign.roundId);
    expect(same.roundId).toBe(tickets[0].roundId);
    const replacements = await Promise.all(Array.from({ length: 5 }, () => start(cookie, same.roundId)));
    expect(new Set(replacements.map(ticket => ticket.roundId)).size).toBe(1);
    expect(replacements[0].roundId).not.toBe(same.roundId);
    expect((await claim(cookie, same)).status).toBe(409);
    expect((await claim(cookie, foreign)).status).toBe(409);
    expect((await claim(other.cookie, foreign)).status).toBe(200);
  });

  it('rejects fabricated tickets, invalid histories, extra fields and guesses after game over', async () => {
    const { cookie } = await signup();
    const ticket = await start(cookie);
    await mature(ticket);
    // Fixed answer makes order-sensitive failures deterministic.
    await env.DB.prepare('UPDATE rounds SET word = ? WHERE id = ?').bind('puzzle', ticket.roundId).run();
    ticket.word = 'puzzle';
    expect((await claim('', ticket)).status).toBe(401);
    expect((await claim(cookie, { ...ticket, roundId: crypto.randomUUID() })).status).toBe(409);
    for (const guesses of [null, 'puzle', [], ['p'], ['P', 'u', 'z', 'l', 'e'], ['!'], ['p', 'p', 'u', 'z', 'l', 'e'],
      [...'abcdfgpuzle'], [...'puzlea'], Array(27).fill('p'), [1]]) {
      expect((await claim(cookie, ticket, guesses)).status).toBe(400);
    }
    expect((await request('round/start', { method: 'POST', cookie, body: { word: 'puzzle' } })).status).toBe(400);
    expect((await request('round/claim', { method: 'POST', cookie, body: { roundId: ticket.roundId, guesses: win(ticket), score: 9000 } })).status).toBe(400);
    expect((await claim(cookie, ticket, [...'abcdfpuzle'])).status).toBe(200);
    expect(await env.DB.prepare('SELECT total FROM scores').first('total')).toBe(100);
  });

  it('expires unclaimed rounds, retains successful retries, and prunes old tickets without changing totals', async () => {
    const { cookie } = await signup();
    const expired = await start(cookie);
    await env.DB.prepare('UPDATE rounds SET expires_at = ? WHERE id = ?').bind(Date.now() - 1, expired.roundId).run();
    expect((await claim(cookie, expired)).status).toBe(409);
    const ticket = await start(cookie);
    expect(ticket.roundId).not.toBe(expired.roundId);
    await mature(ticket);
    expect((await claim(cookie, ticket)).status).toBe(200);
    await env.DB.prepare('UPDATE rounds SET expires_at = ? WHERE id = ?').bind(Date.now() - 1, ticket.roundId).run();
    expect(await (await claim(cookie, ticket)).json()).toEqual({ score: 100 });
    await env.DB.prepare('UPDATE rounds SET expires_at = ? WHERE id = ?').bind(Date.now() - 25 * 60 * 60 * 1000, ticket.roundId).run();
    await start(cookie);
    expect((await claim(cookie, ticket)).status).toBe(409);
    expect(await env.DB.prepare('SELECT total FROM scores').first('total')).toBe(100);
  });

  it('does not consume a round at the score ceiling and rolls consumption back when the increment fails', async () => {
    const { cookie, data } = await signup();
    const ticket = await start(cookie);
    await mature(ticket);
    await env.DB.prepare('UPDATE scores SET total = 9007199254740900 WHERE user_id = ?').bind(data.user.id).run();
    expect((await claim(cookie, ticket)).status).toBe(409);
    expect(await env.DB.prepare('SELECT claimed_at FROM rounds WHERE id = ?').bind(ticket.roundId).first('claimed_at')).toBeNull();
    await env.DB.prepare('UPDATE scores SET total = 0 WHERE user_id = ?').bind(data.user.id).run();
    await env.DB.exec("CREATE TRIGGER test_fail_award BEFORE UPDATE ON scores BEGIN SELECT RAISE(ABORT, 'test failure'); END;");
    try {
      expect((await claim(cookie, ticket)).status).toBe(500);
      expect(await env.DB.prepare('SELECT claimed_at FROM rounds WHERE id = ?').bind(ticket.roundId).first('claimed_at')).toBeNull();
      expect(await env.DB.prepare('SELECT total FROM scores WHERE user_id = ?').bind(data.user.id).first('total')).toBe(0);
    } finally { await env.DB.exec('DROP TRIGGER test_fail_award;'); }
    expect(await (await claim(cookie, ticket)).json()).toEqual({ score: 100 });
  });

  it('bounds the leaderboard to 100 and orders tied scores deterministically', async () => {
    const statements = [];
    for (let index = 0; index < 101; index++) {
      const id = `fixture-${String(index).padStart(3, '0')}`;
      statements.push(env.DB.prepare('INSERT INTO users (id, username, username_key, salt, verifier) VALUES (?, ?, ?, ?, ?)')
        .bind(id, `Player${index}`, `player${index}`, 'ab'.repeat(16), 'cd'.repeat(32)));
      statements.push(env.DB.prepare('INSERT INTO scores (user_id, total) VALUES (?, ?)').bind(id, index === 100 ? 100 : 0));
    }
    await env.DB.batch(statements);
    const rows = await (await request('get-best-scores')).json() as { username: string; score: number }[];
    expect(rows).toHaveLength(100);
    expect(rows[0]).toEqual({ username: 'Player100', score: 100 });
    expect(rows[1]).toEqual({ username: 'Player0', score: 0 });
    expect(rows[99]).toEqual({ username: 'Player98', score: 0 });
  });
});
