import { useEffect } from 'react';
import type { KeyboardEvent } from 'react';

/** Spread onto a non-button element (div/span/svg <g>) that has an onClick,
 *  so keyboard users can Tab to it and activate it with Enter/Space —
 *  otherwise it's invisible to anyone not using a mouse. */
const NATIVE_KEY_HANDLERS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

export function clickableProps(onActivate: () => void) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    onKeyDown: (e: KeyboardEvent) => {
      // A focusable form control nested inside the clickable container
      // (e.g. a module-name input inside its collapsible header) already
      // owns Space/Enter — typing a space, submitting a select. Without
      // this check, the container's own "activate on Space" handler fires
      // first, both toggling the container AND swallowing the keystroke
      // before it reaches the input.
      const tag = (e.target as HTMLElement | undefined)?.tagName;
      if (tag && NATIVE_KEY_HANDLERS.has(tag)) return;
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
