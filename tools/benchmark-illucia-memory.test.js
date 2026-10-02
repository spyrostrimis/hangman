import assert from 'node:assert/strict';
import test from 'node:test';
import { loadLexicons } from './benchmark-illucia.js';
import { PLAYER_GAMES, syntheticPlayers } from './benchmark-illucia-memory.js';
import { toBrain } from '../client/src/lib/illucia/brain.js';

test('synthetic players are valid C2 memories spanning the prior ramp, fixed by the seed', async () => {
  const { entriesByLength } = await loadLexicons();
  const players = syntheticPlayers(entriesByLength);
  assert.deepEqual(players, syntheticPlayers(entriesByLength));
  assert.deepEqual(players.map(player => player.games), [...PLAYER_GAMES]);
  for (const player of players) assert.doesNotThrow(() => toBrain(player, 5));
  assert.equal(new Set(players.map(player => player.personalitySeed)).size, players.length);
  // Letter counts come from real histories: E is in many past words, Q in few.
  const veteran = players.at(-1);
  assert.ok(veteran.letters.e > 100 && veteran.letters.q < 20, JSON.stringify(veteran.letters));
  assert.ok(Object.values(players[0].letters).every(count => count === 0)); // Control: no games, no habits.
});
