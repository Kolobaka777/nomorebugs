import { useEffect, useState } from 'react';
import { TOAST_EVENT, ToastDetail } from '../utils/toast';

interface Toast extends ToastDetail {
  id: number;
}

const COLORS: Record<ToastDetail['kind'], { bg: string; fg: string }> = {
  error: { bg: '#e05252', fg: '#0f0f1a' },
  success: { bg: '#1D9E75', fg: '#0f0f1a' },
  info: { bg: '#7F77DD', fg: '#0f0f1a' },
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

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map(t => {
        const c = COLORS[t.kind];
        return (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className="px-4 py-3 rounded text-sm font-sans font-semibold flex items-start gap-2 fade-in"
            style={{ background: c.bg, color: c.fg, boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}
          >
            <span className="shrink-0">{ICON[t.kind]}</span>
            <span className="flex-1">{t.message}</span>
            <button
              onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
              aria-label="Закрыть уведомление"
              className="shrink-0 cursor-pointer opacity-70 hover:opacity-100"
              style={{ color: c.fg }}
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
