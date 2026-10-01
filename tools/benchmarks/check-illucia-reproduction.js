// Compare complete benchmark reports, excluding only machine metadata and timings.
// Usage: node tools/benchmarks/check-illucia-reproduction.js <I3 rerun> <I3b rerun>
import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';

function deterministic(value) {
  if (Array.isArray(value)) return value.map(deterministic);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !['environment', 'decisionMilliseconds'].includes(key))
    .map(([key, item]) => [key, deterministic(item)]));
  return value;
}

for (const [index, id] of ['i3', 'i3b'].entries()) {
  const path = process.argv[index + 2];
  if (!path) throw new Error('Supply both complete rerun reports.');
  const expected = JSON.parse(await readFile(new URL(`illucia-${id}.json`, import.meta.url)));
  const actual = JSON.parse(await readFile(path));
  console.log(`${id} manifest: ${actual.configuration.manifestSha256}`);
  console.log(`${id} sample:   ${actual.configuration.sampleSha256}`);
  if (!isDeepStrictEqual(deterministic(expected), deterministic(actual))) {
    throw new Error(`${id}: non-timing mismatch. Stop further measurement.`);
  }
  console.log(`${id}: ALL NON-TIMING FIELDS MATCH`);
}
