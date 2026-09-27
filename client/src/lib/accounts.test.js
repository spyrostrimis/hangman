import test from 'node:test';
import assert from 'node:assert/strict';
import { pbkdf2Sync } from 'node:crypto';
import { deriveCredential, registrationParameters, KDF } from './credential.js';
import { createRoundScoreTracker } from './round-score.js';

test('credential matches independent PBKDF2 and is separated by salt; unsafe parameters are refused', async () => {
  const password = 'A test passphrase with spaces';
  const params = { ...KDF, salt: 'ab'.repeat(16) };
  const expected = pbkdf2Sync(password, `hangman.spyrostrimis.com:password:v1:${params.salt}`, 600000, 32, 'sha256').toString('hex');
  assert.equal(await deriveCredential(password, params), expected);
  assert.notEqual(await deriveCredential(password, { ...params, salt: 'cd'.repeat(16) }), expected);
  for (const change of [{ iterations: 1 }, { version: 2 }, { algorithm: 'SHA256' }, { salt: 'bad' }]) {
    await assert.rejects(deriveCredential(password, { ...params, ...change }), /Unsupported/);
  }
  const first = registrationParameters(), second = registrationParameters();
  assert.match(first.salt, /^[a-f0-9]{32}$/);
  assert.notEqual(first.salt, second.salt);
});

test('one score claim per winning round, including rerenders, guest wins, and next rounds', () => {
  const claim = createRoundScoreTracker();
  const round = {};
  assert.equal(claim(round, false, 'player'), false);
  assert.equal(claim(round, true, 'player'), true);
  assert.equal(claim(round, true, 'player'), false);
  assert.equal(claim(round, true, 'other-player'), false);
  const guestRound = {};
  assert.equal(claim(guestRound, true, undefined), false);
  assert.equal(claim(guestRound, true, 'player'), false);
  assert.equal(claim(null, true, 'player'), false);
  assert.equal(claim({}, true, 'player'), true);
});
