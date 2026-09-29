import assert from 'node:assert/strict';
import test from 'node:test';
import { isEnglish, pickVoice, rankVoices } from './illucia/voices.js';

const voice = (name, lang, voiceURI = name) => ({ name, lang, voiceURI });
const names = voices => voices.map(value => value.name);

test('English voices come first, cloud and premium voices before plain ones, novelty voices last', () => {
  const ranked = rankVoices([
    voice('Zarvox', 'en-US'),
    voice('Microsoft David - English (United States)', 'en-US'),
    voice('Google Deutsch', 'de-DE'),
    voice('Google UK English Male', 'en-GB'),
    voice('Microsoft Aria Online (Natural) - English (United States)', 'en-US'),
    voice('Samantha (Enhanced)', 'en-US'),
    voice('Amélie', 'fr-CA'),
  ]);
  assert.deepEqual(names(ranked), [
    'Microsoft Aria Online (Natural) - English (United States)',
    'Samantha (Enhanced)',
    'Google UK English Male',
    'Microsoft David - English (United States)',
    'Zarvox',
    'Google Deutsch',
    'Amélie',
  ]);
});

test('Android-style language tags count as English, and other languages do not', () => {
  assert.equal(isEnglish(voice('English', 'en_US')), true);
  assert.equal(isEnglish(voice('English', 'en')), true);
  assert.equal(isEnglish(voice('Ελληνικά', 'el-GR')), false);
  assert.equal(isEnglish(voice('Español', 'es-US')), false);
});

test('a feminine voice wins a tie, and ranking is deterministic', () => {
  const tied = [voice('Microsoft Guy Online (Natural)', 'en-US'), voice('Microsoft Jenny Online (Natural)', 'en-US')];
  assert.deepEqual(names(rankVoices(tied)), ['Microsoft Jenny Online (Natural)', 'Microsoft Guy Online (Natural)']);
  assert.deepEqual(names(rankVoices([...tied].reverse())), names(rankVoices(tied)));
});

test('the stored voice is used while the browser still has it, else the best ranked one', () => {
  const ranked = rankVoices([voice('Karen', 'en-AU', 'karen-uri'), voice('Google US English', 'en-US', 'google-uri')]);
  assert.equal(pickVoice(ranked, 'karen-uri').name, 'Karen');
  assert.equal(pickVoice(ranked, 'gone-uri').name, 'Google US English');
  assert.equal(pickVoice(ranked, null).name, 'Google US English');
  assert.equal(pickVoice([], 'karen-uri'), null);
});
