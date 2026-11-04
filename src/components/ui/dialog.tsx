'use client';

// Adapted from shadcn/ui (MIT). No stock styles or extra close buttons: callers
// supply the exact existing overlay, dimensions, header and content markup.
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useRef, type ComponentProps, type ReactNode } from 'react';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;

type DialogSurfaceProps = Omit<ComponentProps<typeof DialogPrimitive.Content>, 'children'> & {
  children: ReactNode;
  onClose: () => void;
  overlayClassName: string;
  dismissOnOutside?: boolean;
};

/** A mounted surface is open. Parent state continues to own its lifecycle. */
export function DialogSurface({ children, onClose, overlayClassName, dismissOnOutside = false,
  onCloseAutoFocus, onKeyDown, onInteractOutside, ...props }: DialogSurfaceProps) {
  // Capture the launcher before Radix mounts/focuses the portalled content.
  // Unlike a DialogTrigger, many existing launchers live in other components.
  const launcher = useRef(typeof document === 'undefined' ? null : document.activeElement);
  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={overlayClassName}>
          <DialogPrimitive.Content {...props}
            onKeyDown={event => {
              onKeyDown?.(event);
              // Radix dismissable layers handle Escape at the document. Keep
              // other editor shortcuts inside the dialog without swallowing it.
              if (event.key !== 'Escape') event.stopPropagation();
            }}
            onInteractOutside={event => {
              onInteractOutside?.(event);
              if (!dismissOnOutside) event.preventDefault();
            }}
            onCloseAutoFocus={event => {
              onCloseAutoFocus?.(event);
              if (!event.defaultPrevented && launcher.current instanceof HTMLElement && launcher.current.isConnected) {
                event.preventDefault();
                launcher.current.focus({ preventScroll: true });
              }
            }}>
            {children}
          </DialogPrimitive.Content>
        </DialogPrimitive.Overlay>
      </DialogPrimitive.Portal>
    </Dialog>
  );
}
