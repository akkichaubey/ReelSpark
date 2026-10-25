/** Canonical URLs use the current loopback origin locally and a pinned HTTPS origin live. */
export function runtimeOrigin(requestUrl?: string): string {
  const request = requestUrl ? new URL(requestUrl) : undefined;
  const isLoopback = (url: URL) => ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const configured = process.env.AUTH_URL?.trim() ||
    (process.env.RENDER === 'true' ? process.env.RENDER_EXTERNAL_URL?.trim() : undefined);
  const url = process.env.NODE_ENV !== 'production' && request && isLoopback(request)
    ? request : new URL(configured || requestUrl || 'http://localhost:3000');
  if (url.username || url.password || (url.protocol !== 'https:' && !(isLoopback(url) && url.protocol === 'http:'))) {
    throw new Error('AUTH_URL must use HTTPS, except on localhost.');
  }
  if (process.env.NODE_ENV === 'production' && (!configured || url.protocol !== 'https:' || isLoopback(url))) {
    throw new Error('Set AUTH_URL to your public HTTPS origin.');
  }
  if (!configured && !isLoopback(url)) throw new Error('Set AUTH_URL for a remote deployment.');
  return url.origin;
}
