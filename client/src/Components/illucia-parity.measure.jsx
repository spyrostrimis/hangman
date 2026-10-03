// Measurement harness, not part of `npm run test:ui` (the suffix is outside its include).
// Run by tools/benchmark-illucia-strength.js: it plays each case through the real
// Illucia and IlluciaObservatory pages and reads her guesses back from the DOM.
import React from 'react';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeEach, afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Illucia from './Illucia';
import IlluciaObservatory from './IlluciaObservatory';

vi.mock('./AuthProvider', () => ({ useAuth: () => ({ user: { id: 'parity', username: 'parity' }, status: 'authenticated' }) }));
// Each case's round seed, handed to the page in place of a fresh local seed.
const caseSeed = vi.hoisted(() => ({ value: 0 }));
vi.mock('../lib/illucia/random.js', async original => ({ ...await original(), newLocalSeed: () => caseSeed.value }));

const input = JSON.parse(readFileSync(process.env.ILLUCIA_PARITY_INPUT, 'utf8'));
const results = [];

beforeEach(() => {
  vi.useFakeTimers();
  // The real length files from client/public, exactly as the pages request them.
  vi.stubGlobal('fetch', vi.fn(async url => {
    const match = /^\/illucia\/words\/(\d+)\.txt$/.exec(url);
    if (!match) return { ok: false, text: async () => '' };
    const text = readFileSync(resolve(input.wordsDir, `${match[1]}.txt`), 'utf8');
    return { ok: true, text: async () => text };
  }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
afterAll(() => { writeFileSync(process.env.ILLUCIA_PARITY_OUTPUT, JSON.stringify(results, null, 2) + '\n'); });

const advance = ms => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

async function startGame(container, prefix, word, tier) {
  fireEvent.click(container.querySelector(`input[name="${prefix}-tier"][value="${tier}"]`));
  fireEvent.change(container.querySelector(`#${prefix}-secret`), { target: { value: word } });
  await act(async () => { fireEvent.submit(container.querySelector(`#${prefix}-secret`).closest('form')); });
  // The duel page warns before an out-of-tier word (since E3); the second press starts anyway.
  if (/Start anyway/.test(container.querySelector('button[type="submit"]')?.textContent ?? '')) {
    await act(async () => { fireEvent.submit(container.querySelector(`#${prefix}-secret`).closest('form')); });
  }
}

// The player's part on the duel page: show every hit tile, answer every miss.
async function playDuel(word, tier) {
  const { container } = render(<MemoryRouter><Illucia /></MemoryRouter>);
  await startGame(container, 'duel', word, tier);
  for (let step = 0; step < 400; step++) {
    const title = container.querySelector('#duel-result-title')?.textContent;
    if (title) return { outcome: title === 'Illucia wins' ? 'solved' : 'failed', container };
    if (/Something went wrong/.test(container.textContent)) return { outcome: 'error', container };
    const tile = container.querySelector('button.duel-tile.hidden');
    const reply = container.querySelector('.duel-replies button');
    if (tile) fireEvent.click(tile);
    else if (reply) fireEvent.click(reply);
    else await advance(1200);
  }
  return { outcome: 'stalled', container };
}

async function duelCase({ word, tier, seed }) {
  caseSeed.value = seed;
  const { outcome, container } = await playDuel(word, tier);
  const guesses = [...container.querySelectorAll('.duel-board-caption')].map(node => node.textContent)
    .map(text => /^Turn \d+ · ([A-Z]) · (hit|miss)$/.exec(text)).filter(Boolean).map(match => match[1].toLowerCase());
  // Hits and misses each add one board, so the captions are the full guess sequence.
  cleanup();
  return { guesses: guesses.join(''), outcome };
}

async function observatoryCase({ word, tier, seed }) {
  caseSeed.value = seed;
  const { container } = render(<MemoryRouter><IlluciaObservatory /></MemoryRouter>);
  await startGame(container, 'obs', word, tier);
  let outcome = 'stalled';
  for (let step = 0; step < 60; step++) {
    const banner = container.querySelector('.obs-banner')?.textContent;
    if (banner) { outcome = banner === 'Illucia wins' ? 'solved' : 'failed'; break; }
    if (container.querySelector('.obs-error')) { outcome = 'error'; break; }
    await advance(2300);
  }
  const guesses = [...container.querySelectorAll('.obs-tape li:not(.empty)')].map(node => node.textContent).join('');
  cleanup();
  return { guesses, outcome };
}

for (const [page, play] of [['illucia', duelCase], ['illucia-observatory', observatoryCase]]) {
  for (const tier of input.tiers) {
    // Records only; the tools script compares against the benchmark and runs the control.
    it(`${page} records her guesses at ${tier}`, async () => {
      const cases = input.cases.filter(value => value.tier === tier);
      for (const testCase of cases) {
        const observed = await play(testCase);
        results.push({ page, word: testCase.word, tier, guesses: observed.guesses, outcome: observed.outcome });
      }
      expect(cases.length).toBeGreaterThan(0);
    }, 600000);
  }
}
