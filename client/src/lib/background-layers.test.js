import test from 'node:test';
import assert from 'node:assert/strict';
import { initialLayers, markFailed, markReady, settle, showArt } from './background-layers.js';

const home = { desktop: '/home.webp' };
const hall = { desktop: '/hall.webp' };
const game = { desktop: '/game.webp' };
const view = layers => layers.map(layer => `${layer.art.desktop}:${layer.status}`);

test('the previous art stays under new art until the new art has faded in', () => {
  let layers = markReady(initialLayers(home), home.desktop);
  layers = showArt(layers, hall);
  assert.deepEqual(view(layers), ['/home.webp:ready', '/hall.webp:loading']);
  layers = markReady(layers, hall.desktop);
  assert.deepEqual(view(layers), ['/home.webp:ready', '/hall.webp:ready']);
  layers = settle(layers, hall.desktop);
  assert.deepEqual(view(layers), ['/hall.webp:ready']);
});

test('art for a route left before it loaded is dropped, keeping the art on screen', () => {
  let layers = showArt(markReady(initialLayers(home), home.desktop), hall);
  layers = showArt(layers, game);
  assert.deepEqual(view(layers), ['/home.webp:ready', '/game.webp:loading']);
  // A late decode of the abandoned art must not resurrect it.
  assert.deepEqual(view(markReady(layers, hall.desktop)), view(layers));
});

test('returning to the art on screen cancels the pending change', () => {
  const layers = showArt(showArt(markReady(initialLayers(home), home.desktop), hall), home);
  assert.deepEqual(view(layers), ['/home.webp:ready']);
});

test('returning to art still fading in restarts it on top instead of duplicating it', () => {
  let layers = markReady(showArt(markReady(initialLayers(home), home.desktop), hall), hall.desktop);
  layers = showArt(layers, game);
  layers = markReady(layers, game.desktop);
  layers = showArt(layers, hall);
  assert.deepEqual(view(layers), ['/home.webp:ready', '/game.webp:ready', '/hall.webp:loading']);
});

test('settling removes only the layers beneath the finished one', () => {
  let layers = markReady(showArt(markReady(initialLayers(home), home.desktop), hall), hall.desktop);
  layers = showArt(layers, game);
  // The older fade finishing must not remove the art still loading above it.
  assert.deepEqual(view(settle(layers, hall.desktop)), ['/hall.webp:ready', '/game.webp:loading']);
  assert.deepEqual(view(settle(layers, home.desktop)), view(layers));
});

test('failed art releases the previous art, leaving the shell colour as before', () => {
  const layers = markFailed(showArt(markReady(initialLayers(home), home.desktop), hall), hall.desktop);
  assert.deepEqual(view(layers), ['/hall.webp:failed']);
  assert.deepEqual(view(showArt(layers, game)), ['/game.webp:loading']);
});
