import { useEffect, useRef, useState } from 'react';
import { telegramApi } from '../api';
import Icon from './Icon';
import { ERROR } from '../utils/theme';

interface TelegramLoginButtonProps {
  onLogin: (token: string, user: any, needsBaselineSurvey: boolean) => void;
}

type Phase = 'idle' | 'starting' | 'waiting' | 'expired' | 'error' | 'unavailable';

const POLL_INTERVAL_MS = 2000;

// Login/registration via the Telegram bot: request a one-time deep link,
// send the person to Telegram, poll until the bot (server-side, via /start)
// reports the session is ready. Mirrors the email/password flow's onLogin
// contract exactly, so App.tsx treats it identically either way.
export default function TelegramLoginButton({ onLogin }: TelegramLoginButtonProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Handle to the Telegram tab/popup we opened — kept so a successful poll
  // can close it automatically instead of leaving the person stranded on it
  // needing to alt-tab back manually. Only works when Telegram actually
  // opened as a browser tab (desktop/web); if the OS handed the deep link
  // off to the native app instead, there's no window to close — the bot's
  // own confirmation message carries a "back to site" button for that case.
  const telegramWindowRef = useRef<Window | null>(null);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const start = async () => {
    setPhase('starting');
    try {
      const { data } = await telegramApi.start();
      setDeepLink(data.deepLink);
      setPhase('waiting');
      pollRef.current = setInterval(async () => {
        try {
          const { data: result } = await telegramApi.poll(data.token);
          if (result.status === 'ready') {
            if (pollRef.current) clearInterval(pollRef.current);
            telegramWindowRef.current?.close();
            window.focus();
            onLogin(result.token, result.user, result.needsBaselineSurvey);
          } else if (result.status === 'expired' || result.status === 'error') {
            if (pollRef.current) clearInterval(pollRef.current);
            setPhase(result.status);
          }
        } catch {
          // Transient network hiccup — the next tick tries again rather
          // than tearing down the flow over one failed poll.
        }
      }, POLL_INTERVAL_MS);
    } catch (err: any) {
      setPhase(err.response?.status === 503 ? 'unavailable' : 'error');
    }
  };

  if (phase === 'unavailable') {
    return (
      <p className="text-pixel/45 text-xs font-sans text-center mt-2">
        Вход через Telegram временно недоступен
      </p>
    );
  }

  if (phase === 'waiting') {
    return (
      <div
        className="mt-4 p-3 rounded text-center"
        style={{ background: 'rgba(102, 252, 241,0.05)', border: '1px solid rgba(102, 252, 241,0.2)' }}
      >
        <p className="text-pixel/70 text-xs font-sans mb-2">Открой Telegram и нажми «Старт» в боте</p>
        <a
          href={deepLink || '#'}
          target="_blank"
          rel="noreferrer"
          className="btn-primary inline-block"
          style={{ padding: '8px 16px', fontSize: '12px' }}
          onClick={e => {
            if (!deepLink) return;
            // Intercept the plain anchor navigation to open via window.open
            // instead — that's the only way to get a handle back that lets
            // the poll loop above close this tab automatically once
            // Telegram confirms. rel="noreferrer" (deliberately without
            // "noopener") keeps that handle alive; href stays real so
            // middle-click/"open in new tab" still works normally.
            e.preventDefault();
            telegramWindowRef.current = window.open(deepLink, '_blank');
          }}
        >
          <span className="inline-flex items-center gap-1">Открыть Telegram <Icon name="arrowRight" size={14} color="currentColor" /></span>
        </a>
        <p className="pixel-pulse text-pixel/50 text-xs font-sans mt-3">🐌 ждём подтверждения... вкладка закроется сама</p>
      </div>
    );
  }

  if (phase === 'expired' || phase === 'error') {
    return (
      <div className="mt-4 text-center">
        <p className="text-xs font-sans mb-2" style={{ color: ERROR }}>
          {phase === 'expired' ? 'Ссылка устарела' : 'Что-то пошло не так'}
        </p>
        <button
          onClick={start}
          className="w-full text-center text-pixel/60 text-xs font-sans cursor-pointer hover:text-pixel/80"
        >
          <span className="inline-flex items-center gap-1">Попробовать снова <Icon name="arrowRight" size={14} color="currentColor" /></span>
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={start}
      disabled={phase === 'starting'}
      className="w-full mt-4 flex items-center justify-center gap-2 disabled:opacity-50"
      style={{
        padding: '10px',
        fontSize: '13px',
        borderRadius: '8px',
        border: '2px solid #229ED9',
        background: 'rgba(34,158,217,0.08)',
        color: '#229ED9',
        cursor: 'pointer',
      }}
    >
      <Icon name="bug" size={13} color="#229ED9" />
      {phase === 'starting' ? 'секунду...' : 'Войти через Telegram'}
    </button>
  );
}
