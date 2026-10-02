import { describe, expect, it } from 'vitest';
import { ILLUCIA_WORD_FILES, illuciaWordSize } from '../src/illucia-words';
import { ILLUCIA_TIERS, illuciaStumpPoints } from '../../shared/scoring-protocol.js';
import { VOCABULARY_TIERS, isAcceptedWord, parseLexicon } from '../../client/src/lib/illucia/lexicon.js';

const lengths = Object.keys(ILLUCIA_WORD_FILES).map(Number);
// A string near a real word that is absent from its file: vary the last letter.
function absentNear(word: string, known: Set<string>) {
  for (const letter of 'abcdefghijklmnopqrstuvwxyz') {
    const candidate = word.slice(0, -1) + letter;
    if (!known.has(candidate)) return candidate;
  }
  return null;
}

describe('Illucia server vocabulary', () => {
  it('imports exactly lengths 4-15', () => {
    expect(lengths).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  });

  it('finds every word the browser parses, with its size, and rejects absent neighbours', () => {
    let found = 0; let rejected = 0;
    for (const length of lengths) {
      const entries = parseLexicon(ILLUCIA_WORD_FILES[length], length);
      const known = new Set(entries.map(entry => entry.word));
      entries.forEach((entry, index) => {
        expect(illuciaWordSize(entry.word)).toBe(entry.size);
        found++;
        if (index % 25 === 0) {
          const absent = absentNear(entry.word, known);
          if (absent) { expect(illuciaWordSize(absent)).toBeNull(); rejected++; }
        }
      });
    }
    expect(found).toBeGreaterThan(130000);
    expect(rejected).toBeGreaterThan(5000);
  });

  it('agrees with the browser acceptance check at both ends of each file and on absent words', () => {
    for (const length of lengths) {
      const entries = parseLexicon(ILLUCIA_WORD_FILES[length], length);
      const known = new Set(entries.map(entry => entry.word));
      const samples = [entries[0].word, entries.at(-1)!.word, entries[entries.length >> 1].word];
      samples.push(...samples.map(word => absentNear(word, known)!), 'a'.repeat(length), 'z'.repeat(length));
      for (const word of samples) expect(illuciaWordSize(word) !== null).toBe(isAcceptedWord(word, entries));
    }
  });

  it('rejects non-strings, wrong case, characters outside a-z, and lengths outside 4-15', () => {
    const word = parseLexicon(ILLUCIA_WORD_FILES[5], 5)[0].word;
    expect(illuciaWordSize(word)).not.toBeNull();
    for (const value of [undefined, null, 5, ['word'], word.toUpperCase(), ` ${word}`, `${word}\n`, `${word.slice(0, 4)}-`,
      'cat', 'abc', 'a'.repeat(16), '']) {
      expect(illuciaWordSize(value)).toBeNull();
    }
  });

  it('keeps the fixed-width line format the lookup depends on', () => {
    for (const length of lengths) {
      const text = ILLUCIA_WORD_FILES[length];
      expect(text.length % (length + 4)).toBe(0);
      expect(text).toMatch(new RegExp(`^(?:[a-z]{${length}} (?:35|40|50|55|60|65|70)\\n)+$`));
    }
  });
});

describe('Illucia points', () => {
  it('uses the same tier ceilings as the browser', () => {
    expect(ILLUCIA_TIERS.map(({ id, maxSize }) => ({ id, maxSize })))
      .toEqual(VOCABULARY_TIERS.map(({ id, maxSize }) => ({ id, maxSize })));
  });

  it('pays tier base × min(length − 3, 3), multiplied by 1.5 or 2 for answered questions', () => {
    const table = Object.fromEntries(ILLUCIA_TIERS.map(({ id }) =>
      [id, [4, 5, 6, 15].map(length => [0, 1, 2].map(questions => illuciaStumpPoints(id, length, questions)))]));
    expect(table).toEqual({
      apprentice: [[30, 45, 60], [60, 90, 120], [90, 135, 180], [90, 135, 180]],
      scholar: [[40, 60, 80], [80, 120, 160], [120, 180, 240], [120, 180, 240]],
      master: [[50, 75, 100], [100, 150, 200], [150, 225, 300], [150, 225, 300]],
    });
  });

  it('rejects unknown tiers, out-of-range lengths and question counts', () => {
    expect(illuciaStumpPoints('master', 6)).toBe(150);
    for (const args of [['grandmaster', 6, 0], ['master', 3, 0], ['master', 16, 0], ['master', 6.5, 0],
      ['master', 6, 3], ['master', 6, -1], ['master', 6, 1.5]] as const) {
      expect(() => illuciaStumpPoints(...args)).toThrow(RangeError);
    }
  });
});
