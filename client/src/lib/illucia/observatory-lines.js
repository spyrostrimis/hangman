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
