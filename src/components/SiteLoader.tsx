import { ReelSparkLogo } from '@/components/ReelSparkLogo';

interface SiteLoaderProps {
  label?: string;
  fullScreen?: boolean;
  showBrand?: boolean;
  className?: string;
}

/** Shared, accessible loading state for route changes and app initialization. */
export function SiteLoader({
  label = 'Loading ReelSpark…',
  fullScreen = true,
  showBrand = true,
  className = '',
}: SiteLoaderProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={`relative isolate flex ${fullScreen ? 'min-h-[100dvh]' : 'min-h-56'} w-full flex-col items-center justify-center gap-5 overflow-hidden bg-zinc-950 px-6 py-12 text-zinc-100 ${className}`}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_50%_35%,rgba(252,217,5,0.09),transparent_48%)]"
      />

      {showBrand && (
        <ReelSparkLogo
          variant="full"
          className="h-9 w-auto max-w-48 shrink-0"
          aria-hidden="true"
        />
      )}

      <div className="relative flex size-14 items-center justify-center" aria-hidden="true">
        <span className="absolute inset-0 rounded-full border border-amber-400/15" />
        <span className="absolute inset-0 rounded-full border-2 border-transparent border-t-amber-400 animate-spin" />
        <span className="size-2 rounded-full bg-amber-400 shadow-[0_0_18px_rgba(252,217,5,0.65)]" />
      </div>

      <p className="text-center text-sm font-medium tracking-wide text-zinc-300">
        {label}
      </p>
    </div>
  );
}
