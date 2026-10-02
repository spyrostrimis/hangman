import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { getCookie, setCookie } from 'hono/cookie';
import { KDF, SALT_PATTERN, CREDENTIAL_PATTERN, USERNAME_PATTERN, SIGNIN_USERNAME_PATTERN, normalizeUsername } from '../../shared/auth-protocol.js';
import { checkVerifier, fakeSalt, makeVerifier, sessionToken, sessionUserId, SESSION_SECONDS } from './crypto';
import { claimRound, isRoundId, startRound } from './rounds';
import { scheduledRetention } from './retention';
import { claimIlluciaRound, isAnsweredQuestions, isIlluciaTier, startIlluciaRound } from './illucia';
import { illuciaWordSize } from './illucia-words';
import { ILLUCIA_NOT_ACCEPTED_WORD } from '../../shared/scoring-protocol.js';

type AppEnv = { Bindings: Env; Variables: { user: PublicUser } };
type PublicUser = { id: string; username: string; score: number };
type Account = { id: string; username: string; salt: string; verifier: string };
const app = new Hono<AppEnv>();
type C = Context<AppEnv>;
const failure = (c: C, message: string, status: 400 | 401 | 403 | 409 | 413 | 415 | 429 | 500) => c.json({ message }, status);
function local(c: C) {
  return c.env.LOCAL_DEV === 'true' && ['localhost', '127.0.0.1'].includes(new URL(c.req.url).hostname);
}
const cookieName = (c: C) => local(c) ? 'hangman_session' : '__Host-hangman_session';
function cookieOptions(c: C) {
  return { httpOnly: true, secure: !local(c), sameSite: 'Lax' as const, path: '/', maxAge: SESSION_SECONDS };
}
async function signIn(c: C, user: PublicUser) {
  setCookie(c, cookieName(c), await sessionToken(c.env.JWT_SECRET, user.id), cookieOptions(c));
  return c.json({ user });
}
async function readInput(c: C): Promise<Record<string, unknown> | null> {
  try {
    const value = await c.req.json();
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch { return null; }
}
function usernameFrom(input: Record<string, unknown> | null, pattern = SIGNIN_USERNAME_PATTERN) {
  const value = input?.username;
  return typeof value === 'string' && pattern.test(value.trim()) ? value.trim() : null;
}
async function accountLimit(c: C, key: string) {
  const result = await c.env.AUTH_LIMIT.limit({ key: `auth:${key}` });
  if (!result.success) c.header('Retry-After', '60');
  return result.success;
}
app.use('*', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  c.header('X-Content-Type-Options', 'nosniff');
  if (!['GET', 'HEAD'].includes(c.req.method)) {
    if (c.req.header('Origin') !== c.env.APP_ORIGIN) return failure(c, 'Request origin is not allowed.', 403);
    if (c.req.header('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return failure(c, 'JSON is required.', 415);
  }
  const { success } = await c.env.IP_LIMIT.limit({ key: `ip:${c.req.header('CF-Connecting-IP') ?? 'local'}` });
  if (!success) {
    c.header('Retry-After', '60');
    return failure(c, 'Too many requests. Please try again in a minute.', 429);
  }
  await next();
});
app.use('*', bodyLimit({ maxSize: 2048, onError: c => failure(c, 'Request is too large.', 413) }));
app.post('/user/auth-params', async c => {
  const username = usernameFrom(await readInput(c));
  if (!username) return failure(c, 'Use 3–35 letters or numbers for your username.', 400);
  const key = normalizeUsername(username);
  const dummy = await fakeSalt(c.env.SALT_SECRET, key);
  const row = await c.env.DB.prepare('SELECT salt FROM users WHERE username_key = ?').bind(key).first<{ salt: string }>();
  return c.json({ ...KDF, salt: row?.salt ?? dummy });
});
app.post('/user/signup', async c => {
  const input = await readInput(c);
  const username = usernameFrom(input, USERNAME_PATTERN);
  if (!username || !input || typeof input.credential !== 'string' || !CREDENTIAL_PATTERN.test(input.credential)
    || typeof input.salt !== 'string' || !SALT_PATTERN.test(input.salt) || input.version !== KDF.version) return failure(c, 'Invalid registration details.', 400);
  const key = normalizeUsername(username);
  if (!await accountLimit(c, key)) return failure(c, 'Too many attempts. Please try again in a minute.', 429);
  const id = crypto.randomUUID();
  const verifier = await makeVerifier(c.env.AUTH_PEPPER, key, input.salt, input.credential);
  try {
    await c.env.DB.batch([
      c.env.DB.prepare('INSERT INTO users (id, username, username_key, salt, verifier) VALUES (?, ?, ?, ?, ?)').bind(id, username, key, input.salt, verifier),
      c.env.DB.prepare('INSERT INTO scores (user_id) VALUES (?)').bind(id),
    ]);
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed: users.username_key')) return failure(c, 'Username already exists.', 409);
    throw error;
  }
  return signIn(c, { id, username, score: 0 });
});
app.post('/user/login', async c => {
  const input = await readInput(c);
  const username = usernameFrom(input);
  if (!username || !input || typeof input.credential !== 'string' || !CREDENTIAL_PATTERN.test(input.credential)) return failure(c, 'Invalid login details.', 400);
  const key = normalizeUsername(username);
  if (!await accountLimit(c, key)) return failure(c, 'Too many attempts. Please try again in a minute.', 429);
  const dummy = await fakeSalt(c.env.SALT_SECRET, key);
  const row = await c.env.DB.prepare('SELECT id, username, salt, verifier FROM users WHERE username_key = ?').bind(key).first<Account>();
  const valid = await checkVerifier(c.env.AUTH_PEPPER, key, row?.salt ?? dummy, input.credential, row?.verifier ?? '0'.repeat(64));
  if (!valid || !row) return failure(c, 'Invalid username or password.', 401);
  const score = await c.env.DB.prepare('SELECT total FROM scores WHERE user_id = ?').bind(row.id).first<{ total: number }>();
  if (!score) throw new Error('Account score missing');
  return signIn(c, { id: row.id, username: row.username, score: score.total });
});
app.post('/user/logout', c => {
  setCookie(c, cookieName(c), '', { ...cookieOptions(c), maxAge: 0 });
  return c.json({ ok: true });
});
app.get('/user/get-best-scores', async c => {
  const { results } = await c.env.DB.prepare(`SELECT users.username, scores.total AS score FROM scores JOIN users ON users.id = scores.user_id
    ORDER BY scores.total DESC, scores.user_id ASC LIMIT 100`).all();
  return c.json(results);
});
app.use('/user/me', authenticate);
app.use('/user/round/*', authenticate);
app.use('/user/illucia/*', authenticate);
app.use('/user/delete-account', authenticate);
async function authenticate(c: C, next: () => Promise<void>) {
  const token = getCookie(c, cookieName(c));
  if (!token) return failure(c, 'Please sign in.', 401);
  let id: string;
  try { id = await sessionUserId(c.env.JWT_SECRET, token); }
  catch { return failure(c, 'Your session has expired. Please sign in.', 401); }
  const user = await c.env.DB.prepare(`SELECT users.id, users.username, scores.total AS score
    FROM users JOIN scores ON users.id = scores.user_id WHERE users.id = ?`).bind(id).first<PublicUser>();
  if (!user) return failure(c, 'Please sign in.', 401);
  c.set('user', user);
  await next();
}
app.get('/user/me', c => c.json({ user: c.get('user') }));
app.post('/user/delete-account', async c => {
  const user = c.get('user');
  const key = normalizeUsername(user.username);
  if (!await accountLimit(c, key)) return failure(c, 'Too many attempts. Please try again in a minute.', 429);
  const input = await readInput(c);
  if (!input || Object.keys(input).some(key => key !== 'credential')
    || typeof input.credential !== 'string' || !CREDENTIAL_PATTERN.test(input.credential)) {
    return failure(c, 'Invalid deletion details.', 400);
  }
  const row = await c.env.DB.prepare('SELECT id, username, salt, verifier FROM users WHERE id = ?').bind(user.id).first<Account>();
  if (!row) return failure(c, 'Please sign in.', 401);
  if (!await checkVerifier(c.env.AUTH_PEPPER, key, row.salt, input.credential, row.verifier)) {
    return failure(c, 'Incorrect password. Your account has not been deleted.', 403);
  }
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO deleted_accounts (id, deleted_at) VALUES (?, ?) ON CONFLICT(id) DO NOTHING').bind(user.id, Date.now()),
    c.env.DB.prepare('DELETE FROM rounds WHERE user_id = ?').bind(user.id),
    c.env.DB.prepare('DELETE FROM illucia_beaten_words WHERE user_id = ?').bind(user.id),
    c.env.DB.prepare('DELETE FROM illucia_rounds WHERE user_id = ?').bind(user.id),
    c.env.DB.prepare('DELETE FROM illucia_players WHERE user_id = ?').bind(user.id),
    c.env.DB.prepare('DELETE FROM illucia_player_words WHERE user_id = ?').bind(user.id),
    c.env.DB.prepare('DELETE FROM illucia_tier_stats WHERE user_id = ?').bind(user.id),
    c.env.DB.prepare('DELETE FROM scores WHERE user_id = ?').bind(user.id),
    c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id),
  ]);
  setCookie(c, cookieName(c), '', { ...cookieOptions(c), maxAge: 0 });
  return c.json({ ok: true });
});
app.post('/user/round/start', async c => {
  const input = await readInput(c);
  if (!input || Object.keys(input).some(key => key !== 'previousRoundId')
    || (input.previousRoundId !== undefined && !isRoundId(input.previousRoundId))) {
    return failure(c, 'Invalid round request.', 400);
  }
  const previousRoundId = typeof input.previousRoundId === 'string' ? input.previousRoundId : null;
  return c.json(await startRound(c.env.DB, c.get('user').id, previousRoundId));
});
app.post('/user/round/claim', async c => {
  const input = await readInput(c);
  if (!input || Object.keys(input).some(key => !['roundId', 'guesses'].includes(key)) || !isRoundId(input.roundId)) {
    return failure(c, 'Invalid round claim.', 400);
  }
  const result = await claimRound(c.env.DB, c.get('user').id, input.roundId, input.guesses);
  if ('error' in result) return c.json({ message: result.error, code: result.code, retryAfterMs: result.retryAfterMs }, result.status);
  return c.json(result);
});
app.post('/user/illucia/start', async c => {
  const input = await readInput(c);
  if (!input || Object.keys(input).some(key => !['word', 'tier', 'experimental', 'previousRoundId'].includes(key))
    || !isIlluciaTier(input.tier) || (input.experimental !== undefined && typeof input.experimental !== 'boolean')
    || (input.previousRoundId !== undefined && !isRoundId(input.previousRoundId))) {
    return failure(c, 'Invalid round request.', 400);
  }
  if (illuciaWordSize(input.word) === null) {
    return c.json({ message: "That word is not in Illucia's word list.", code: ILLUCIA_NOT_ACCEPTED_WORD }, 400);
  }
  return c.json(await startIlluciaRound(c.env.DB, c.get('user').id, {
    word: input.word as string, tier: input.tier, experimental: input.experimental === true,
    previousRoundId: typeof input.previousRoundId === 'string' ? input.previousRoundId : null,
  }));
});
app.post('/user/illucia/claim', async c => {
  const input = await readInput(c);
  if (!input || Object.keys(input).some(key => !['roundId', 'guesses', 'answeredQuestions'].includes(key)) || !isRoundId(input.roundId)
    || (input.answeredQuestions !== undefined && !isAnsweredQuestions(input.answeredQuestions))) {
    return failure(c, 'Invalid round claim.', 400);
  }
  const answered = input.answeredQuestions === undefined ? 0 : input.answeredQuestions as number;
  const result = await claimIlluciaRound(c.env.DB, c.get('user').id, input.roundId, input.guesses, answered);
  if ('error' in result) return c.json({ message: result.error, code: result.code, retryAfterMs: result.retryAfterMs }, result.status);
  return c.json(result);
});
app.notFound(c => c.json({ message: 'Not found.' }, 404));
app.onError((_error, c) => {
  console.error(JSON.stringify({ event: 'api_failure', path: c.req.path, method: c.req.method }));
  return failure(c, 'Service unavailable. Please try again later.', 500);
});
export default { fetch: app.fetch, scheduled: scheduledRetention };
