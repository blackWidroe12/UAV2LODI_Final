'use client';

import { useEffect } from 'react';

/**
 * Suppresses benign ResizeObserver loop errors that occur with Radix UI components.
 * This is a known issue: https://github.com/radix-ui/primitives/issues/1217
 * The error doesn't affect functionality and is safe to suppress.
 */
export function ErrorSuppressor() {
  useEffect(() => {
    // Handle error events
    const errorHandler = (event: ErrorEvent) => {
      if (event.message?.includes('ResizeObserver loop')) {
        event.stopImmediatePropagation();
        event.preventDefault();
        return false;
      }
    };

    // Handle unhandled promise rejections
    const rejectionHandler = (event: PromiseRejectionEvent) => {
      if (event.reason?.message?.includes('ResizeObserver loop')) {
        event.stopImmediatePropagation();
        event.preventDefault();
        return false;
      }
    };

    // Patch ResizeObserver to suppress loop errors globally
    const resizeObserverErr = window.ResizeObserver;
    window.ResizeObserver = class extends resizeObserverErr {
      constructor(callback: ResizeObserverCallback) {
        super((entries, observer) => {
          // Use requestAnimationFrame to batch resize observations
          window.requestAnimationFrame(() => {
            try {
              callback(entries, observer);
            } catch (e) {
              // Suppress ResizeObserver loop errors
            }
          });
        });
      }
    };

    window.addEventListener('error', errorHandler);
    window.addEventListener('unhandledrejection', rejectionHandler);

    return () => {
      window.removeEventListener('error', errorHandler);
      window.removeEventListener('unhandledrejection', rejectionHandler);
      window.ResizeObserver = resizeObserverErr;
    };
  }, []);

  return null;
}
