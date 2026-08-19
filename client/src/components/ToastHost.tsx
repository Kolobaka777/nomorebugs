import { useEffect, useState } from 'react';
import { TOAST_EVENT, ToastDetail } from '../utils/toast';
import Icon from './Icon';
import { ERROR } from '../utils/theme';

interface Toast extends ToastDetail {
  id: number;
}

const COLORS: Record<ToastDetail['kind'], { bg: string; fg: string }> = {
  error: { bg: ERROR, fg: '#0B0C10' },
  success: { bg: '#66FCF1', fg: '#0B0C10' },
  info: { bg: '#7F77DD', fg: '#0B0C10' },
};

const ICON: Record<ToastDetail['kind'], string> = {
  error: '⚠',
  success: '✓',
  info: 'ℹ',
};

// Mounted once, at the app root — replaces every native alert()/silently
// swallowed error across the app with one consistent, in-theme, dismissable
// notification, so a failure is always visible and never just "nothing
// happened" or a browser-chrome popup asking to be confirmed away.
export default function ToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    let nextId = 0;
    const onToast = (e: Event) => {
      const detail = (e as CustomEvent<ToastDetail>).detail;
      const id = ++nextId;
      setToasts(prev => [...prev, { ...detail, id }]);
      // Errors stay a beat longer than success/info — there's usually more
      // to read (the actual reason something failed).
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), detail.kind === 'error' ? 7000 : 4000);
    };
    window.addEventListener(TOAST_EVENT, onToast);
    return () => window.removeEventListener(TOAST_EVENT, onToast);
  }, []);

  // Rendered even when empty, deliberately. A live region has to be in the
  // document *before* the text appears in it — a screen reader announces
  // changes to a region it is already watching, and one that springs into
  // existence together with its first message is routinely missed. This
  // used to return null until the first toast, which meant the first thing
  // the app ever told a screen-reader user was the thing most likely to be
  // dropped.
  return (
    <div
      className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 max-w-sm"
      aria-live="polite"
      aria-atomic="false"
      style={toasts.length === 0 ? { pointerEvents: 'none' } : undefined}
    >
      {toasts.map(t => {
        const c = COLORS[t.kind];
        return (
          <div
            key={t.id}
            // An error interrupts; a success or an info waits for a pause.
            role={t.kind === 'error' ? 'alert' : 'status'}
            className="px-4 py-3 rounded-lg text-sm font-sans font-semibold flex items-start gap-2 fade-in"
            style={{ background: c.bg, color: c.fg, boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}
          >
            <span className="shrink-0">{ICON[t.kind]}</span>
            <span className="flex-1 break-words min-w-0">{t.message}</span>
            <button
              onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
              aria-label="Закрыть уведомление"
              className="shrink-0 cursor-pointer opacity-70 hover:opacity-100 flex items-center"
              style={{ color: c.fg }}
            >
              <Icon name="close" size={22} color="currentColor" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
