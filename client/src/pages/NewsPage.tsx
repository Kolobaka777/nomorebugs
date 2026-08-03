import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navigation from '../components/Navigation';
import SnailLoader from '../components/SnailLoader';
import PixelIcon, { IconName } from '../components/PixelIcon';
import { teamApi, presenceApi } from '../api';
import { TeamNewsItem, PresenceEntry } from '../types';
import { formatTeamEvent } from '../utils/activity';
import { timeAgo } from '../utils/date';
import { showApiError } from '../utils/toast';

interface Props {
  user: any;
  onLogout: () => void;
}

const LEAVE_LABELS: Record<string, string> = { vacation: 'Отпуск', sick: 'Больничный', day_off: 'Отгул', other: 'Другое' };

const EVENT_ICON: Record<string, IconName> = {
  birthday: 'star',
  member_joined: 'bee',
  guide_published: 'books',
  course_published: 'graduation',
  lecture_video_added: 'camera',
  leave_started: 'bug',
  leave_ended: 'bug',
};

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
    <div className="min-h-screen" style={{ background: '#0f0f1a' }}>
      <Navigation user={user} onLogout={onLogout} />
      <div className="max-w-3xl mx-auto px-6 pt-16 pb-8 fade-in">
        <h1 className="font-pixel text-primary mb-6" style={{ fontSize: '0.8rem', lineHeight: 1.8 }}>
          <span className="flex items-center gap-2"><PixelIcon name="antenna" size={14} color="#EF9F27" /> Новости</span>
        </h1>

        {/* Работают сейчас — общая информация, видна всем */}
        {presence && presence.length > 0 && (
          <div className="p-4 rounded mb-6" style={{ background: '#1a1a2e', boxShadow: '2px 0 0 0 rgba(29,158,117,0.25), -2px 0 0 0 rgba(29,158,117,0.25), 0 2px 0 0 rgba(29,158,117,0.25), 0 -2px 0 0 rgba(29,158,117,0.25)' }}>
            <p className="font-pixel text-xs mb-3" style={{ color: '#1D9E75', lineHeight: 1.8 }}>Работают сейчас</p>
            <div className="flex flex-wrap gap-2">
              {presence.map(p => {
                const dotColor = p.currentLeave ? '#EF9F27' : p.isWorkingNow ? '#1D9E75' : 'rgba(232,232,208,0.3)';
                const subtitle = p.currentLeave
                  ? `${LEAVE_LABELS[p.currentLeave.type]}${p.currentLeave.end_date ? ` до ${p.currentLeave.end_date}` : ''}`
                  : (p.workStart && p.workEnd) ? `${p.workStart}–${p.workEnd}` : 'часы не заданы';
                return (
                  <button
                    key={p.id}
                    onClick={() => navigate(`/profile/${p.id}`)}
                    className="flex items-center gap-2 px-3 py-2 rounded cursor-pointer text-left"
                    style={{ background: 'rgba(232,232,208,0.04)' }}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dotColor }} />
                    <span>
                      <span className="block text-pixel text-xs font-sans font-semibold">{p.name}</span>
                      <span className="block text-pixel/50 text-[11px] font-sans">{subtitle}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {loading && <SnailLoader />}
        {loadError && <p className="text-sm font-sans text-center py-6" style={{ color: '#e05252' }}>{loadError}</p>}
        {!loading && !loadError && news.length === 0 && (
          <p className="text-pixel/50 text-sm font-sans text-center py-10">Пока новостей нет.</p>
        )}

        {news.length > 0 && (
          <div className="space-y-2">
            {news.map(item => (
              <div key={item.id} className="px-4 py-3 flex items-start gap-3 rounded" style={{ background: '#1a1a2e', border: '1px solid rgba(29,158,117,0.08)' }}>
                <PixelIcon name={EVENT_ICON[item.event_type] || 'bug'} size={13} color="#EF9F27" />
                <p className="flex-1 text-sm font-sans" style={{ color: 'rgba(232,232,208,0.75)' }}>{formatTeamEvent(item)}</p>
                <span className="text-pixel/40 text-xs font-sans shrink-0">{timeAgo(item.created_at)}</span>
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
    </div>
  );
}
