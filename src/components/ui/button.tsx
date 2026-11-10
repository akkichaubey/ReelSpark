// Adapted from shadcn/ui (MIT). Existing ReelSpark classes are the design source.
import type { ComponentProps } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/ui-utils';

const buttonVariants = cva('', {
  variants: {
    variant: {
      // Native compatibility: no defaults may change existing editor controls.
      legacy: '',
      default: 'bg-amber-400 text-black shadow-sm hover:bg-amber-300',
      secondary: 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700',
      outline: 'border border-zinc-700 bg-transparent text-zinc-200 hover:bg-zinc-800',
      ghost: 'text-zinc-400 hover:bg-zinc-800 hover:text-white',
      destructive: 'bg-red-600 text-[#fff] hover:bg-red-700',
      success: 'bg-emerald-400 text-zinc-950 font-bold shadow-sm hover:bg-emerald-300',
      link: 'text-amber-400 underline-offset-4 hover:underline',
      appearance: 'flex shrink-0 items-center justify-center gap-3 rounded-xl p-2.5 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white',
      authGate: 'px-4 py-1.5 rounded-xl bg-white hover:bg-zinc-200 text-zinc-950 font-bold text-xs cursor-pointer shadow-sm transition-all',
    },
    size: {
      default: 'h-9 px-4 py-2',
      sm: 'h-8 px-3 text-xs',
      lg: 'h-10 px-6',
      icon: 'size-9',
    },
  },
  compoundVariants: [{
    variant: ['default', 'secondary', 'outline', 'ghost', 'destructive', 'link', 'success'],
    className: 'inline-flex shrink-0 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:pointer-events-none disabled:opacity-50 aria-invalid:ring-red-500 aria-invalid:border-red-500',
  }],
  defaultVariants: { variant: 'legacy' },
});

type ButtonProps = ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean };

/** Retains native submit defaults, refs and all pointer/keyboard props. */
export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Component = asChild ? Slot : 'button';
  return <Component data-slot="button" className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { buttonVariants };
