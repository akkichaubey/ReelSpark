import React from 'react';

/**
 * Global handler to prevent browser-native media AbortErrors
 * from triggering Next.js dev runtime error overlays.
 *
 * Browsers reject HTMLMediaElement.play() with an AbortError whenever
 * a media element is removed from the DOM or paused while play() is pending.
 * (https://goo.gl/LdLk22)
 *
 * Implemented as a zero-hook inline script to eliminate any possibility of
 * React hook mismatches or hydration errors in RootLayout.
 */
const SCRIPT_CONTENT = `
(function() {
  if (typeof window === 'undefined' || window.__mediaErrorHandlerAttached) return;
  window.__mediaErrorHandlerAttached = true;
  window.addEventListener('unhandledrejection', function(event) {
    var reason = event.reason;
    if (
      (reason && reason.name === 'AbortError') ||
      (reason && typeof reason.message === 'string' &&
        (reason.message.indexOf('play() request was interrupted') !== -1 ||
         reason.message.indexOf('play()') !== -1 ||
         reason.message.indexOf('media was removed from the document') !== -1)) ||
      (reason && reason.name === 'NotAllowedError')
    ) {
      event.preventDefault();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
    }
  });

  // Automatically unregister any legacy service workers that may cache stale next.js chunks
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function(registrations) {
      for (var i = 0; i < registrations.length; i++) {
        registrations[i].unregister();
      }
    });
  }
})();
`;

export function MediaErrorHandler() {
  return (
    <script
      id="media-error-handler"
      dangerouslySetInnerHTML={{ __html: SCRIPT_CONTENT }}
    />
  );
}
