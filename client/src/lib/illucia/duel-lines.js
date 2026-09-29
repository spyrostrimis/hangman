// Scripted voice for the /illucia conversation duel. Deterministic: the same
// turn always gets the same line. Only code fills the placeholders, and
// {word} is used only once the round is over.

export const REPLIES = Object.freeze([
  Object.freeze({ id: 'oops', text: 'Oops, wrong' }),
  Object.freeze({ id: 'smart', text: "That wasn't so smart ;)" }),
]);

const lines = {
  ask: ['Is there {an} {L}?', '{L}?', 'Let me try {L}.', 'Does your word have {an} {L}?', 'My next letter: {L}.'],
  hitOne: ['Good.', 'There it is.', 'As expected.'],
  hitMany: ['{n} of them. Lovely.', '{n} at once. Efficient.', '{n} of them. Ooh.'],
  single: ['Only one word fits now.', 'I think I know it now.', 'One word left in my notes.'],
  oops: ['Noted. {L} is out.', 'Fair enough. That rules out {L}.', 'A miss is still data. Crossing out {L}.', 'Thank you. {count} {words} left without {L}.'],
  smart: [
    'Statistically it was the smart move. Statistics can be rude.',
    '{L} was in {share}% of my words. I stand by it.',
    'Bold words from someone with a {length}-letter secret. We will see.',
    'Father says pride comes before a fall. Noted, and ignored.',
  ],
  oopsEnd: ['Six misses. You win. Well played.', 'That was my last chance. You win, fair and square.'],
  smartEnd: ['Fine. You win this one. I am writing your word down for next time.', 'Six misses. Say it, then. You outsmarted me.'],
  solved: ['{word}. Quod erat demonstrandum.', '{word}! Solved in {turns} guesses.', 'It was {word}. Want to try something harder?'],
};

function pick(event, index, values = {}) {
  return lines[event][index % lines[event].length].replace(/\{(\w+)\}/g, (_, key) => values[key]);
}

// Letters whose English names start with a vowel sound take "an": an A, an F, an X.
export const article = letter => ('aefhilmnorsx'.includes(letter.toLowerCase()) ? 'an' : 'a');

const NUMBER_WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];

// Her guess. After a hit she first reacts to it, then asks. lastHit.single
// is true only on the turn her candidates first drop to one word.
export function askLine(letter, turn, lastHit = null) {
  const L = letter.toUpperCase();
  const ask = pick('ask', turn, { L, an: article(letter) });
  if (!lastHit) return ask;
  if (lastHit.single) return `${pick('single', turn)} ${ask}`;
  if (lastHit.positions === 1) return `${pick('hitOne', turn)} ${ask}`;
  const n = lastHit.positions;
  return `${pick('hitMany', turn, { n: NUMBER_WORDS[n] ?? n })} ${ask}`;
}

// The small print under her guess: why this letter.
export function reasonLine({ letter, share, candidates, fallback, tierLabel, length }) {
  const L = letter.toUpperCase();
  if (fallback) return `None of my ${tierLabel} words fit. ${L} is in ${share}% of my ${length}-letter words.`;
  if (candidates === 1) return `Only one word is left in my notes, and it has ${article(letter)} ${L}.`;
  return `${L} is in ${share}% of the ${candidates.toLocaleString('en-US')} words I still have in mind.`;
}

// Her answer to the player's reply after a miss. missesLeft is after the miss.
export function replyLine(replyId, { letter, turn, count, share, length, missesLeft }) {
  const values = { L: letter.toUpperCase(), count: count.toLocaleString('en-US'), words: count === 1 ? 'word' : 'words', share, length };
  if (missesLeft === 0) return pick(replyId === 'smart' ? 'smartEnd' : 'oopsEnd', turn, values);
  const event = replyId === 'smart' ? 'smart' : 'oops';
  // With no words left in her notes, skip the line that counts them.
  const index = count === 0 && lines[event][turn % lines[event].length].includes('{count}') ? turn + 1 : turn;
  const answer = pick(event, index, values);
  if (missesLeft === 1) return `${answer} One chance left.`;
  if (missesLeft === 3) return `${answer} Half my chances gone.`;
  return answer;
}

export const solvedLine = (word, turns) => pick('solved', turns, { word: word.toUpperCase(), turns });
