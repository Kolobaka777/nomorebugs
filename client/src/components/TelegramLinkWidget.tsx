import { useEffect, useRef, useState } from 'react';
import { telegramApi } from '../api';
import { showApiError } from '../utils/toast';
import Icon from './Icon';

type Status =
  | { phase: 'loading' }
  | { phase: 'unlinked' }
  | { phase: 'starting' }
  | { phase: 'waiting'; deepLink: string }
  | { phase: 'linked'; username: string | null }
  | { phase: 'expired' | 'error' };

const POLL_INTERVAL_MS = 2000;

// Lets an already-logged-in user (typically an email/password account) opt
// into Telegram — enabling both notifications and Telegram-based login
// going forward — without creating a second, separate account. Lives in
// the account dropdown menu since that's reachable from every role/page.
export default function TelegramLinkWidget() {
  const [status, setStatus] = useState<Status>({ phase: 'loading' });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    telegramApi.status()
      .then(({ data }) => setStatus(data.linked ? { phase: 'linked', username: data.telegramUsername } : { phase: 'unlinked' }))
      .catch(() => setStatus({ phase: 'unlinked' }));
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const startLink = async () => {
    setStatus({ phase: 'starting' });
    try {
      const { data } = await telegramApi.linkStart();
      setStatus({ phase: 'waiting', deepLink: data.deepLink });
      pollRef.current = setInterval(async () => {
        try {
          const { data: result } = await telegramApi.poll(data.token);
          if (result.status === 'linked') {
            if (pollRef.current) clearInterval(pollRef.current);
            setStatus({ phase: 'linked', username: result.telegramUsername });
          } else if (result.status === 'expired' || result.status === 'error') {
            if (pollRef.current) clearInterval(pollRef.current);
            setStatus({ phase: result.status });
          }
        } catch {
          // Transient — next tick retries.
        }
      }, POLL_INTERVAL_MS);
    } catch {
      setStatus({ phase: 'error' });
    }
  };

  const unlink = async () => {
    try {
      await telegramApi.unlink();
      setStatus({ phase: 'unlinked' });
    } catch (err: any) {
      // Leave the displayed state as-is — the button just stays clickable to
      // retry — but say why it didn't work instead of leaving it a mystery.
      showApiError(err, 'Не удалось отвязать Telegram');
    }
  };

  if (status.phase === 'loading') return null;

  return (
    <div className="px-3 py-2 text-xs font-sans" style={{ borderTop: '1px solid rgba(102, 252, 241,0.08)' }}>
      {status.phase === 'linked' && (
        <div className="flex items-center justify-between gap-2">
          <span style={{ color: '#229ED9' }}>Telegram: @{status.username || '…'}</span>
          <button onClick={unlink} className="cursor-pointer" style={{ color: 'rgba(197, 198, 199,0.45)' }}>
            отвязать
          </button>
        </div>
      )}

      {status.phase === 'unlinked' && (
        <button onClick={startLink} className="cursor-pointer" style={{ color: '#229ED9' }}>
          🔗 Привязать Telegram
        </button>
      )}

      {status.phase === 'starting' && <span style={{ color: 'rgba(197, 198, 199,0.45)' }}>секунду...</span>}

      {status.phase === 'waiting' && (
        <div>
          <a
            href={status.deepLink}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#229ED9' }}
          >
            <span className="inline-flex items-center gap-1">Открыть Telegram <Icon name="arrowRight" size={14} color="currentColor" /></span>
          </a>
          <p className="pixel-pulse mt-1" style={{ color: 'rgba(197, 198, 199,0.45)' }}>ждём подтверждения...</p>
        </div>
      )}

      {(status.phase === 'expired' || status.phase === 'error') && (
        <button onClick={startLink} className="cursor-pointer" style={{ color: '#e05252' }}>
          {status.phase === 'expired' ? 'Ссылка устарела — попробовать снова' : 'Ошибка — попробовать снова'}
        </button>
      )}
    </div>
  );
}
