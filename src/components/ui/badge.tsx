import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/ui-utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-amber-400 text-black shadow hover:bg-amber-300',
        secondary:
          'border-transparent bg-zinc-800 text-zinc-100 hover:bg-zinc-700',
        destructive:
          'border-transparent bg-red-600 text-white shadow hover:bg-red-500',
        outline: 'text-zinc-300 border-zinc-700',
        success: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300',
        warning: 'border-amber-500/30 bg-amber-500/15 text-amber-300',
        info: 'border-sky-500/30 bg-sky-500/15 text-sky-300',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
