import test from 'node:test';
import assert from 'node:assert/strict';
import { createImagePreloader } from './preload-images.js';
import { loadLeaderboard } from './leaderboard.js';

test('intent preloading shares pending and completed downloads, but loads distinct assets', async () => {
  const requests = [];
  let finish;
  const preload = createImagePreloader(url => {
    requests.push(url);
    return new Promise(resolve => { finish = resolve; });
  });
  const first = preload('/home.webp');
  assert.equal(preload('/home.webp'), first);
  await Promise.resolve();
  assert.deepEqual(requests, ['/home.webp']);
  finish();
  await first;
  assert.equal(preload('/home.webp'), first);
  const next = preload('/hall.webp');
  await Promise.resolve();
  assert.deepEqual(requests, ['/home.webp', '/hall.webp']);
  finish();
  await next;
});

test('failed image speculation is handled and can be retried', async () => {
  let calls = 0;
  const preload = createImagePreloader(() => {
    calls++;
    if (calls === 1) throw new Error('offline');
  });
  await preload('/home.webp');
  await preload('/home.webp');
  await preload('/home.webp');
  assert.equal(calls, 2);
});

test('leaderboard accepts populated and empty results and rejects malformed responses', async () => {
  const users = [{ username: 'Player', score: 100 }];
  assert.equal(await loadLeaderboard(undefined, async () => ({data: users})), users);
  assert.deepEqual(await loadLeaderboard(undefined, async () => ({data: []})), []);
  for (const data of [{msg: 'unavailable'}, null, [null], [{username: 'Player'}]]) {
    await assert.rejects(loadLeaderboard(undefined, async () => ({data})), /Invalid leaderboard/);
  }
});

test('leaderboard passes cancellation and a bounded timeout; failures reach the UI', async () => {
  const controller = new AbortController();
  let options;
  await loadLeaderboard(controller.signal, async (url, config) => {
    assert.equal(url, 'http://localhost:8000/user/get-best-scores');
    options = config;
    return {data: []};
  });
  assert.equal(options.signal, controller.signal);
  assert.equal(options.timeout, 10000);
  controller.abort();
  assert.equal(options.signal.aborted, true);
  await assert.rejects(loadLeaderboard(undefined, async () => { throw new Error('offline'); }), /offline/);
});
