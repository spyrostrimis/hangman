import { getRemainingMisses, getRoundStatus } from '../hangman-core.js';

// Scripted voice for the Observatory page. Deterministic: the same round always
// gets the same line. Only code fills the placeholders; {word} is used only
// once the round is over.
const lines = {
  greeting: [
    'Father says you are clever with words. I would like to check his data.',
    'I have read every dictionary on Aurora. Twice. Your move.',
    'Pick a word. I will show you my working.',
  ],
  opening: [
    '{length} letters. {count} words fit. Hardly any.',
    '{count} possible {length}-letter words. Let me narrow that down.',
    'A {length}-letter secret. I am considering {count} of them.',
  ],
  firstHit: ['{letter}! Statistically likely, but still satisfying.', '{letter}. The first piece. {count} words left.', 'There you are, {letter}.'],
  firstMiss: ['No {letter}? Unexpected. Noted.', '{letter} is out. That is still information.', 'A miss on {letter}. Father would say: recalibrate.'],
  hit: ['{letter}. The field collapses to {count}.', '{letter} fits. {count} words still standing.', 'Confirmed: {letter}. My hypothesis survives.'],
  miss: ['No {letter}. Crossing it out.', '{letter} was wrong. {count} words remain.', 'That rules out {letter}. Onward.'],
  three: ['Three misses. You chose... interestingly.', 'Half my chances gone. Time to be precise.', 'Three misses. I may need to take notes.'],
  last: ['One chance left. I am not nervous. Robots do not get nervous. Mostly.', 'Last chance. Every letter counts now.', 'One more miss and you win. No pressure. For me.'],
  single: ['{letter}. Only one word fits now.', 'Only one word left in my notes after {letter}.', '{letter}. I think I know it now.'],
  rare: ['{letter}. Rare letters for rare words.', 'An uncommon choice: {letter}. Trust the numbers.', '{letter}. Father would raise an eyebrow.'],
  fallback: [
    'Your word is not in my {tier} vocabulary. Improvising from letter habits.',
    'No {tier} word fits. I will guess from letter statistics.',
    'Beyond my {tier} notes. Switching to letter frequencies.',
  ],
  solved: ['{word}. Quod erat demonstrandum.', '{word}! Solved in {turns} guesses.', 'It was {word}. Want to try something harder?'],
  failed: ['{word}?! That was not in my calculations. Well played.', '{word}. I am adding that to my notes. You win.', 'Six misses. {word} beat me, fair and square.'],
};

function pick(event, index, values = {}) {
  return lines[event][index % lines[event].length].replace(/\{(\w+)\}/g, (_, key) => values[key]);
}

export const greetingLine = seed => pick('greeting', seed);
export const openingLine = (length, count) => pick('opening', length, { length, count: count.toLocaleString('en-US') });

// round: after the guess. positions: occurrences just revealed. count: words
// still possible after the guess. previousTurns: turns before this one.
export function turnLine(round, positions, count, previousTurns, tierLabel) {
  const status = getRoundStatus(round);
  const remaining = getRemainingMisses(round);
  const letter = round.guesses.at(-1);
  let event;
  if (status !== 'playing') event = status;
  else if (count === 0) event = 'fallback';
  else if (!positions && remaining === 1) event = 'last';
  else if (!positions && remaining === 3) event = 'three';
  else if (positions && !previousTurns.some(turn => turn.positions)) event = 'firstHit';
  else if (!positions && !previousTurns.some(turn => !turn.positions)) event = 'firstMiss';
  else if (count === 1) event = 'single';
  else if ('jqxz'.includes(letter)) event = 'rare';
  else event = positions ? 'hit' : 'miss';
  return pick(event, round.guesses.length, {
    letter: letter.toUpperCase(),
    count: count.toLocaleString('en-US'),
    turns: round.guesses.length,
    tier: tierLabel,
    word: status === 'playing' ? '' : round.answer.toUpperCase(),
  });
}

// "B", "B and I", "B, I and O".
const listLetters = letters => {
  const names = letters.map(value => value.toUpperCase());
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
};
const percent = hundredths => `${Math.round(hundredths / 100)}%`;

// The notebook's reasoning under the bars: why she picks this letter, in the third person, from
// her decision record (strategy.js) and nothing else. "Top" and "scores higher" mean the score
// the bars show (common words count more, plus her early vowel lean and the player's habits).
// fallbackShare: in a fallback, the percentage of her tier's words of this length with the letter.
export function notebookLine(decision, { tierLabel, length, fallbackShare = 0 }) {
  const L = decision.letter.toUpperCase();
  if (decision.fallback) {
    return `None of her ${tierLabel} words fit this pattern. She falls back on habit: ${L} appears in ${fallbackShare}% of her ${length}-letter words, so ${L} is next.`;
  }
  if (decision.candidateCount === 1) return `Only one word is left in her notes, and it has ${'aefhilmnorsx'.includes(decision.letter) ? 'an' : 'a'} ${L}. So ${L} is next.`;
  const words = decision.candidateCount.toLocaleString('en-US');
  const parts = [`Counting common words more, ${L} covers ${percent(decision.share)} of the ${words} words she still has in mind.`];
  if (decision.mode === 'careful') {
    parts.push(decision.tiedWith.length ? `No more hunches: it is tied with ${listLetters(decision.tiedWith)} for her best letter.` : 'No more hunches: it is her best letter.');
  } else {
    const lean = decision.vowelBonus > 0;
    if (decision.choseBest && decision.tiedWith.length) parts.push(`${listLetters([decision.letter, ...decision.tiedWith])} are tied for her top pick; she has a feeling about ${L}.`);
    else if (decision.choseBest) parts.push(lean ? 'It comes out on top, helped by her early lean towards vowels.' : 'It comes out on top.');
    else {
      parts.push(`${listLetters(decision.best)} ${decision.best.length === 1 ? 'scores' : 'score'} a little higher, but ${L} is on her shortlist and she has a feeling about it.`);
      if (lean) parts.push('Early on, she leans towards vowels.');
    }
    if (decision.shortlist.length > 1) {
      parts.push(`Her odds: ${decision.shortlist.map(entry => `${entry.letter.toUpperCase()} ${percent(entry.chance)}`).join(' · ')}.`);
    }
  }
  if (decision.learnedCandidates > 0) {
    parts.push(decision.learnedCandidates === 1 ? 'One word you beat her with before still fits.' : `${decision.learnedCandidates} words you beat her with before still fit.`);
  }
  parts.push(`So ${L} is next.`);
  return parts.join(' ');
}

// The small print on the notebook's question card: true of every answer, plus the WordNet
// credit. share is the smaller side's weight in hundredths of a percent of her candidate weight.
export function questionSmallPrint(question) {
  return `Either answer rules out at least ${Math.floor(question.share / 100)}% of her words, counting common ones more. Categories: Open English WordNet (CC BY 4.0).`;
}
