import React, { StrictMode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Illucia from './Illucia';
import { analyzeDecision } from '../lib/illucia/strategy.js';
import { reasonLine, replyLine } from '../lib/illucia/duel-lines.js';
import { newLocalSeed } from '../lib/illucia/random.js';

vi.mock('./AuthProvider', () => ({ useAuth: () => ({ user: { id: 'test-player', username: 'tester' }, status: 'authenticated' }) }));
vi.mock('../lib/illucia/strategy.js', async original => ({ ...await original(), analyzeDecision: vi.fn() }));
vi.mock('../lib/illucia/random.js', async original => ({ ...await original(), newLocalSeed: vi.fn(() => 1234) }));
beforeEach(async () => {
  const real = (await vi.importActual('../lib/illucia/strategy.js')).analyzeDecision;
  analyzeDecision.mockImplementation(real);
  analyzeDecision.mockClear();
  newLocalSeed.mockClear();
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => 'eerie 35\n' }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const mount = () => render(<StrictMode><MemoryRouter><Illucia /></MemoryRouter></StrictMode>);
async function start(word = 'EERIE', tier = 'Master') {
  fireEvent.click(screen.getByRole('radio', { name: new RegExp(tier) }));
  fireEvent.change(screen.getByLabelText('Your secret word'), { target: { value: word } });
  await act(async () => { fireEvent.submit(screen.getByRole('button', { name: 'Start the duel' }).closest('form')); });
}
// Longer than her thinking pause, so at most one guess happens per call.
const think = () => act(async () => { await vi.advanceTimersByTimeAsync(1200); });
const hiddenTiles = () => screen.queryAllByRole('button', { name: /^Show [A-Z] at position/ });
const boards = container => [...container.querySelectorAll('.duel-board')].map(board =>
  [...board.querySelectorAll('.duel-tile')].map(tile => (tile.classList.contains('hidden') ? '#' : tile.textContent || '_')).join(''));
const bubbles = (container, from) => [...container.querySelectorAll(`.from-${from} .duel-bubble p`)].map(node => node.textContent);

it('sends only the length, hides her hits until the player shows them, and plays to her win', async () => {
  const view = mount();
  expect(screen.getByLabelText('Your secret word').type).toBe('text');
  expect(view.container.querySelector('input[type="password"]')).toBeNull();
  await start();
  // Her words and her question labels for this length: never the secret, only the length.
  expect(fetch.mock.calls.map(call => call[0]).sort())
    .toEqual(['/illucia/labels/5.txt', '/illucia/labels/categories.json', '/illucia/words/5.txt']);
  for (const [, options] of fetch.mock.calls) expect(Object.keys(options)).toEqual(['signal']);

  await think();
  const state = analyzeDecision.mock.calls[0][0];
  expect(state.pattern).toEqual([null, null, null, null, null]);
  expect(state).not.toHaveProperty('answer');
  expect(JSON.stringify(state)).not.toContain('eerie');
  // E is at positions 1, 2 and 5: three grey tiles, nothing else shown yet.
  expect(boards(view.container).at(-1)).toBe('##__#');
  expect(hiddenTiles().map(tile => tile.getAttribute('aria-label')))
    .toEqual(['Show E at position 1', 'Show E at position 2', 'Show E at position 5']);

  // She waits while tiles remain hidden.
  fireEvent.click(hiddenTiles()[0]);
  fireEvent.click(hiddenTiles()[0]);
  await think(); await think();
  expect(analyzeDecision).toHaveBeenCalledTimes(1);
  expect(boards(view.container).at(-1)).toBe('EE__#');
  fireEvent.click(hiddenTiles()[0]);
  expect(boards(view.container).at(-1)).toBe('EE__E');
  await think();
  expect(analyzeDecision).toHaveBeenCalledTimes(2);
  expect(bubbles(view.container, 'illucia').at(-1)).toMatch(/^Three of them\./);

  while (!screen.queryByRole('heading', { name: 'Illucia wins' })) {
    const [tile] = hiddenTiles();
    if (tile) fireEvent.click(tile); else await think();
  }
  expect(boards(view.container).at(-1)).toBe('EERIE');
  expect(screen.getByText(/Duels don't earn Hall of Fame points yet/)).toBeTruthy();
  const calls = analyzeDecision.mock.calls.length;
  await think();
  expect(analyzeDecision.mock.calls.length).toBe(calls);
  fireEvent.click(screen.getByRole('button', { name: 'Play again' }));
  expect(screen.getByLabelText('Your secret word').value).toBe('');
});

it('waits for the player to answer a miss, answers that reply, and ends at six misses', async () => {
  // Her first guess (A or B) misses WXYZ and rules out all three words she knows; her fallback
  // then picks among C-H, so every letter misses whichever seed settles the ties.
  fetch.mockResolvedValue({ ok: true, text: async () => 'abcd 35\nabef 35\nabgh 35\nwxyz 70\n' });
  const view = mount(); await start('wxyz', 'Apprentice');
  await think();
  expect(analyzeDecision.mock.calls[0][1].words).toEqual(['abcd', 'abef', 'abgh']);
  // Her letters, and the share the page shows: of her candidates, or of her words in a fallback.
  const herLetter = call => analyzeDecision.mock.results[call].value.letter;
  const herShare = call => {
    const decision = analyzeDecision.mock.results[call].value;
    return decision.fallback
      ? Math.round(['abcd', 'abef', 'abgh'].filter(word => word.includes(decision.letter)).length / 3 * 100)
      : Math.round(decision.hitCount / decision.candidateCount * 100);
  };
  expect(hiddenTiles()).toHaveLength(0);
  // Positive control on the same round: a miss offers both replies and she waits.
  expect(screen.getByRole('button', { name: 'Oops, wrong' })).toBeTruthy();
  await think(); await think();
  expect(analyzeDecision).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole('button', { name: "That wasn't so smart ;)" }));
  expect(bubbles(view.container, 'player').at(-1)).toBe("That wasn't so smart ;)");
  const first = herLetter(0);
  const smart = replyLine('smart', { letter: first, turn: 1, count: 0, share: herShare(0), length: 4, missesLeft: 5 });
  expect(bubbles(view.container, 'illucia').at(-1)).toBe(smart);
  expect(view.container.querySelectorAll('.duel-board-caption')[1].textContent).toBe(`Turn 1 · ${first.toUpperCase()} · miss`);

  await think();
  fireEvent.click(screen.getByRole('button', { name: 'Oops, wrong' }));
  const second = herLetter(1);
  const oops = replyLine('oops', { letter: second, turn: 2, count: 0, share: herShare(1), length: 4, missesLeft: 4 });
  expect(bubbles(view.container, 'illucia').at(-1)).toBe(oops);
  expect(oops).not.toBe(smart);

  for (let miss = 3; miss <= 6; miss++) {
    await think();
    fireEvent.click(screen.getByRole('button', { name: 'Oops, wrong' }));
  }
  expect(screen.getByRole('heading', { name: 'You win' })).toBeTruthy();
  expect(screen.getByRole('img', { name: 'Her chances: 0 of 6' })).toBeTruthy();
  expect(view.container.querySelectorAll('.duel-board').length).toBe(7);
  expect([...view.container.querySelectorAll('.duel-board')].at(-1).querySelectorAll('.duel-tile.missed')).toHaveLength(4);
  expect(screen.getByRole('button', { name: 'Rematch vs Scholar' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Oops, wrong' })).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(3);
});

it('shows her count from before the guess until the player reveals the tiles', async () => {
  fetch.mockResolvedValue({ ok: true, text: async () => 'eerie 35\nsense 35\nthree 35\n' });
  const view = mount(); await start('eerie');
  const words = () => view.container.querySelector('.duel-status-facts b').textContent;
  expect(words()).toBe('3');
  await think();
  // Her note explains this decision, from its own record: the facts, then why.
  const first = analyzeDecision.mock.results[0].value;
  const note = view.container.querySelector('.duel-bubble small').textContent;
  expect(first.candidateCount).toBe(3);
  expect(note).toBe(reasonLine({ letter: first.letter, share: Math.round(first.hitCount / 3 * 100),
    candidates: 3, fallback: first.fallback, tierLabel: 'Master', length: 5, decision: first }));
  expect(note).toMatch(/words I still have in mind\. \S/);
  expect(hiddenTiles().length).toBeGreaterThan(0);
  expect(words()).toBe('3');
  hiddenTiles().forEach(tile => fireEvent.click(tile));
  expect(words()).toBe('1');
});

it('cancels her pending turn on New word and shows a recoverable error if the solver fails', async () => {
  mount(); await start();
  fireEvent.click(screen.getByRole('button', { name: 'New word' }));
  await think();
  expect(analyzeDecision).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Your secret word')).toBeTruthy();

  await start();
  analyzeDecision.mockImplementationOnce(() => { throw new Error('Master invariant: zero candidates.'); });
  await think();
  expect(screen.getByText(/Something went wrong in my notes/)).toBeTruthy();
  expect(screen.queryByRole('heading', { name: /wins|You win/ })).toBeNull();
  await think();
  expect(analyzeDecision).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getAllByRole('button', { name: 'New word' }).at(-1));
  expect(screen.getByLabelText('Your secret word')).toBeTruthy();
});

it('rejects invalid and unlisted words without starting', async () => {
  mount(); await start('two words');
  expect(screen.getByRole('alert').textContent).toContain('A–Z only');
  expect(fetch).not.toHaveBeenCalled();
  await start('zzzzz');
  expect(screen.getByRole('alert').textContent).toContain('cannot accept');
  expect(fetch.mock.calls.some(call => call[0].includes('zzzzz'))).toBe(false);
  expect(screen.getByLabelText('Your secret word')).toBeTruthy();
});

it('asks for 4-15 letters and never fetches a 3-letter word file', async () => {
  mount(); await start('cat');
  expect(screen.getByRole('alert').textContent).toBe('Choose 4–15 letters, A–Z only, with no spaces or punctuation.');
  expect(fetch).not.toHaveBeenCalled();
  // Positive control: four letters pass the shape check and load that length.
  fetch.mockResolvedValue({ ok: true, text: async () => 'cats 35\n' });
  await start('cats');
  expect(fetch.mock.calls.map(call => call[0])).toContain('/illucia/words/4.txt');
  expect(screen.queryByRole('alert')).toBeNull();
});

it('gives each round its own seed and passes it to every decision', async () => {
  mount(); await start();
  await think();
  expect(newLocalSeed).toHaveBeenCalledTimes(1);
  expect(analyzeDecision.mock.calls.length).toBeGreaterThan(0);
  expect(analyzeDecision.mock.calls.every(call => call[2]?.seed === 1234)).toBe(true);
  // A new word is a new round with a new seed.
  fireEvent.click(screen.getByRole('button', { name: 'New word' }));
  await start();
  expect(newLocalSeed).toHaveBeenCalledTimes(2);
});

it('calls her miss a hunch, not the smart move, when she chose below her best', async () => {
  fetch.mockResolvedValue({ ok: true, text: async () => 'abcd 35\nabef 35\nabgh 35\nwxyz 70\n' });
  const real = (await vi.importActual('../lib/illucia/strategy.js')).analyzeDecision;
  const lastLine = async () => {
    const view = mount(); await start('wxyz', 'Apprentice');
    for (let miss = 1; miss <= 4; miss++) {
      await think();
      // Turn 4 is her first "smart" line.
      fireEvent.click(screen.getByRole('button', { name: miss === 4 ? "That wasn't so smart ;)" : 'Oops, wrong' }));
    }
    const line = bubbles(view.container, 'illucia').at(-1);
    cleanup();
    return line;
  };
  // Positive control: her real decisions on this board are best letters.
  expect(await lastLine()).toBe('Statistically it was the smart move. Statistics can be rude.');
  analyzeDecision.mockImplementation((...args) => ({ ...real(...args), choseBest: false }));
  expect(await lastLine()).toBe('It was a hunch. Hunches can be rude.');
});

// Questions (v2 E2). Four birds and four other words; she knows them all. The secret's label
// decides whether an answer can be checked.
const QUESTION_WORDS = ['chair', 'crane', 'eagle', 'heron', 'plate', 'robin', 'stone', 'table'];
const CATEGORIES = { categories: [
  { code: 'c', key: 'bird', kind: 'noun', question: 'Can your word mean a bird?', kindOf: { 'oewn-01505702-n': 'bird' } },
  { code: 'o', key: 'artifact', kind: 'noun', question: 'Can your word mean a man-made object?', lexfiles: ['noun.artifact'] },
] };
const BIRDS = new Set(['crane', 'eagle', 'heron', 'robin']);
// mammals: a second narrow category (chair and plate, as a fixture) that qualifies straight after the first.
const MAMMAL = { code: 'd', key: 'mammal', kind: 'noun', question: 'Can your word mean a mammal?', kindOf: { 'oewn-01864419-n': 'mammal' } };
function serveQuestions({ unknown = null, labels = true, mammals = false } = {}) {
  const words = QUESTION_WORDS.map(word => `${word} 35\n`).join('');
  const code = word => (BIRDS.has(word) ? 'c' : mammals && ['chair', 'plate'].includes(word) ? 'do' : 'o');
  const lines = QUESTION_WORDS.filter(word => word !== unknown).map(word => `${word} ${code(word)}\n`).join('');
  const categories = mammals ? { categories: [CATEGORIES.categories[0], MAMMAL, CATEGORIES.categories[1]] } : CATEGORIES;
  fetch.mockImplementation(async url => {
    if (url === '/illucia/words/5.txt') return { ok: true, text: async () => words };
    if (url === '/illucia/labels/5.txt') return labels ? { ok: true, text: async () => lines } : { ok: false };
    if (url === '/illucia/labels/categories.json') return { ok: true, json: async () => categories };
    return { ok: false };
  });
}
// Her first two letters miss every word (Z, then Q), so all eight are still possible when she may ask.
async function forceMisses(real, forced = ['z', 'q']) {
  analyzeDecision.mockImplementation((state, knowledge, options) => {
    const decision = real(state, knowledge, options);
    return forced.length ? { ...decision, letter: forced.shift() } : decision;
  });
  for (let miss = 0; miss < 2; miss++) {
    await think();
    fireEvent.click(screen.getByRole('button', { name: 'Oops, wrong' }));
  }
  await think();
  return forced;
}
const choices = () => screen.queryAllByRole('button', { name: /^(Yes, it can|No, it can't|Decline)$/ }).map(button => button.textContent);
const realDecision = async () => (await vi.importActual('../lib/illucia/strategy.js')).analyzeDecision;

it('asks a curious question after two letters, corrects a wrong answer and filters on the archive', async () => {
  serveQuestions();
  const view = mount(); await start('crane');
  await forceMisses(await realDecision());
  // Positive control: before the question she considered all eight words.
  expect(analyzeDecision.mock.calls.at(-1)[1].words).toEqual(QUESTION_WORDS);
  const calls = analyzeDecision.mock.calls.length;
  // The broad category is held back (4 misses left), so the narrow one comes first, curiously.
  expect(bubbles(view.container, 'illucia').at(-1)).toMatch(/Can your word mean a bird\?$/);
  expect(bubbles(view.container, 'illucia').at(-1)).not.toMatch(/Desperate|broad/);
  expect(view.container.querySelectorAll('.duel-bubble small')[2].textContent).toContain('Open English WordNet (CC BY 4.0)');
  expect(choices()).toEqual(['Yes, it can', "No, it can't", 'Decline']);
  expect(screen.getByText('Answering helps her. Declining tells her nothing.')).toBeTruthy();
  expect(analyzeDecision.mock.calls.length).toBe(calls); // the question used her turn

  fireEvent.click(screen.getByRole('button', { name: "No, it can't" }));
  expect(bubbles(view.container, 'player').at(-1)).toBe("No, it can't.");
  expect(bubbles(view.container, 'illucia').at(-1)).toMatch(/^My archive says otherwise: your word can mean that\./);
  expect(choices()).toEqual([]);
  // Her next move is a letter, not another question, over the birds only.
  await think();
  expect(analyzeDecision.mock.calls.length).toBe(calls + 1);
  expect(analyzeDecision.mock.calls.at(-1)[1].words).toEqual(['crane', 'eagle', 'heron', 'robin']);
  expect(screen.getByText(/questions: Open English WordNet \(CC BY 4\.0\)/)).toBeTruthy();
});

it('says no bonus is possible for a word WordNet does not know, and takes the answer on trust', async () => {
  serveQuestions({ unknown: 'crane' });
  const view = mount(); await start('crane');
  await forceMisses(await realDecision());
  expect(screen.getByText(/no bonus possible for this word/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Yes, it can' }));
  expect(bubbles(view.container, 'illucia').at(-1)).toBe('My archive does not know your word, so I will take your word for it.');
  await think();
  // The unknown word stays on both sides; YES keeps the labelled birds.
  expect(analyzeDecision.mock.calls.at(-1)[1].words).toEqual(['crane', 'eagle', 'heron', 'robin']);
});

it('learns nothing from a declined question, asks at most once per letter, and plays letters only when the labels cannot load', async () => {
  serveQuestions({ mammals: true });
  const view = mount(); await start('crane');
  await forceMisses(await realDecision());
  expect(bubbles(view.container, 'illucia').at(-1)).toMatch(/a bird\?$/);
  fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
  expect(bubbles(view.container, 'player').at(-1)).toBe("I'd rather not say.");
  // The mammal question qualifies now, but she guesses a letter first.
  const calls = analyzeDecision.mock.calls.length;
  await think();
  expect(analyzeDecision.mock.calls.length).toBe(calls + 1);
  expect(analyzeDecision.mock.calls.at(-1)[1].words).toEqual(QUESTION_WORDS);
  cleanup();

  serveQuestions({ labels: false });
  mount(); await start('crane');
  await forceMisses(await realDecision());
  expect(choices()).toEqual([]);
  expect(analyzeDecision).toHaveBeenCalledTimes(calls + 4);
});

it('holds the broad question until two chances are left, then asks it desperately', async () => {
  serveQuestions();
  const view = mount(); await start('crane');
  const forced = await forceMisses(await realDecision(), ['z', 'q', 'j', 'x']);
  fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
  // Turn 3 (three chances left): no question, the broad one is still held.
  await think();
  expect(choices()).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: 'Oops, wrong' }));
  await think();
  fireEvent.click(screen.getByRole('button', { name: 'Oops, wrong' }));
  expect(forced).toEqual([]);
  await think();
  expect(screen.getByRole('img', { name: 'Her chances: 2 of 6' })).toBeTruthy();
  expect(bubbles(view.container, 'illucia').at(-1)).toMatch(/Can your word mean a man-made object\?$/);
  expect(bubbles(view.container, 'illucia').at(-1)).toMatch(/^(Two chances left\. Time for broad strokes|I am running out of chances|Fine\. A broad one)/);
  expect(choices()).toEqual(['Yes, it can', "No, it can't", 'Decline']);
});
