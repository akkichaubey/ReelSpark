// UI cache separation only; server APIs remain the authorization boundary.
let accountId: string | null = null;
export function setCacheAccount(id: string | null): void { accountId = id; }
export function getCacheAccount(): string | null { return accountId; }
export const ACCOUNT_IDENTITY_EVENT_KEY = 'reelspark_session_identity';
export function announceAccountIdentity(id: string | null): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(ACCOUNT_IDENTITY_EVENT_KEY, id || 'signed-out'); } catch { /* Storage may be blocked. */ }
}
function key(name: string): string | null {
  return accountId ? `reelspark_account_${encodeURIComponent(accountId)}:${name}` : null;
}
export const accountCache = {
  getItem(name: string): string | null {
    const scoped = key(name);
    return scoped && typeof window !== 'undefined' ? window.localStorage.getItem(scoped) : null;
  },
  setItem(name: string, value: string): void {
    const scoped = key(name);
    if (scoped && typeof window !== 'undefined') window.localStorage.setItem(scoped, value);
  },
  removeItem(name: string): void {
    const scoped = key(name);
    if (scoped && typeof window !== 'undefined') window.localStorage.removeItem(scoped);
  },
};
