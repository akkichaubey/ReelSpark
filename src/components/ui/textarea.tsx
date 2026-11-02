// Adapted from shadcn/ui (MIT). Caller styles preserve the ReelSpark design.
import type { ComponentProps } from 'react';

export function Textarea(props: ComponentProps<'textarea'>) {
  return <textarea data-slot="textarea" {...props} />;
}
