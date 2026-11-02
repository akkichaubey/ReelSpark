// Adapted from shadcn/ui (MIT). Caller styles preserve the ReelSpark design.
import type { ComponentProps } from 'react';

/** React 19 passes refs through props, including file-picker and focus refs. */
export function Input(props: ComponentProps<'input'>) {
  return <input data-slot="input" {...props} />;
}
