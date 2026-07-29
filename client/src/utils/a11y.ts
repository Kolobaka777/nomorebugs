import { useEffect } from 'react';
import type { KeyboardEvent } from 'react';

/** Spread onto a non-button element (div/span/svg <g>) that has an onClick,
 *  so keyboard users can Tab to it and activate it with Enter/Space —
 *  otherwise it's invisible to anyone not using a mouse. */
export function clickableProps(onActivate: () => void) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onActivate();
      }
    },
  };
}

/** Closes a modal/drawer on Escape — several of them already close on
 *  backdrop click, which is a mouse-only affordance with no keyboard
 *  equivalent. Call unconditionally (not just while "open"); the caller's
 *  component only mounts this while the modal is actually shown. */
export function useEscapeKey(onEscape: () => void) {
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onEscape();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onEscape]);
}
