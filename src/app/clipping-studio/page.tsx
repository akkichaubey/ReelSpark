'use client';

import React, { useEffect, Suspense } from 'react';
import Link from 'next/link';
import { StudioShell } from '@/components/clipping-studio/StudioShell';
import { SiteLoader } from '@/components/SiteLoader';
import { useAuthStore } from '@/lib/use-auth-store';
import { AuthModal } from '@/components/AuthModal';
import { Scissors } from 'lucide-react';

function ClippingStudioPageContent() {
  const { user, isLoading: authLoading, openAuthModal, checkAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  if (!authLoading && !user) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col text-white font-sans">
        <header className="h-14 border-b border-zinc-800 bg-zinc-900/90 px-4 sm:px-6 flex items-center justify-between shrink-0 z-30 sticky top-0 backdrop-blur-md">
          <Link href="/" className="flex items-center gap-2 hover:opacity-90 transition-opacity">
            <div className="w-8 h-8 rounded-lg bg-amber-400 flex items-center justify-center text-black font-black shadow-md shadow-amber-400/20">
              <Scissors className="w-4 h-4 text-black" />
            </div>
            <div>
              <span className="font-bold text-sm tracking-tight text-white flex items-center gap-1.5">
                Clipping Studio
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  Pro Studio
                </span>
              </span>
            </div>
          </Link>
          <button
            onClick={() => openAuthModal('login')}
            className="px-4 py-1.5 rounded-xl bg-white hover:bg-zinc-200 text-zinc-950 font-bold text-xs cursor-pointer shadow-sm transition-all"
          >
            Sign In / Register
          </button>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center p-8 text-center relative overflow-hidden">
          <div className="max-w-md space-y-4 relative z-10">
            <div className="w-12 h-12 rounded-2xl bg-amber-400/10 border border-amber-400/20 text-amber-400 flex items-center justify-center mx-auto shadow-lg shadow-amber-400/5">
              <Scissors className="w-6 h-6" />
            </div>
            <h2 className="text-2xl font-bold">Sign In to Use Clipping Studio</h2>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Please sign in or create an account to import long videos, perform precise timeline trimming, and multi-clip exports.
            </p>
            <div className="pt-2">
              <button
                onClick={() => openAuthModal('login')}
                className="w-full py-3 rounded-xl bg-white hover:bg-zinc-200 text-zinc-950 font-bold text-xs cursor-pointer shadow-lg shadow-white/10 transition-all hover:scale-[1.01] active:scale-[0.99]"
              >
                Sign In to Continue
              </button>
            </div>
          </div>
        </main>
        <AuthModal />
      </div>
    );
  }

  return <StudioShell />;
}

export default function ClippingStudioPage() {
  return (
    <Suspense
      fallback={<SiteLoader label="Loading Clipping Studio…" />}
    >
      <ClippingStudioPageContent />
    </Suspense>
  );
}
