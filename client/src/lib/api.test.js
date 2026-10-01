import test from 'node:test';
import assert from 'node:assert/strict';
import { apiRequest, ApiError } from './api.js';

test('preserves the early-claim code and retry delay from a real JSON response', async t => {
  let early = true;
  t.mock.method(globalThis, 'fetch', async () => early ? new Response(JSON.stringify({
    message: 'The round is not ready to be claimed.', code: 'ROUND_TOO_EARLY', retryAfterMs: 1,
  }), { status: 409 }) : new Response(JSON.stringify({ score: 100 }), { status: 200 }));
  await assert.rejects(apiRequest('/user/round/claim', { method: 'POST' }), error => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 409);
    assert.equal(error.code, 'ROUND_TOO_EARLY');
    assert.equal(error.retryAfterMs, 1);
    return true;
  });
  early = false;
  assert.deepEqual(await apiRequest('/user/round/claim', { method: 'POST' }), { score: 100 });
});
