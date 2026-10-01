export class ApiError extends Error {
  constructor(message, status, { code, retryAfterMs } = {}) {
    super(message); this.status = status; this.code = code; this.retryAfterMs = retryAfterMs;
  }
}

export async function apiRequest(path, { method = 'GET', body, signal, timeout = 10000 } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(path, {
      method, credentials: 'same-origin', signal: controller.signal,
      ...(method !== 'GET' ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) } : {}),
    });
    let data;
    try { data = await response.json(); }
    catch { throw new ApiError('The account service returned an unexpected response.', response.status); }
    if (!response.ok) throw new ApiError(data.message || 'The request failed. Please try again.', response.status, data);
    return data;
  } catch (error) {
    if (error instanceof ApiError || signal?.aborted) throw error;
    throw new ApiError(controller.signal.aborted ? 'The request timed out. Please try again.' : 'Cannot reach the account service. Please try again.', 0);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
