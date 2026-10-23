'use client';

import { useEffect } from 'react';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[ReelMaker route error]', error);
  }, [error]);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
      <section className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-900/80 p-6 text-center shadow-2xl">
        <h1 className="text-xl font-bold">Something went wrong</h1>
        <p className="mt-2 text-sm text-zinc-400">
          ReelMaker could not load this screen. Your saved local work has not been removed.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 rounded-xl bg-amber-400 px-4 py-2 text-sm font-bold text-zinc-950 transition-colors hover:bg-amber-300"
        >
          Try again
        </button>
      </section>
    </main>
  );
}
