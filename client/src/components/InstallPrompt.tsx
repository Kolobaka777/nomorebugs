import { useEffect, useState } from 'react';
import PixelIcon from './PixelIcon';

const DISMISS_KEY = 'install_prompt_dismissed';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Small dismissible banner offering to install the app, shown only when the
 *  browser actually supports it (fires beforeinstallprompt) and the user
 *  hasn't already dismissed it or installed the app. */
export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === 'true');

  useEffect(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as any).standalone === true;
    if (isStandalone) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (!deferredPrompt || dismissed) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, 'true');
    setDismissed(true);
  };

  const install = async () => {
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  };

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded shadow-lg"
      style={{ background: '#1a1a2e', border: '2px solid #1D9E75', maxWidth: '92vw' }}
      role="status"
    >
      <PixelIcon name="bug" size={20} color="#1D9E75" />
      <span className="text-pixel text-xs">Можно установить baga-net как приложение</span>
      <button
        onClick={install}
        className="font-pixel text-[10px] text-game bg-primary px-3 py-2 rounded cursor-pointer shrink-0"
      >
        Установить
      </button>
      <button
        onClick={dismiss}
        aria-label="Закрыть предложение установки"
        className="text-pixel/60 text-lg leading-none px-1 cursor-pointer shrink-0"
      >
        ×
      </button>
    </div>
  );
}
