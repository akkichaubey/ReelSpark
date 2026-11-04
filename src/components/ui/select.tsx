'use client';

// Adapted from shadcn/ui (MIT), using ReelSpark's existing theme palette.
import type { ComponentProps } from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/ui-utils';

export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;
export const SelectGroup = SelectPrimitive.Group;

export function SelectTrigger({ className, children, onKeyDown, ...props }: ComponentProps<typeof SelectPrimitive.Trigger>) {
  return <SelectPrimitive.Trigger data-slot="select-trigger" className={cn('flex items-center justify-between gap-2 rounded border border-zinc-700 bg-zinc-900 p-1.5 text-zinc-200 outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:cursor-not-allowed disabled:opacity-50', className)} {...props}
    onKeyDown={event => { onKeyDown?.(event); if (event.key !== 'Escape') event.stopPropagation(); }}>
    {children}<SelectPrimitive.Icon asChild><ChevronDown className="size-3.5 shrink-0 opacity-70" /></SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>;
}

export function SelectContent({ className, children, position = 'popper', sideOffset = 4, onKeyDown, ...props }: ComponentProps<typeof SelectPrimitive.Content>) {
  return <SelectPrimitive.Portal>
    <SelectPrimitive.Content data-slot="select-content" position={position} sideOffset={sideOffset}
      className={cn('relative z-[150] max-h-[var(--radix-select-content-available-height)] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-200 shadow-xl data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:zoom-out-95', className)} {...props}
      onKeyDown={event => { onKeyDown?.(event); event.stopPropagation(); }}>
      <SelectPrimitive.ScrollUpButton className="flex items-center justify-center py-1"><ChevronUp className="size-4" /></SelectPrimitive.ScrollUpButton>
      <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
      <SelectPrimitive.ScrollDownButton className="flex items-center justify-center py-1"><ChevronDown className="size-4" /></SelectPrimitive.ScrollDownButton>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>;
}

export function SelectItem({ className, children, ...props }: ComponentProps<typeof SelectPrimitive.Item>) {
  return <SelectPrimitive.Item data-slot="select-item" className={cn('relative flex cursor-default select-none items-center rounded-md py-2 pl-2 pr-8 text-xs outline-none focus:bg-amber-400 focus:text-black data-[disabled]:pointer-events-none data-[disabled]:opacity-50', className)} {...props}>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    <span className="absolute right-2 flex size-4 items-center justify-center"><SelectPrimitive.ItemIndicator><Check className="size-3.5" /></SelectPrimitive.ItemIndicator></span>
  </SelectPrimitive.Item>;
}
