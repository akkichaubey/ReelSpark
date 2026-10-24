import { create } from 'zustand';
import type { UserProfile } from './auth';
import { announceAccountIdentity, getCacheAccount, setCacheAccount } from './account-cache';

let authRequestVersion = 0;

function prepareAccount(user: UserProfile | null, alreadyLoaded: boolean): boolean {
  announceAccountIdentity(user?.id || null);
  if (alreadyLoaded && getCacheAccount() !== (user?.id || null) && typeof window !== 'undefined') {
    // A reload discards editor state, pending UI responses, autosave timers and
    // Zustand singletons before the next account's cache namespace is selected.
    window.location.reload();
    return false;
  }
  setCacheAccount(user?.id || null);
  return true;
}

interface AuthState {
  user: UserProfile | null;
  isLoading: boolean;
  authModalOpen: boolean;
  authModalMode: 'login' | 'register';

  openAuthModal: (mode?: 'login' | 'register') => void;
  closeAuthModal: () => void;
  checkAuth: () => Promise<void>;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (name: string, email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: true,
  authModalOpen: false,
  authModalMode: 'login',

  openAuthModal: (mode = 'login') => set({ authModalOpen: true, authModalMode: mode }),
  closeAuthModal: () => set({ authModalOpen: false }),

  checkAuth: async () => {
    const version = ++authRequestVersion;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch('/api/auth/me', { cache: 'no-store', signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json();
        if (version !== authRequestVersion) return;
        if (data.authenticated && data.user) {
          if (!prepareAccount(data.user, !get().isLoading)) return;
          set({ user: data.user, isLoading: false });
          return;
        }
      }
    } catch {
      // Offline / timeout / error — fall through to unauthenticated state
    }
    if (version === authRequestVersion && prepareAccount(null, !get().isLoading)) set({ user: null, isLoading: false });
  },

  login: async (email, password) => {
    ++authRequestVersion;
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'Login failed' };
      }
      if (prepareAccount(data.user, !get().isLoading)) set({ user: data.user, authModalOpen: false });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error during login' };
    }
  },

  register: async (name, email, password) => {
    ++authRequestVersion;
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'Registration failed' };
      }
      if (prepareAccount(data.user, !get().isLoading)) set({ user: data.user, authModalOpen: false });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error during registration' };
    }
  },

  logout: async () => {
    ++authRequestVersion;
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) return;
    } catch {
      return;
    }
    if (prepareAccount(null, true)) set({ user: null });
  },
}));
