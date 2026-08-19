import { useMemo } from 'react';
import Icon from '../Icon';
import { ActivityItem, ActivityFilters, TeamMember } from '../../types';
import { parseServerDate } from '../../utils/date';
import { formatActivityAction } from '../../utils/activity';
import {
  ACCENT, ACCENT_DIM, BADGE_NOTIFY, CARD_BG, PAGE_BG, TEXT_PRIMARY, TEXT_MUTED,
  TRACK_WIDE, ERROR, SUCCESS, INFO, softText,
} from '../../utils/theme';

// Category → the colour of a row's left edge and of its filter chip. The
// category itself is decided server-side (activityCategories.js) and
// arrives on each row, so this map is presentation only — adding an action
// type never requires touching it.
const CATEGORY_STYLE: Record<string, { label: string; color: string }> = {
  learning: { label: 'Учёба', color: ACCENT },
  content: { label: 'Контент', color: SUCCESS },
  admin: { label: 'Доступы и премии', color: INFO },
  account: { label: 'Аккаунты', color: BADGE_NOTIFY },
};

const FILTER_CHIPS: { id: string; label: string; color: string }[] = [
  { id: '', label: 'Всё', color: ACCENT },
  ...Object.entries(CATEGORY_STYLE).map(([id, s]) => ({ id, label: s.label, color: s.color })),
];

export const EMPTY_ACTIVITY_FILTERS: ActivityFilters = { category: '', q: '', userId: '', from: '', to: '' };

const inputStyle = {
  background: PAGE_BG,
  color: TEXT_PRIMARY,
  border: `1px solid ${softText(0.18)}`,
  borderRadius: 6,
  padding: '6px 10px',
  fontSize: 12,
};

export default function ActivityTab({
  activity,
  activityHasMore,
  activityLoading,
  loadMoreActivity,
  teamNameById,
  team,
  filters,
  onFiltersChange,
}: {
  activity: ActivityItem[];
  activityHasMore: boolean;
  activityLoading: boolean;
  loadMoreActivity: () => void;
  teamNameById: Record<number, string>;
  team: TeamMember[];
  filters: ActivityFilters;
  onFiltersChange: (next: ActivityFilters) => void;
}) {
  const rows = Array.isArray(activity) ? activity : [];
  const anyFilter = useMemo(
    () => Object.values(filters).some(v => v !== ''),
    [filters],
  );

  const set = (patch: Partial<ActivityFilters>) => onFiltersChange({ ...filters, ...patch });

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <h2 className="font-montserrat font-semibold flex items-center gap-2" style={{ fontSize: 14, color: TEXT_MUTED, letterSpacing: TRACK_WIDE }}>
          <Icon name="frog" size={16} color="currentColor" />Лягушачье болото
        </h2>
      </div>

      {/* Filters. Every one of them is a URL query param on the same
          endpoint, so they combine — a category plus a person plus a range
          is one request, not three passes over a client-side array. */}
      <div className="mb-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {FILTER_CHIPS.map(chip => {
            const active = filters.category === chip.id;
            return (
              <button
                key={chip.id || 'all'}
                onClick={() => set({ category: chip.id })}
                className="font-geist text-xs px-3 py-1.5 rounded-full transition-colors"
                style={{
                  background: active ? chip.color : 'rgba(197, 198, 199, 0.06)',
                  color: active ? PAGE_BG : softText(0.6),
                  fontWeight: active ? 600 : 400,
                }}
              >
                {chip.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={filters.q}
            onChange={e => set({ q: e.target.value })}
            placeholder="Поиск по имени или названию"
            aria-label="Поиск по журналу"
            style={{ ...inputStyle, minWidth: 220, flex: '1 1 220px' }}
          />
          <select
            value={filters.userId}
            onChange={e => set({ userId: e.target.value })}
            aria-label="Сотрудник"
            style={inputStyle}
          >
            <option value="">Все сотрудники</option>
            {team.map(m => (
              <option key={m.id} value={String(m.id)}>{m.name}</option>
            ))}
          </select>
          <label className="font-geist text-xs flex items-center gap-1.5" style={{ color: TEXT_MUTED }}>
            с
            <input type="date" value={filters.from} onChange={e => set({ from: e.target.value })} aria-label="Дата с" style={inputStyle} />
          </label>
          <label className="font-geist text-xs flex items-center gap-1.5" style={{ color: TEXT_MUTED }}>
            по
            <input type="date" value={filters.to} onChange={e => set({ to: e.target.value })} aria-label="Дата по" style={inputStyle} />
          </label>
          {anyFilter && (
            <button
              onClick={() => onFiltersChange(EMPTY_ACTIVITY_FILTERS)}
              className="font-geist text-xs px-3 py-1.5 rounded-full"
              style={{ background: ACCENT_DIM, color: ACCENT }}
            >
              Сбросить
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {rows.length === 0 ? (
          <div className="card text-center py-8">
            {/* Two different empty states: a log with nothing in it and a
                filter that matched nothing are the same screen otherwise,
                and only one of them is fixed by changing the filter. */}
            <p className="font-geist text-sm" style={{ color: TEXT_MUTED }}>
              {activityLoading ? 'Загрузка…' : anyFilter ? 'Под фильтры ничего не подошло' : 'Нет активности'}
            </p>
            {anyFilter && !activityLoading && (
              <button onClick={() => onFiltersChange(EMPTY_ACTIVITY_FILTERS)} className="btn-secondary text-xs px-4 py-2 mt-3">
                Сбросить фильтры
              </button>
            )}
          </div>
        ) : (
          rows.map(item => {
            const category = CATEGORY_STYLE[item.category || ''];
            return (
              <div
                key={item.id}
                className="p-3 rounded-lg flex items-start justify-between gap-4"
                style={{
                  background: CARD_BG,
                  // A failed lecture and a locked account both deserve to
                  // read as red regardless of which category they belong
                  // to — the category colour is the default, not the rule.
                  borderLeft: `3px solid ${
                    item.action === 'failed_lecture' || item.action === 'account_locked' || item.action === 'login_failed'
                      ? ERROR
                      : category?.color || softText(0.25)
                  }`,
                }}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-geist font-semibold text-sm break-words" style={{ color: TEXT_PRIMARY }}>{item.name}</p>
                  <p className="font-geist text-xs break-words" style={{ color: TEXT_MUTED }}>
                    {formatActivityAction(item.action, { lectureTitle: item.lecture_title, courseTitle: item.course_title, nameById: teamNameById, gender: item.gender })}
                  </p>
                </div>
                <p className="font-geist text-xs shrink-0" style={{ color: TEXT_MUTED }}>
                  {parseServerDate(item.created_at).toLocaleString('ru-RU', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            );
          })
        )}
      </div>
      {activityHasMore && (
        <div className="text-center mt-4">
          <button onClick={loadMoreActivity} disabled={activityLoading} className="btn-secondary text-xs px-4 py-2 disabled:opacity-50">
            {activityLoading ? '...' : 'Показать ещё'}
          </button>
        </div>
      )}
    </div>
  );
}
