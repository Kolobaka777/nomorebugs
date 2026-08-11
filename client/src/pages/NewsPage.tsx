import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navigation from '../components/Navigation';
import SnailLoader from '../components/SnailLoader';
import Icon from '../components/Icon';
import { teamApi, presenceApi } from '../api';
import { TeamNewsItem, PresenceEntry } from '../types';
import { formatTeamEvent } from '../utils/activity';
import { timeAgo } from '../utils/date';
import { showApiError } from '../utils/toast';
import { EVENT_ICON } from '../utils/newsIcons';
import { PAGE_GRADIENT, CARD_BG, ACCENT, TEXT_PRIMARY, TEXT_MUTED, CARD_SHADOW, TRACK_WIDE } from '../utils/theme';

interface Props {
  user: any;
  onLogout: () => void;
}

const LEAVE_LABELS: Record<string, string> = { vacation: 'Отпуск', sick: 'Больничный', day_off: 'Отгул', other: 'Другое' };

export default function NewsPage({ user, onLogout }: Props) {
  const navigate = useNavigate();
  const [news, setNews] = useState<TeamNewsItem[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [presence, setPresence] = useState<PresenceEntry[] | null>(null);

  useEffect(() => {
    presenceApi.getTeam().then(r => setPresence(r.data)).catch((err: any) => showApiError(err, 'Не удалось загрузить статус команды'));
    teamApi.getNews()
      .then(r => { setNews(r.data.rows); setHasMore(r.data.hasMore); setOffset(r.data.storedCount); })
      .catch((err: any) => setLoadError(err.response?.data?.error || 'Не удалось загрузить новости'))
      .finally(() => setLoading(false));
  }, []);

  const loadMore = () => {
    setLoadingMore(true);
    teamApi.getNews({ offset })
      .then(r => {
        setNews(n => [...n, ...r.data.rows]);
        setHasMore(r.data.hasMore);
        // storedCount, not rows.length — page 0 mixes in birthday/leave
        // "virtual" items that aren't part of the stored offset cursor;
        // advancing by the merged count would skip real stored rows.
        setOffset(o => o + r.data.storedCount);
      })
      .catch((err: any) => showApiError(err, 'Не удалось загрузить ещё новости'))
      .finally(() => setLoadingMore(false));
  };

  return (
    <div className="min-h-screen" style={{ background: PAGE_GRADIENT }}>
      <Navigation user={user} onLogout={onLogout} />
      <div className="max-w-5xl mx-auto px-6 pt-16 pb-8 fade-in">
        <h1 className="font-montserrat font-bold mb-6 flex items-center gap-2" style={{ fontSize: 24, color: TEXT_PRIMARY, letterSpacing: TRACK_WIDE }}>
          <Icon name="antenna" size={22} color={ACCENT} /> Новости
        </h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT: the news feed itself, unchanged — a plain scrolling list */}
          <div className="lg:col-span-2 lg:order-1 order-2">
            {loading && <SnailLoader />}
            {loadError && <p className="text-sm font-geist text-center py-6 break-words" style={{ color: '#e05252' }}>{loadError}</p>}
            {!loading && !loadError && news.length === 0 && (
              <p className="font-geist text-sm text-center py-10" style={{ color: TEXT_MUTED }}>Пока новостей нет.</p>
            )}

            {news.length > 0 && (
              <div className="space-y-2">
                {news.map(item => (
                  <div key={item.id} className="px-4 py-3 flex items-start gap-3 rounded-lg" style={{ background: CARD_BG, border: '1px solid rgba(197, 198, 199,0.12)', boxShadow: CARD_SHADOW }}>
                    <Icon name={EVENT_ICON[item.event_type] || 'bug'} size={22} color={ACCENT} />
                    <p className="flex-1 font-geist text-sm break-words min-w-0" style={{ color: TEXT_PRIMARY }}>{formatTeamEvent(item)}</p>
                    <span className="font-geist text-xs shrink-0" style={{ color: TEXT_MUTED }}>{timeAgo(item.created_at)}</span>
                  </div>
                ))}
              </div>
            )}

            {hasMore && (
              <div className="text-center mt-4">
                <button onClick={loadMore} disabled={loadingMore} className="btn-secondary text-xs px-4 py-2 disabled:opacity-50">
                  {loadingMore ? '...' : 'Показать ещё'}
                </button>
              </div>
            )}
          </div>

          {/* RIGHT: "Работают сейчас" — pinned as its own fixed column
              instead of a full-width block above the feed, so it stays in
              view alongside the news as the feed scrolls/grows. */}
          {presence && presence.length > 0 && (
            <div className="lg:order-2 order-1">
              <div className="p-4 rounded-lg lg:sticky lg:top-20" style={{ background: CARD_BG, border: `1px solid ${ACCENT}40`, boxShadow: CARD_SHADOW }}>
                <p className="font-montserrat font-semibold mb-3" style={{ fontSize: 13, color: ACCENT, letterSpacing: TRACK_WIDE }}>Работают сейчас</p>
                <div className="flex flex-col gap-2">
                  {presence.map(p => {
                    const dotColor = p.currentLeave ? '#EF9F27' : p.isWorkingNow ? ACCENT : 'rgba(197, 198, 199,0.3)';
                    const subtitle = p.currentLeave
                      ? `${LEAVE_LABELS[p.currentLeave.type]}${p.currentLeave.end_date ? ` до ${p.currentLeave.end_date}` : ''}`
                      : (p.workStart && p.workEnd) ? `${p.workStart}–${p.workEnd}` : 'часы не заданы';
                    return (
                      <button
                        key={p.id}
                        onClick={() => navigate(`/profile/${p.id}`)}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-left transition-colors"
                        style={{ background: 'rgba(197, 198, 199,0.04)' }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(102, 252, 241,0.08)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(197, 198, 199,0.04)'; }}
                      >
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dotColor }} />
                        <span className="min-w-0">
                          <span className="block font-geist text-sm font-semibold break-words" style={{ color: TEXT_PRIMARY }}>{p.name}</span>
                          <span className="block font-geist text-xs" style={{ color: TEXT_MUTED }}>{subtitle}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
