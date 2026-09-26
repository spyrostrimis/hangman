export function createImagePreloader(loadImage) {
  const requests = new Map();
  return function preload(url) {
    if (!requests.has(url)) {
      const request = Promise.resolve().then(() => loadImage(url)).catch(() => {
        // Speculation must never block navigation; allow a later retry.
        requests.delete(url);
      });
      requests.set(url, request);
    }
    return requests.get(url);
  };
}
