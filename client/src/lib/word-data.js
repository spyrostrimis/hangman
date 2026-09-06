export const PRODUCTION_ASSET_BASE_URL =
  "https://assets.hangman.spyrostrimis.com";

export function selectRandomWord(words, random = Math.random) {
  if (!Array.isArray(words) || words.length === 0) {
    throw new TypeError("words must be a non-empty array");
  }

  const randomValue = random();
  if (
    typeof randomValue !== "number" ||
    !Number.isFinite(randomValue) ||
    randomValue < 0 ||
    randomValue >= 1
  ) {
    throw new RangeError(
      "random must return a number from 0 up to, but not including, 1"
    );
  }

  return words[Math.floor(randomValue * words.length)];
}

export function buildAssetUrl(key, baseUrl = PRODUCTION_ASSET_BASE_URL) {
  if (typeof key !== "string" || key.length === 0) {
    throw new TypeError("asset key must be a non-empty string");
  }

  if (typeof baseUrl !== "string" || baseUrl.length === 0) {
    throw new TypeError("asset base URL must be a non-empty string");
  }

  return `${baseUrl.replace(/\/+$/, "")}/${key.replace(/^\/+/, "")}`;
}
