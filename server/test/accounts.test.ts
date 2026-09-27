import { env, applyD1Migrations } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SignJWT } from 'jose';
import app from '../src/index';
import { KDF } from '../../shared/auth-protocol.js';
import { deriveCredential } from '../../client/src/lib/credential.js';
import { AUDIENCE, ISSUER, secretBytes } from '../src/crypto';

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
beforeEach(async () => { await env.DB.batch([env.DB.prepare('DELETE FROM scores'), env.DB.prepare('DELETE FROM users')]); });

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

  it('increments only the signed-in player atomically and exposes only safe leaderboard fields', async () => {
    expect(await (await request('get-best-scores')).json()).toEqual([]);
    const { cookie } = await signup(); await signup('Other');
    expect((await request('add100', { method: 'PUT' })).status).toBe(401);
    expect((await request('add100', { method: 'PUT', cookie, body: { score: 9999, userId: 'Other' } })).status).toBe(400);
    const responses = await Promise.all(Array.from({ length: 5 }, () => request('add100', { method: 'PUT', cookie })));
    expect(responses.map(r => r.status)).toEqual([200, 200, 200, 200, 200]);
    expect(await (await request('get-best-scores')).json()).toEqual([{ username: 'Player', score: 500 }, { username: 'Other', score: 0 }]);
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
