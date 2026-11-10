import * as React from 'react';
import { cn } from '@/lib/ui-utils';

const Progress = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { value?: number | null }
>(({ className, value, ...props }, ref) => (
  <div
    ref={ref}
    role="progressbar"
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={value ?? undefined}
    className={cn(
      'relative h-2 w-full overflow-hidden rounded-full bg-zinc-800',
      className
    )}
    {...props}
  >
    <div
      className="h-full w-full flex-1 bg-amber-400 transition-all duration-300 ease-in-out"
      style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
    />
  </div>
));
Progress.displayName = 'Progress';

export { Progress };
