import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from './AuthProvider';
import Illucia from './Illucia';
import { apiRequest } from '../lib/api.js';

vi.mock('../lib/api.js', async (original) => ({
  ...(await original()),
  apiRequest: vi.fn(),
}));

const mockPlayer = { id: 'player-1', username: 'TrickyWisdom', score: 200 };

beforeEach(() => {
  vi.mocked(apiRequest).mockReset();
  vi.mocked(apiRequest).mockImplementation(async (path) => {
    if (path === '/user/me') return { user: mockPlayer };
    throw new Error(`Unexpected path: ${path}`);
  });
});

afterEach(cleanup);

function renderIllucia() {
  return render(
    <MemoryRouter initialEntries={['/illucia']}>
      <AuthProvider>
        <Illucia />
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('Illucia Reverse Hangman UI', () => {
  it('renders setup console and validates the secret word input', async () => {
    renderIllucia();

    expect(await screen.findByText('CHALLENGE ILLUCIA')).toBeTruthy();
    expect(screen.getByText(/Welcome, /)).toBeTruthy();

    const input = screen.getByLabelText(/YOUR SECRET WORD/i);
    const startButton = screen.getByRole('button', { name: /INITIALIZE DUEL/i });

    // Initially empty -> button disabled
    expect(startButton.disabled).toBe(true);

    // Invalid word -> button disabled
    fireEvent.change(input, { target: { value: 'XYZQQQ' } });
    expect(screen.getByText(/Word not recognized/i)).toBeTruthy();
    expect(startButton.disabled).toBe(true);

    // Valid word -> button enabled
    fireEvent.change(input, { target: { value: 'ESCAPE' } });
    expect(screen.getByText(/Word confirmed in Aurora database/i)).toBeTruthy();
    expect(startButton.disabled).toBe(false);
  });

  it('generates a random word from manifest when clicking surprise me', async () => {
    renderIllucia();
    await screen.findByText('CHALLENGE ILLUCIA');

    const surpriseBtn = screen.getByRole('button', { name: /SURPRISE ME/i });
    const input = screen.getByLabelText(/YOUR SECRET WORD/i);
    const startButton = screen.getByRole('button', { name: /INITIALIZE DUEL/i });

    fireEvent.click(surpriseBtn);

    expect(input.value.length).toBeGreaterThanOrEqual(3);
    expect(startButton.disabled).toBe(false);
  });

  it('initiates duel and processes turn-by-turn guesses', async () => {
    renderIllucia();
    await screen.findByText('CHALLENGE ILLUCIA');

    const input = screen.getByLabelText(/YOUR SECRET WORD/i);
    fireEvent.change(input, { target: { value: 'CAT' } });

    const startButton = screen.getByRole('button', { name: /INITIALIZE DUEL/i });
    fireEvent.click(startButton);

    // Stage is rendered
    expect(await screen.findByText(/ILLUCIA'S NEURAL LOG/i)).toBeTruthy();
    expect(screen.getByText(/SYNAPTIC POWER CELLS/i)).toBeTruthy();

    const nextGuessBtn = screen.getByRole('button', { name: /NEXT GUESS/i });
    expect(nextGuessBtn.disabled).toBe(false);

    // Prompt Illucia to take a turn
    fireEvent.click(nextGuessBtn);

    // Turns should update
    await waitFor(() => {
      expect(screen.getByTestId('turn-counter').textContent).toContain('1');
    });
  });

  it('allows player to forfeit, reveals the answer, and resets on challenge again', async () => {
    renderIllucia();
    await screen.findByText('CHALLENGE ILLUCIA');

    const input = screen.getByLabelText(/YOUR SECRET WORD/i);
    fireEvent.change(input, { target: { value: 'ROBOT' } });
    fireEvent.click(screen.getByRole('button', { name: /INITIALIZE DUEL/i }));

    await screen.findByText(/ILLUCIA'S NEURAL LOG/i);

    const forfeitBtn = screen.getByRole('button', { name: /REVEAL WORD/i });
    fireEvent.click(forfeitBtn);

    // Word revealed
    expect(await screen.findByText(/Duel ended by player/i)).toBeTruthy();

    // Replay screen button
    const replayBtn = screen.getByRole('button', { name: /Challenge Again!/i });
    fireEvent.click(replayBtn);

    // Returns to setup console
    expect(await screen.findByText('CHALLENGE ILLUCIA')).toBeTruthy();
  });
});
