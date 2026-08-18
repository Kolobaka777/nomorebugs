import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navigation from '../components/Navigation';
import FrogLoader from '../components/FrogLoader';
import Icon from '../components/Icon';
import { teamApi, presenceApi } from '../api';
import { TeamNewsItem, PresenceEntry } from '../types';
import { formatTeamEvent } from '../utils/activity';
import { timeAgo } from '../utils/date';
import { showApiError } from '../utils/toast';
import { EVENT_ICON } from '../utils/newsIcons';
import { PAGE_GRADIENT, PAGE_BG, CARD_BG, ACCENT, TEXT_PRIMARY, TEXT_MUTED, CARD_SHADOW, TRACK_WIDE } from '../utils/theme';

const MAX_ANNOUNCEMENT_LENGTH = 1000;

// Birthdays and leave aren't stored rows — the server recomputes them on
// every read, so their ids are strings ("birthday-4") and there is nothing
// to delete. Only numeric ids belong to a real team_events row.
const isStored = (id: number | string) => typeof id === 'number';

interface Props {
  user: any;
  onLogout: () => void;
}

const LEAVE_LABELS: Record<string, string> = { vacation: 'Отпуск', sick: 'Больничный', day_off: 'Отгул', other: 'Другое' };

export default function NewsPage({ user, onLogout }: Props) {
  const navigate = useNavigate();
  const isLead = user.role === 'lead' || user.role === 'admin';
  const [news, setNews] = useState<TeamNewsItem[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [presence, setPresence] = useState<PresenceEntry[] | null>(null);

  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState('');

  useEffect(() => {
    presenceApi.getTeam().then(r => setPresence(r.data)).catch((err: any) => showApiError(err, 'Не удалось загрузить статус команды'));
    teamApi.getNews()
      .then(r => { setNews(r.data.rows); setHasMore(r.data.hasMore); setOffset(r.data.storedCount); })
      .catch((err: any) => setLoadError(err.response?.data?.error || 'Не удалось загрузить новости'))
      .finally(() => setLoading(false));
  }, []);

  const post = async () => {
    if (!draft.trim()) { setPostError('Напиши текст новости'); return; }
    setPosting(true);
    setPostError('');
    try {
      const res = await teamApi.postNews(draft.trim());
      // Prepended rather than refetched: a reload would also re-run the
      // birthday/leave computation and reset the "показать ещё" cursor,
      // throwing away pages the lead had already loaded.
      setNews(n => [{
        id: res.data.id, event_type: 'announcement', created_at: new Date().toISOString(),
        user_id: user.id, name: user.displayName || user.name, avatar_initials: user.avatar_initials,
        gender: user.gender ?? null, text: draft.trim(),
      } as TeamNewsItem, ...n]);
      setDraft('');
    } catch (err: any) {
      setPostError(err.response?.data?.error || 'Не удалось опубликовать');
    } finally {
      setPosting(false);
    }
  };

  const remove = async (item: TeamNewsItem) => {
    if (!confirm('Удалить эту новость из ленты?')) return;
    const before = news;
    setNews(n => n.filter(x => x.id !== item.id));
    try {
      await teamApi.removeNews(item.id as number);
    } catch (err: any) {
      showApiError(err, 'Не удалось удалить новость');
      setNews(before);
    }
  };

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
            {/* Lead-only: the one item in this feed somebody writes rather
                than triggers by doing something else. */}
            {isLead && (
              <div className="p-4 rounded-lg mb-4" style={{ background: CARD_BG, border: `1px solid ${ACCENT}40`, boxShadow: CARD_SHADOW }}>
                <p className="font-geist text-sm font-semibold mb-2" style={{ color: TEXT_PRIMARY }}>Своя новость</p>
                <textarea
                  value={draft}
                  onChange={e => setDraft(e.target.value.slice(0, MAX_ANNOUNCEMENT_LENGTH))}
                  placeholder="Что рассказать команде?"
                  aria-label="Текст новости"
                  rows={2}
                  className="w-full rounded-lg px-3 py-2 font-geist text-sm resize-none outline-none mb-2"
                  style={{ background: PAGE_BG, color: TEXT_PRIMARY, border: '1px solid rgba(197, 198, 199,0.2)', lineHeight: 1.6 }}
                />
                <div className="flex justify-end">
                  <button onClick={post} disabled={posting} className="btn-primary text-xs px-5 py-2 disabled:opacity-50">
                    {posting ? '...' : 'Опубликовать'}
                  </button>
                </div>
                {postError && <p className="text-xs font-geist mt-2 break-words" style={{ color: '#e05252' }}>{postError}</p>}
              </div>
            )}

            {loading && <FrogLoader />}
            {loadError && <p className="text-sm font-geist text-center py-6 break-words" style={{ color: '#e05252' }}>{loadError}</p>}
            {!loading && !loadError && news.length === 0 && (
              <p className="font-geist text-sm text-center py-10" style={{ color: TEXT_MUTED }}>Пока новостей нет.</p>
            )}

            {news.length > 0 && (
              <div className="space-y-2 stagger-in">
                {news.map(item => (
                  <div key={item.id} className="px-4 py-3 flex items-start gap-3 rounded-lg" style={{ background: CARD_BG, border: '1px solid rgba(197, 198, 199,0.12)', boxShadow: CARD_SHADOW }}>
                    <Icon name={EVENT_ICON[item.event_type] || 'bug'} size={22} color={ACCENT} />
                    <p className="flex-1 font-geist text-sm break-words min-w-0" style={{ color: TEXT_PRIMARY }}>{formatTeamEvent(item)}</p>
                    <span className="font-geist text-xs shrink-0" style={{ color: TEXT_MUTED }}>{timeAgo(item.created_at)}</span>
                    {isLead && isStored(item.id) && (
                      <button
                        onClick={() => remove(item)}
                        aria-label="Удалить новость"
                        title="Удалить из ленты"
                        className="shrink-0 cursor-pointer"
                        style={{ color: TEXT_MUTED }}
                      >
                        <Icon name="close" size={14} color="currentColor" />
                      </button>
                    )}
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
