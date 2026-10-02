// Illucia's accepted words, imported from the same per-length files the browser
// loads. Every line is `word NN\n` (ESDB size, always two digits), sorted, so a
// word is found by binary search over the raw text without parsing it.
import w4 from '../../client/public/illucia/words/4.txt';
import w5 from '../../client/public/illucia/words/5.txt';
import w6 from '../../client/public/illucia/words/6.txt';
import w7 from '../../client/public/illucia/words/7.txt';
import w8 from '../../client/public/illucia/words/8.txt';
import w9 from '../../client/public/illucia/words/9.txt';
import w10 from '../../client/public/illucia/words/10.txt';
import w11 from '../../client/public/illucia/words/11.txt';
import w12 from '../../client/public/illucia/words/12.txt';
import w13 from '../../client/public/illucia/words/13.txt';
import w14 from '../../client/public/illucia/words/14.txt';
import w15 from '../../client/public/illucia/words/15.txt';

export const ILLUCIA_WORD_FILES: Readonly<Record<number, string>> = Object.freeze({
  4: w4, 5: w5, 6: w6, 7: w7, 8: w8, 9: w9, 10: w10, 11: w11, 12: w12, 13: w13, 14: w14, 15: w15,
});

/** The word's ESDB size if it is an accepted Illucia word, otherwise null. */
export function illuciaWordSize(word: unknown): number | null {
  if (typeof word !== 'string' || !/^[a-z]{4,15}$/.test(word)) return null;
  const text = ILLUCIA_WORD_FILES[word.length];
  const width = word.length + 4;
  // A changed line format must fail loudly rather than misread offsets.
  if (text.length % width !== 0) throw new Error('Illucia word file format changed.');
  let low = 0;
  let high = text.length / width - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const start = middle * width;
    const candidate = text.slice(start, start + word.length);
    if (candidate === word) return Number(text.slice(start + word.length + 1, start + word.length + 3));
    if (candidate < word) low = middle + 1;
    else high = middle - 1;
  }
  return null;
}
