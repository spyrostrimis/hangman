import { getRemainingMisses, getRoundStatus } from '../hangman-core.js';

const lines = {
  opening: ['Keep your word close. I will follow the letters.', 'Your move is made. Now let me think.', 'A secret and six chances. Shall we?'],
  rejected: ['That word is not in our filtered English list. Try another.', 'Choose another word from our accepted English vocabulary.', 'I cannot accept that word. Try a different English word.'],
  firstHit: ['{letter}. A promising beginning.', 'There you are, {letter}.', 'The first piece falls into place: {letter}.'],
  firstMiss: ['No {letter}? That narrows things down.', '{letter} is out. A useful clue.', 'A miss on {letter}. I still have room to think.'],
  three: ['Half my chances gone. The pattern matters now.', 'Three misses. Your word is putting up a fight.', 'Three chances remain. Time to be precise.'],
  last: ['One chance left. Every letter matters.', 'My last chance. You chose well.', 'One more miss and this is yours.'],
  rare: ['{letter}: an unusual letter for an unusual challenge.', 'An uncommon choice: {letter}.', 'Let us see where {letter} takes us.'],
  hit: ['{letter} fits. The picture is getting clearer.', 'Another piece: {letter}.', '{letter}. I am getting closer.'],
  miss: ['No {letter}. I will rethink the pattern.', '{letter} is ruled out.', 'That eliminates {letter}. Onward.'],
  solved: ['{word}. Your secret is solved.', 'The letters tell the story: {word}.', 'I found it: {word}. Another challenge?'],
  failed: ['{word}! You have outwitted me.', 'Well played. {word} kept its secret.', 'Six misses. {word} wins this round for you.'],
};
function pick(event, index, values = {}) {
  return lines[event][index % lines[event].length].replace(/\{(\w+)\}/g, (_, key) => values[key]);
}
export const openingLine = length => pick('opening', length);
// A rejection does not distinguish blocked words from other unaccepted words.
export const rejectionLine = length => pick('rejected', length);
export function turnLine(round, positions, previousTurns) {
  const status = getRoundStatus(round);
  const remaining = getRemainingMisses(round);
  const letter = round.guesses.at(-1);
  let event;
  if (status !== 'playing') event = status;
  else if (!positions && remaining === 1) event = 'last';
  else if (!positions && remaining === 3) event = 'three';
  else if (positions && !previousTurns.some(turn => turn.positions)) event = 'firstHit';
  else if (!positions && !previousTurns.some(turn => !turn.positions)) event = 'firstMiss';
  else if ('jqxz'.includes(letter)) event = 'rare';
  else event = positions ? 'hit' : 'miss';
  return pick(event, round.guesses.length, { letter: letter.toUpperCase(), word: round.answer.toUpperCase() });
}
