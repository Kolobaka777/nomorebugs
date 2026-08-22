import { ReactNode, MouseEvent, KeyboardEvent, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';
import { ACCENT, CARD_BG_PATTERN, CARD_SHADOW_TALL, TEXT_MUTED, TRACK_WIDE } from '../utils/theme';

// Single shared "window" chrome for every modal/dialog in the app — before
// this, each modal (ChangePasswordModal, ProfileEditModal, the checklist
// import/export/template dialogs, the uley award/presence dialogs...) built
// its own backdrop/box/border/close-button from scratch, and each one had
// drifted to a slightly different opacity/radius/border/glyph. This is the
// one place that treatment is defined now — change it here and every modal
// follows, same principle as utils/theme.ts for colors.
interface ModalProps {
  title?: ReactNode;
  onClose?: () => void; // omit to suppress the close button (e.g. a forced flow with no dismiss)
  children: ReactNode;
  maxWidth?: number; // px
  zIndex?: number;
  // Some dialogs need edge-to-edge content below the header (a sub-tab
  // row, a scrollable list) rather than the default p-5 padded body —
  // set this and own all inner spacing yourself.
  noBodyPadding?: boolean;
  // Extra content between the title and the close button (e.g. a small
  // ok/fail count pair) — rare, most modals don't need it.
  headerRight?: ReactNode;
}

// Elements a keyboard user can land on inside the modal box, for the focus
// trap below. Queried fresh on every Tab press rather than cached, since the
// 8 modals that use this component render wildly different content (forms,
// lists, conditionally-shown buttons) that can change while open.
const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export default function Modal({ title, onClose, children, maxWidth = 440, zIndex = 200, noBodyPadding, headerRight }: ModalProps) {
  const stop = (e: MouseEvent) => e.stopPropagation();
  const boxRef = useRef<HTMLDivElement>(null);
  // Whatever had focus right before this modal opened, so it can be
  // restored once the modal unmounts (closes).
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    // Focus the modal box itself rather than hunting for a "first"
    // focusable element inside it — content varies a lot across the 8
    // callers (forms, read-only summaries, lists), so the box (tabIndex
    // -1 below) is the one robust, always-present focus target.
    boxRef.current?.focus();
    return () => {
      previouslyFocusedRef.current?.focus();
    };
  }, []);

  const trapTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !boxRef.current) return;
    const focusable = Array.from(boxRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      el => !el.hasAttribute('disabled')
    );
    if (focusable.length === 0) {
      // Nothing to land on but the box itself — keep focus trapped there.
      e.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (e.shiftKey) {
      if (!active || active === first || !focusable.includes(active)) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (!active || active === last || !focusable.includes(active)) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  // Portaled to <body> rather than rendered in place: `position: fixed`
  // resolves relative to the nearest ancestor with a transform/filter/
  // backdrop-filter, not the viewport, if one exists anywhere up the tree
  // (CSS spec, not a bug) — and this app has several (the header's frosted
  // blur, page-transition .fade-in wrappers). A modal opened from inside
  // one of those got trapped and rendered off-screen/unreachable. Portaling
  // to body sidesteps the whole containing-block chain unconditionally.
  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ background: 'rgba(11, 12, 16, 0.75)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex }}
      onClick={onClose}
    >
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className="w-full rounded-lg"
        // The bug tile, same as every card on every page. A dialog was the
        // one surface in the app still painted flat — measured against the
        // design's export of the profile editor, its header and its body
        // carry the same tile at the same strength as a course card.
        style={{ maxWidth, maxHeight: '90vh', overflowY: 'auto', background: CARD_BG_PATTERN, border: `1px solid ${ACCENT}`, boxShadow: CARD_SHADOW_TALL, outline: 'none' }}
        onClick={stop}
        onKeyDown={trapTabKey}
      >
        {(title || onClose) && (
          <div
            className="sticky top-0 flex items-center justify-between gap-4 px-5 py-4"
            // Its own copy of the tile rather than a transparent header:
            // this is sticky, so the body scrolls underneath it.
            style={{ background: CARD_BG_PATTERN, borderBottom: `1px solid ${ACCENT}22`, borderRadius: '8px 8px 0 0' }}
          >
            {title && (
              <div className="font-montserrat font-semibold flex items-center gap-2 min-w-0" style={{ color: ACCENT, fontSize: 16, letterSpacing: TRACK_WIDE }}>
                {title}
              </div>
            )}
            <div className="flex items-center gap-3 shrink-0">
              {headerRight}
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Закрыть"
                  className="cursor-pointer transition-colors flex items-center"
                  style={{ color: TEXT_MUTED }}
                  onMouseEnter={e => { e.currentTarget.style.color = ACCENT; }}
                  onMouseLeave={e => { e.currentTarget.style.color = TEXT_MUTED; }}
                >
                  <Icon name="close" size={22} color="currentColor" />
                </button>
              )}
            </div>
          </div>
        )}
        {noBodyPadding ? children : <div className="p-5">{children}</div>}
      </div>
    </div>,
    document.body
  );
}
