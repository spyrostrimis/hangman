import axios from 'axios';

// The account backend is still local-only. Keep its endpoint unchanged until
// that rebuild; failed or malformed responses must produce an honest UI state.
export async function loadLeaderboard(signal, get = axios.get) {
  const { data } = await get('http://localhost:8000/user/get-best-scores', {
    signal,
    timeout: 10000,
  });
  if (!Array.isArray(data) || data.some(user =>
    !user || typeof user.username !== 'string' || !Number.isFinite(user.score)
  )) {
    throw new Error('Invalid leaderboard response');
  }
  return data;
}
