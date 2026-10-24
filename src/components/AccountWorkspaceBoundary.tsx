'use client';

import { useEffect, type ReactNode } from 'react';
import { useAuthStore } from '@/lib/use-auth-store';
import { ACCOUNT_IDENTITY_EVENT_KEY } from '@/lib/account-cache';

/** Do not restore private editor caches before the session identity is known. */
export function AccountWorkspaceBoundary({ children }: { children: ReactNode }) {
  const isLoading = useAuthStore(state => state.isLoading);
  const checkAuth = useAuthStore(state => state.checkAuth);
  useEffect(() => { void checkAuth(); }, [checkAuth]);
  useEffect(() => {
    const refresh = () => { void checkAuth(); };
    const storage = (event: StorageEvent) => {
      if (event.key === ACCOUNT_IDENTITY_EVENT_KEY) refresh();
    };
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener('storage', storage);
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', restore);
    return () => {
      window.removeEventListener('storage', storage);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', restore);
    };
  }, [checkAuth]);
  if (isLoading) return <div role="status" className="p-6 text-zinc-400">Loading workspace…</div>;
  return children;
}
