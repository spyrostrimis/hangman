import { apiRequest } from './api.js';
export async function loadLeaderboard(signal, get = apiRequest) {
  const data = await get('/user/get-best-scores', { signal, timeout: 10000 });
  if (!Array.isArray(data) || data.some(user => !user || typeof user.username !== 'string' || !Number.isSafeInteger(user.score) || user.score < 0)) {
    throw new Error('Invalid leaderboard response');
  }
  return data;
}
