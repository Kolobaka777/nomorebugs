import { useEffect, useRef, useState } from 'react';
import { TOAST_EVENT, ToastDetail } from '../utils/toast';
import Icon, { IconName } from './Icon';
import { ERROR } from '../utils/theme';

interface Toast extends ToastDetail {
  id: number;
}

const COLORS: Record<ToastDetail['kind'], { bg: string; fg: string }> = {
  error: { bg: ERROR, fg: '#0B0C10' },
  success: { bg: '#66FCF1', fg: '#0B0C10' },
  info: { bg: '#7F77DD', fg: '#0B0C10' },
};

const ICON: Record<ToastDetail['kind'], IconName> = {
  error: 'warning',
  success: 'check',
  info: 'lightbulb',
};

// Mounted once, at the app root — replaces every native alert()/silently
// swallowed error across the app with one consistent, in-theme, dismissable
// notification, so a failure is always visible and never just "nothing
// happened" or a browser-chrome popup asking to be confirmed away.
export default function ToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Dismissal timers by toast id, so a repeat of a message already on
  // screen can restart its countdown instead of adding a second copy.
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  // Mirrors `toasts` for the event listener, which is registered once and
  // would otherwise keep reading the empty array it closed over on mount.
  const shown = useRef<Toast[]>([]);

  const remove = (id: number) => {
    shown.current = shown.current.filter(t => t.id !== id);
    setToasts(shown.current);
  };

  useEffect(() => {
    const running = timers.current;
    let nextId = 0;

    const dismissAfter = (id: number, kind: ToastDetail['kind']) => {
      const existing = running.get(id);
      if (existing) clearTimeout(existing);
      // Errors stay a beat longer than success/info — there's usually more
      // to read (the actual reason something failed).
      running.set(id, setTimeout(() => {
        running.delete(id);
        remove(id);
      }, kind === 'error' ? 7000 : 4000));
    };

    const onToast = (e: Event) => {
      const detail = (e as CustomEvent<ToastDetail>).detail;
      // Decided against `shown`, not inside a state updater: React may call
      // an updater more than once for a single update, and this one has to
      // hand an id back to the timer below.
      const duplicate = shown.current.find(t => t.message === detail.message && t.kind === detail.kind);
      if (duplicate) {
        // One backend going quiet used to produce one toast per widget that
        // noticed — a wall of red saying the same thing several times over,
        // tall enough to bury the corner of the screen it lives in. The same
        // message means the same problem: one row, and a fresh countdown,
        // however many callers report it.
        dismissAfter(duplicate.id, detail.kind);
        return;
      }
      const id = ++nextId;
      shown.current = [...shown.current, { ...detail, id }];
      setToasts(shown.current);
      dismissAfter(id, detail.kind);
    };

    window.addEventListener(TOAST_EVENT, onToast);
    return () => {
      window.removeEventListener(TOAST_EVENT, onToast);
      running.forEach(clearTimeout);
      running.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismiss = (id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    remove(id);
  };

  // Rendered even when empty, deliberately. A live region has to be in the
  // document *before* the text appears in it — a screen reader announces
  // changes to a region it is already watching, and one that springs into
  // existence together with its first message is routinely missed. This
  // used to return null until the first toast, which meant the first thing
  // the app ever told a screen-reader user was the thing most likely to be
  // dropped.
  return (
    <div
      // Clears the frog in the same corner (FrogCompanion sits at
      // bottom:54 with a 72px sprite, so it reaches ~126px up). Two stacked
      // toasts used to cover it completely — burying the help mascot under
      // the errors is exactly backwards, since it is what you would click
      // when something goes wrong. The frog is hidden below `sm`, so the
      // extra room is only taken where there is something to clear.
      className="fixed bottom-6 sm:bottom-36 right-6 z-[100] flex flex-col gap-2 max-w-sm"
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
            <span className="shrink-0 flex items-center"><Icon name={ICON[t.kind]} size={15} color="currentColor" /></span>
            <span className="flex-1 break-words min-w-0">{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
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
