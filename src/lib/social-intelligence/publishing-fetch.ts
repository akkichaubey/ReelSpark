/** Bound each external API operation so a stalled platform cannot hold the worker forever. */
export function publishingFetch(input: string | URL | Request, init?: RequestInit) {
  return fetch(input, { ...init, signal: init?.signal || AbortSignal.timeout(60000) });
}
