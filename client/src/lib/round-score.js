// Client duplicate prevention only; the API deliberately trusts reported wins.
export function createRoundScoreTracker() {
  let currentRound;
  let consumed = false;
  return (round, won, userId) => {
    if (round !== currentRound) { currentRound = round; consumed = false; }
    if (!round || !won || consumed) return false;
    consumed = true; // A guest win cannot be awarded by signing in afterward.
    return Boolean(userId);
  };
}
