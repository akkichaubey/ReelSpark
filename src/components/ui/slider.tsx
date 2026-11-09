'use client';

// Adapted from shadcn/ui (MIT).
import * as SliderPrimitive from '@radix-ui/react-slider';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/ui-utils';

export function Slider({ className, 'aria-label': label, ...props }: ComponentProps<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root className={cn('relative flex h-6 w-full touch-none select-none items-center', className)} {...props}>
      <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-zinc-700">
        <SliderPrimitive.Range className="absolute h-full bg-amber-400" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb aria-label={label} className="block size-3.5 rounded-full border border-amber-400 bg-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950" />
    </SliderPrimitive.Root>
  );
}
