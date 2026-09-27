export function getIlluciaDialogue({
  event,
  wordLength,
  letter,
  occurrences,
  strikesLeft,
  remainingCandidates,
  secretWord,
  username = 'Challenger',
}) {
  switch (event) {
    case 'setup':
      return `Welcome, ${username}. Choose a word to test Aurora's positron matrix.`;

    case 'start':
      return `Target sequence locked: ${wordLength} characters. Commencing phonetic entropy analysis...`;

    case 'hit':
      if (occurrences > 1) {
        return `Resonance confirmed! Letter '${letter}' appears ${occurrences} times. Pruning branch matrix.`;
      }
      return `Match detected. Letter '${letter}' is present in the sequence.`;

    case 'miss':
      if (strikesLeft === 5) {
        return `Unexpected divergence: no '${letter}' found. Core matrix absorbing first strike.`;
      }
      if (strikesLeft === 3 || strikesLeft === 4) {
        return `Phoneme '${letter}' not present. Core integrity holding at ${strikesLeft} remaining cells.`;
      }
      if (strikesLeft === 2) {
        return `Warning: Positronic core temperature rising. Two chances remaining...`;
      }
      if (strikesLeft === 1) {
        return `Critical alert: Single power cell active. Recalibrating phonetic survival heuristics!`;
      }
      return `Miss registered. Re-indexing candidate lexicon.`;

    case 'near_victory':
      return `Permutations narrowed down to ${remainingCandidates}. Your defeat is mathematically imminent.`;

    case 'single_candidate':
      return `Entropy collapsed to unity! Target word identified in Aurora archives.`;

    case 'illucia_won':
      return `Deduction complete: '${secretWord}'! My father Han Fastolfe taught me well.`;

    case 'player_won':
      return `Core depleted! Exceptional lexical choice, ${username}. You outsmarted the Aurora matrix!`;

    default:
      return `Analyzing positron vectors...`;
  }
}
