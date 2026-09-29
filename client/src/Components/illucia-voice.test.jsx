import React, { StrictMode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import IlluciaObservatory from './IlluciaObservatory';
import { LONGEST_LINE_MS } from '../lib/illucia/use-speech.js';

vi.mock('./AuthProvider', () => ({ useAuth: () => ({ user: { id: 'test-player', username: 'tester' }, status: 'authenticated' }) }));

const VOICES = [
  { name: 'Microsoft David', lang: 'en-US', voiceURI: 'david', localService: true },
  { name: 'Microsoft Aria Online (Natural)', lang: 'en-US', voiceURI: 'aria', localService: false },
  { name: 'Google Deutsch', lang: 'de-DE', voiceURI: 'deutsch', localService: false },
];
let speech;
function installSpeech() {
  const spoken = [];
  const synth = {
    getVoices: () => VOICES,
    speak: vi.fn(utterance => spoken.push(utterance)),
    cancel: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal('speechSynthesis', synth);
  vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(text) { this.text = text; } });
  return { synth, spoken, finish: (utterance = spoken.at(-1)) => act(() => { utterance.onend(); }) };
}
beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => 'eerie 35\n' }));
  speech = installSpeech();
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); localStorage.clear(); });

const mount = () => render(<StrictMode><MemoryRouter><IlluciaObservatory /></MemoryRouter></StrictMode>);
async function start(word = 'EERIE') {
  fireEvent.click(screen.getByRole('radio', { name: /Master/ }));
  fireEvent.change(screen.getByLabelText('Insert your secret word'), { target: { value: word } });
  await act(async () => { fireEvent.submit(screen.getByRole('button', { name: 'Start the duel' }).closest('form')); });
}
const tick = () => act(async () => { await vi.advanceTimersByTimeAsync(2300); });
const tape = view => [...view.container.querySelectorAll('.obs-tape li:not(.empty)')].map(item => item.textContent);
const texts = () => speech.spoken.map(utterance => utterance.text);

it('stays silent until the player turns the voice on, then speaks with the best voice and remembers the choice', () => {
  mount();
  expect(speech.synth.speak).not.toHaveBeenCalled();
  expect(screen.queryByRole('combobox', { name: 'Her voice' })).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Voice off' }));
  expect(screen.getByRole('button', { name: 'Voice on' }).getAttribute('aria-pressed')).toBe('true');
  expect(texts().at(-1)).toMatch(/^Hello, tester\. /);
  expect(speech.spoken.at(-1).voice.voiceURI).toBe('aria');
  expect(localStorage.getItem('illucia-observatory.voice')).toBe('on');

  // Every voice is offered, the online ones and other languages included.
  const picker = screen.getByRole('combobox', { name: 'Her voice' });
  expect([...picker.options].map(option => option.value)).toEqual(['aria', 'david', 'deutsch']);
  expect(picker.querySelector('optgroup[label="Other languages"]').textContent).toContain('Google Deutsch');
  fireEvent.change(picker, { target: { value: 'david' } });
  expect(speech.spoken.at(-1).voice.voiceURI).toBe('david');
  expect(localStorage.getItem('illucia-observatory.voice-uri')).toBe('david');

  cleanup();
  const count = speech.synth.speak.mock.calls.length;
  mount();
  expect(speech.synth.speak.mock.calls.length).toBeGreaterThan(count);
  expect(speech.spoken.at(-1).voice.voiceURI).toBe('david');
});

it('hides the voice control where the browser cannot speak', () => {
  vi.stubGlobal('speechSynthesis', undefined);
  mount();
  expect(screen.queryByRole('button', { name: /Voice/ })).toBeNull();
  // Positive control: the same page shows it when speech exists.
  cleanup();
  speech = installSpeech();
  mount();
  expect(screen.getByRole('button', { name: 'Voice off' })).toBeTruthy();
});

it('speaks every line, the word included, and finishes each line before her next guess', async () => {
  const view = mount();
  fireEvent.click(screen.getByRole('button', { name: 'Voice off' }));
  const greeting = speech.spoken.at(-1);
  await start();
  expect(texts().at(-1)).toMatch(/5-letter|5 letters/);

  // A cancelled old line reporting 'end' must not release her early.
  speech.finish(greeting);
  await tick();
  expect(tape(view)).toEqual([]);
  // Positive control: the current line ending does release her.
  speech.finish();
  await tick();
  expect(tape(view)).toEqual(['e']);
  expect(texts().at(-1)).toMatch(/E/);

  for (let turn = 0; turn < 5 && !screen.queryByRole('heading', { name: 'Illucia wins' }); turn++) {
    speech.finish();
    await tick();
  }
  expect(screen.getByRole('heading', { name: 'Illucia wins' })).toBeTruthy();
  expect(texts().at(-1)).toContain('EERIE');
});

it('does not stall the duel when the browser never reports the end of a line', async () => {
  const view = mount();
  fireEvent.click(screen.getByRole('button', { name: 'Voice off' }));
  await start();
  await act(async () => { await vi.advanceTimersByTimeAsync(LONGEST_LINE_MS - 100); });
  expect(tape(view)).toEqual([]);
  await act(async () => { await vi.advanceTimersByTimeAsync(100); });
  await tick();
  expect(tape(view)).toEqual(['e']);
});

it('stops speaking on pause, voice off and leaving the page', async () => {
  const view = mount();
  fireEvent.click(screen.getByRole('button', { name: 'Voice off' }));
  await start();
  let cancels = speech.synth.cancel.mock.calls.length;
  const spoken = speech.synth.speak.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
  expect(speech.synth.cancel.mock.calls.length).toBeGreaterThan(cancels);
  expect(speech.synth.speak.mock.calls.length).toBe(spoken);
  fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
  await tick();
  expect(tape(view)).toEqual(['e']);

  cancels = speech.synth.cancel.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'Voice on' }));
  expect(speech.synth.cancel.mock.calls.length).toBeGreaterThan(cancels);
  const silent = speech.synth.speak.mock.calls.length;
  await tick();
  expect(tape(view)).toHaveLength(2);
  expect(speech.synth.speak.mock.calls.length).toBe(silent);

  fireEvent.click(screen.getByRole('button', { name: 'Voice off' }));
  cancels = speech.synth.cancel.mock.calls.length;
  cleanup();
  expect(speech.synth.cancel.mock.calls.length).toBeGreaterThan(cancels);
});
