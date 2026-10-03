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
  // Her questions (v2 E2). An early narrow question is curiosity; a broad one, held back until
  // she has 2 or fewer misses left, is desperation.
  curious: ['Something different. {Q}', 'A question, out of curiosity. {Q}', 'Humour me. {Q}'],
  desperate: ['{n} {chances} left. Time for broad strokes. {Q}', 'I am running out of chances. Desperate times: {Q}',
    'Fine. A broad one, and I am not proud of it. {Q}'],
  confirmed: ['Thank you. That helps.', 'Noted. My list just got shorter.', 'Excellent. Filing that away.'],
  unchecked: ['My archive does not know your word, so I will take your word for it.'],
  corrected: ['My archive says otherwise: your word {can}. I will go by the archive, so no bonus for that one.'],
  declined: ['Fair enough. Back to letters.', 'A mystery, then. Back to letters.'],
  // Experimental mode (v2 E5): a question written by an AI model, which can sort words wrongly.
  aiAsk: ['I asked my AI helper for a question. {Q}', 'An experimental question, from my AI helper: {Q}'],
  aiLean: ['Thank you. I will lean that way, but not too far: my helper can sort words wrongly.'],
  aiLimit: ['My AI helper is out of questions for now. Back to my own method.'],
  aiOff: ['My AI helper is switched off right now. Back to my own method.'],
  aiFailed: ['My AI helper did not come up with a usable question. My mistake for asking; back to my own method.'],
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
  if (!decision?.mode) return facts;
  // Words that beat her before, from her memory of this player (history only, never this round's word).
  const learned = decision.learnedCandidates > 0
    ? ` ${decision.learnedCandidates === 1 ? 'One word' : `${decision.learnedCandidates} words`} you beat me with before ${decision.learnedCandidates === 1 ? 'still fits' : 'still fit'}.` : '';
  return `${facts} ${whyLine({ ...decision, letter })}${learned}`;
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

// The player's three choices when she asks (v2 E2): answer either way, or decline.
export const ANSWERS = Object.freeze([
  Object.freeze({ id: 'yes', label: 'Yes, it can', text: 'Yes, it can.' }),
  Object.freeze({ id: 'no', label: "No, it can't", text: "No, it can't." }),
  Object.freeze({ id: 'declined', label: 'Decline', text: "I'd rather not say." }),
]);

// Her question, in her voice: curious for an early narrow one, desperate for a late broad one
// (chooseQuestion's tag). The question text is the category's own.
export function questionLine(question, turn) {
  if (question.tag === 'late-broad') {
    const n = question.missesLeft;
    return pick('desperate', turn, { Q: question.question, n: NUMBER_WORDS[n] ?? n, chances: n === 1 ? 'chance' : 'chances' });
  }
  return pick('curious', turn, { Q: question.question });
}

// The small print under her question: true of every answer, plus the WordNet credit.
// share is the smaller side's weight in hundredths of a percent of her candidate weight.
export function questionNote(question) {
  const ruled = Math.floor(question.share / 100);
  return `Either answer rules out at least ${ruled}% of my words, counting common ones more. Categories: Open English WordNet (CC BY 4.0).`;
}

// Her reply once the player has chosen. outcome: 'confirmed' | 'unchecked' | 'corrected' | 'declined';
// truth is the archive's answer when it corrected the player.
export function answerLine(outcome, turn, truth = null) {
  return pick(outcome, turn, { can: truth === 'yes' ? 'can mean that' : 'cannot mean that' });
}

const times = n => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);

// Her memory, once the word is out (v2 E4). learnedIt: the word was in her knowledge because it
// beat this player's duels before; voice: C2's { plays, everyone } for this word (the round in
// play left out). Returns null when she has nothing to remember.
export function memoryLine({ word, learnedIt, playerWon, voice }) {
  const W = word.toUpperCase();
  if (learnedIt) return playerWon ? `${W}… AGAIN?? I learned that word from you, and it still beat me.` : `${W}. I learned that one from you.`;
  if (voice?.plays > 0) return `${W} again? You have set it against me ${times(voice.plays)} before.`;
  if (voice?.everyone > 0) return `Other players have tried ${W} on me ${times(voice.everyone)}.`;
  return null;
}

// Experimental mode (v2 E5).
export const aiQuestionLine = (question, turn) => pick('aiAsk', turn, { Q: question });
export const AI_NOTE = 'Written by an AI model (Llama 3.3 70B on Cloudflare Workers AI). It can be wrong, so I only lean on your answer.';
export const aiAnswerLine = (declined, turn) => pick(declined ? 'declined' : 'aiLean', turn);
// Why her helper had no question (the Worker's reasons); she makes her normal move.
export function aiFallbackLine(reason, turn) {
  if (['budget', 'user-limit', 'round-limit'].includes(reason)) return pick('aiLimit', turn);
  if (reason === 'disabled') return pick('aiOff', turn);
  return pick('aiFailed', turn);
}
