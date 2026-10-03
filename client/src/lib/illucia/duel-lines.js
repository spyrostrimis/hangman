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
  // 'As expected.' only when most of her words had the letter; otherwise this one instead.
  hitOneSurprise: 'A pleasant surprise.',
  hitMany: ['{n} of them. Lovely.', '{n} at once. Efficient.', '{n} of them. Ooh.'],
  single: ['Only one word fits now.', 'I think I know it now.', 'One word left in my notes.'],
  oops: ['Noted. {L} is out.', 'Fair enough. That rules out {L}.', 'A miss is still data. Crossing out {L}.', 'Thank you. {count} {words} left without {L}.'],
  // The first line claims the best move, so after a hunch (a letter below her best) she says the second.
  smartBest: 'Statistically it was the smart move. Statistics can be rude.',
  smartHunch: 'It was a hunch. Hunches can be rude.',
  smart: [
    '{smartFirst}',
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
// is true only on the turn her candidates first drop to one word; lastHit.share is the
// percentage of her words that had the letter, so she says she expected it only when most did.
export function askLine(letter, turn, lastHit = null) {
  const L = letter.toUpperCase();
  const ask = pick('ask', turn, { L, an: article(letter) });
  if (!lastHit) return ask;
  if (lastHit.single) return `${pick('single', turn)} ${ask}`;
  if (lastHit.positions === 1) {
    const reaction = pick('hitOne', turn);
    return `${reaction === 'As expected.' && !(lastHit.share >= 50) ? lines.hitOneSurprise : reaction} ${ask}`;
  }
  const n = lastHit.positions;
  return `${pick('hitMany', turn, { n: NUMBER_WORDS[n] ?? n })} ${ask}`;
}

// "B", "B and I", "B, I and O".
const listLetters = letters => {
  const names = letters.map(value => value.toUpperCase());
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
};

// Why she chose this letter, from her decision record (strategy.js) and nothing else.
// Her score counts common words more, adds her early vowel lean and, with a memory of the
// player, their letter habits; "top" and "scores higher" mean that score.
function whyLine({ letter, mode, choseBest, best = [], tiedWith = [], vowelBonus = 0 }) {
  const L = letter.toUpperCase();
  const lean = vowelBonus > 0;
  if (mode === 'careful') {
    if (tiedWith.length) return `No more hunches: it is tied with ${listLetters(tiedWith)} for my best letter, and I picked ${L}.`;
    return 'No more hunches: it is my best letter.';
  }
  if (choseBest) {
    if (tiedWith.length) return `${L} and ${listLetters(tiedWith)} are tied for my top pick; I have a feeling about ${L}.`;
    return lean ? 'It comes out on top, helped by my early lean towards vowels.' : 'It comes out on top.';
  }
  const higher = best.length === 1 ? `${listLetters(best)} scores` : `${listLetters(best)} score`;
  return `${higher} a little higher, but ${L} is on my shortlist and I have a feeling about it.${lean ? ' Early on, I lean towards vowels.' : ''}`;
}

// The small print under her guess: what she knows, then why this letter. `decision` is her
// decision record; without one (a strict policy) only the facts are given.
export function reasonLine({ letter, share, candidates, fallback, tierLabel, length, decision = null }) {
  const L = letter.toUpperCase();
  if (fallback) return `None of my ${tierLabel} words fit. ${L} is in ${share}% of my ${length}-letter words.`;
  if (candidates === 1) return `Only one word is left in my notes, and it has ${article(letter)} ${L}.`;
  const facts = `${L} is in ${share}% of the ${candidates.toLocaleString('en-US')} words I still have in mind.`;
  return decision?.mode ? `${facts} ${whyLine({ ...decision, letter })}` : facts;
}

// Her answer to the player's reply after a miss. missesLeft is after the miss. hunch is true
// when she chose a letter below her best (decision.choseBest === false).
export function replyLine(replyId, { letter, turn, count, share, length, missesLeft, hunch = false }) {
  const values = { L: letter.toUpperCase(), count: count.toLocaleString('en-US'), words: count === 1 ? 'word' : 'words', share, length,
    smartFirst: hunch ? lines.smartHunch : lines.smartBest };
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
