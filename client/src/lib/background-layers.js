// Route art is a stack of layers, oldest first. The newest layer fades in over
// the ones below, which stay visible until it has fully settled, so navigation
// never dips to the bare page shell. Layers are identified by their desktop URL.

export function initialLayers(art) {
  return [{ art, status: 'loading' }];
}

export function showArt(layers, art) {
  // Only fully decoded art is worth keeping on screen beneath the new route;
  // art for a route the visitor has already left is dropped.
  const visible = layers.filter(layer => layer.status === 'ready');
  if (visible.at(-1)?.art.desktop === art.desktop) return visible;
  return [
    ...visible.filter(layer => layer.art.desktop !== art.desktop),
    { art, status: 'loading' },
  ];
}

export function markReady(layers, key) {
  return layers.map(layer =>
    layer.art.desktop === key && layer.status === 'loading' ? { ...layer, status: 'ready' } : layer
  );
}

// Once a layer has faded in completely, the layers it covers are invisible.
export function settle(layers, key) {
  const index = layers.findIndex(layer => layer.art.desktop === key);
  return index > 0 ? layers.slice(index) : layers;
}

// Failed art cannot cover anything, so older art goes too, as before: the route
// then shows the shell colour instead of the previous page's picture.
export function markFailed(layers, key) {
  return settle(
    layers.map(layer => (layer.art.desktop === key ? { ...layer, status: 'failed' } : layer)),
    key
  );
}
