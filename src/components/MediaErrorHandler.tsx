'use client';

import { useEffect } from 'react';

/**
 * Global handler to prevent browser-native media AbortErrors
 * from triggering Next.js dev runtime error overlays.
 *
 * Browsers reject HTMLMediaElement.play() with an AbortError whenever
 * a media element is removed from the DOM or paused while play() is pending.
 * (https://goo.gl/LdLk22)
 */
export function MediaErrorHandler() {
  useEffect(() => {
    const handleRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      if (
        reason?.name === 'AbortError' ||
        (typeof reason?.message === 'string' &&
          (reason.message.includes('play() request was interrupted') ||
            reason.message.includes('play()') ||
            reason.message.includes('media was removed from the document'))) ||
        reason?.name === 'NotAllowedError'
      ) {
        // Prevent Next.js runtime error overlay from popping up for benign media interruptions
        event.preventDefault();
        event.stopImmediatePropagation?.();
      }
    };

    window.addEventListener('unhandledrejection', handleRejection);
    return () => window.removeEventListener('unhandledrejection', handleRejection);
  }, []);

  return null;
}
