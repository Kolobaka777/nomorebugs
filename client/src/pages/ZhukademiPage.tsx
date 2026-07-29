import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navigation from '../components/Navigation';
import BugSprite from '../components/BugSprite';
import SnailLoader from '../components/SnailLoader';
import { testerApi } from '../api';
import { Lecture } from '../types';
import PixelIcon from '../components/PixelIcon';
import { API_BASE_URL as API_BASE } from '../config';
import { authFetch } from '../auth';
import { clickableProps } from '../utils/a11y';

function isNew(createdAt: string): boolean {
  return Date.now() - new Date(createdAt).getTime() < 7 * 24 * 60 * 60 * 1000;
}

interface ZhukademiPageProps {
  user: any;
  onLogout: () => void;
}

const SKILL_COLORS: Record<string, string> = {
  HTML: '#1D9E75',
  CSS: '#7F77DD',
  DevTools: '#EF9F27',
  Browser: '#EF9F27',
  Responsive: '#7F77DD',
  Network: '#1D9E75',
  JavaScript: '#EF9F27',
  Bug: '#1D9E75',
  Advanced: '#e05252',
};

function getSkillColor(area: string): string {
  for (const key of Object.keys(SKILL_COLORS)) {
    if (area.includes(key)) return SKILL_COLORS[key];
  }
  return '#e8e8d0';
}

// Topic tags from skill_area
function getTopicTag(area: string): string {
  if (area.includes('HTML')) return 'HTML';
  if (area.includes('CSS')) return 'CSS';
  if (area.includes('DevTools')) return 'DevTools';
  if (area.includes('Console')) return 'Console';
  if (area.includes('Bug')) return 'Bug Reports';
  if (area.includes('JavaScript')) return 'JS';
  if (area.includes('Network')) return 'Network';
  return 'AIO';
}

// Pixel art cover art — simple SVG based on index
function CourseCover({ idx, color }: { idx: number; color: string }) {
  const patterns = [
    // HTML tags
    () => (
      <g>
        <rect x="8" y="10" width="16" height="12" fill={`${color}30`} />
        <rect x="10" y="12" width="12" height="2" fill={color} />
        <rect x="10" y="16" width="8" height="2" fill={color} />
        <rect x="28" y="10" width="16" height="12" fill={`${color}30`} />
        <rect x="30" y="12" width="12" height="2" fill={color} />
        <rect x="30" y="16" width="8" height="2" fill={color} />
        <text x="24" y="22" textAnchor="middle" fill={color} fontSize="6" fontFamily="monospace">{'< >'}</text>
      </g>
    ),
    // CSS brackets
    () => (
      <g>
        <rect x="16" y="8" width="20" height="16" fill={`${color}20`} />
        <rect x="18" y="10" width="4" height="12" fill={color} />
        <rect x="34" y="10" width="4" height="12" fill={color} />
        <rect x="22" y="14" width="12" height="2" fill={color} />
        <rect x="22" y="18" width="8" height="2" fill={color} />
      </g>
    ),
    // Magnifier (DevTools)
    () => (
      <g>
        <rect x="16" y="8" width="16" height="16" fill="none" stroke={color} strokeWidth="2" />
        <rect x="12" y="8" width="4" height="16" fill={`${color}30`} />
        <rect x="32" y="8" width="4" height="16" fill={`${color}30`} />
        <rect x="12" y="4" width="28" height="4" fill={`${color}30`} />
        <rect x="12" y="24" width="28" height="4" fill={`${color}30`} />
        <rect x="20" y="14" width="12" height="2" fill={color} />
        <rect x="22" y="12" width="8" height="2" fill={color} />
        <rect x="22" y="16" width="8" height="2" fill={color} />
      </g>
    ),
  ];

  const PatternFn = patterns[idx % patterns.length];

  return (
    <svg width="100%" height="80" viewBox="0 0 52 32" style={{ imageRendering: 'pixelated' }}>
      <rect width="52" height="32" fill={`${color}08`} />
      <PatternFn />
    </svg>
  );
}

type StatusFilter = 'all' | 'active' | 'locked' | 'passed';

export default function ZhukademiPage({ user, onLogout }: ZhukademiPageProps) {
  const navigate = useNavigate();
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [loading, setLoading] = useState(true);
  const [customCourses, setCustomCourses] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  useEffect(() => {
    // Fetch custom courses for all roles
    authFetch(`${API_BASE}/custom-courses`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setCustomCourses(data); })
      .catch(() => {});

    if (user.role === 'tester') {
      testerApi.getLectures()
        .then(r => setLectures(r.data))
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: '#0f0f1a' }}>
        <Navigation user={user} onLogout={onLogout} />
        <SnailLoader />
      </div>
    );
  }

  // Team completion count (hardcoded simulation for now — leads can't see individual lecture data)
  const teamCompleted = [3, 4, 2, 1, 4, 3, 2, 1, 1, 0];

  // Filters apply across both the seeded-lecture catalog and custom courses,
  // matched by title search + a shared tag vocabulary (topic tag for
  // lectures, the course's own `tag` field for custom courses). Status
  // filtering only makes sense for lectures — custom courses don't have a
  // per-user aggregate status from this endpoint.
  const availableTags = Array.from(new Set([
    ...lectures.map(l => getTopicTag(l.skill_area)),
    ...customCourses.map((cc: any) => cc.tag || 'Custom'),
  ]));

  const matchesSearch = (title: string) => !search.trim() || title.toLowerCase().includes(search.trim().toLowerCase());

  const filteredLectures = lectures.filter(l =>
    matchesSearch(l.title) &&
    (!tagFilter || getTopicTag(l.skill_area) === tagFilter) &&
    (statusFilter === 'all' || l.status === statusFilter)
  );
  const filteredCustomCourses = customCourses.filter((cc: any) =>
    matchesSearch(cc.title) &&
    (!tagFilter || (cc.tag || 'Custom') === tagFilter)
  );
  const hasActiveFilters = search.trim() !== '' || tagFilter !== null || statusFilter !== 'all';
  const noResultsAtAll = hasActiveFilters && filteredLectures.length === 0 && filteredCustomCourses.length === 0
    && (lectures.length > 0 || customCourses.length > 0);

  return (
    <div className="min-h-screen" style={{ background: '#0f0f1a' }}>
      <Navigation user={user} onLogout={onLogout} />

      <div className="max-w-7xl mx-auto px-6 pt-16 pb-8 fade-in">
        {/* ===== HEADER ===== */}
        <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
          <div>
            <h1
              className="font-pixel text-primary mb-2"
              style={{ fontSize: '0.8rem', lineHeight: 1.8 }}
            >
              <span className="flex items-center gap-2"><PixelIcon name="graduation" size={14} color="#1D9E75" /> Курсы</span>
            </h1>
            <p className="text-pixel/60 text-sm font-sans">
              Каталог курсов · {(lectures.length > 0 ? lectures.length : 10) + customCourses.length} модулей
            </p>
          </div>

          {user.role === 'lead' && (
            <button
              onClick={() => navigate('/lead/course-builder')}
              className="btn-primary flex items-center gap-2 px-5 py-2.5 font-bold text-sm"
            >
              <PixelIcon name="sparkle" size={13} color="currentColor" /> Создать курс
            </button>
          )}
        </div>

        {/* ===== FILTERS ===== */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="relative" style={{ minWidth: '220px' }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Поиск по названию..."
              aria-label="Поиск курсов по названию"
              className="w-full rounded pl-9 pr-3 py-2 font-sans text-sm"
              style={{ background: '#1a1a2e', color: '#e8e8d0', border: '1px solid rgba(232,232,208,0.1)' }}
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
              <PixelIcon name="search" size={12} color="rgba(232,232,208,0.35)" />
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setTagFilter(null)}
              className="text-xs font-sans font-semibold px-2.5 py-1 rounded transition-colors"
              style={{
                background: tagFilter === null ? '#1D9E75' : 'rgba(232,232,208,0.06)',
                color: tagFilter === null ? '#0f0f1a' : 'rgba(232,232,208,0.5)',
              }}
            >
              Все темы
            </button>
            {availableTags.map(tag => (
              <button
                key={tag}
                onClick={() => setTagFilter(t => t === tag ? null : tag)}
                className="text-xs font-sans font-semibold px-2.5 py-1 rounded transition-colors"
                style={{
                  background: tagFilter === tag ? getSkillColor(tag) : 'rgba(232,232,208,0.06)',
                  color: tagFilter === tag ? '#0f0f1a' : 'rgba(232,232,208,0.5)',
                }}
              >
                {tag}
              </button>
            ))}
          </div>

          {user.role === 'tester' && lectures.length > 0 && (
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as StatusFilter)}
              aria-label="Фильтр по статусу лекции"
              className="rounded px-2.5 py-2 font-sans text-xs outline-none"
              style={{ background: '#1a1a2e', color: '#e8e8d0', border: '1px solid rgba(232,232,208,0.1)' }}
            >
              <option value="all">Любой статус</option>
              <option value="active">Доступные</option>
              <option value="locked">Закрытые</option>
              <option value="passed">Пройденные</option>
            </select>
          )}
        </div>

        {/* ===== COURSE GRID ===== */}
        {lectures.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filteredLectures.map((lecture) => {
              const idx = lectures.indexOf(lecture); // original position, so the placeholder team-completion array still lines up after filtering
              const color = getSkillColor(lecture.skill_area);
              const tag = getTopicTag(lecture.skill_area);
              const isPassed = lecture.status === 'passed';
              const isActive = lecture.status === 'active';
              const isLocked = lecture.status === 'locked';
              const teamCount = teamCompleted[idx] || 0;

              return (
                <div
                  key={lecture.id}
                  onClick={() => (isActive || isPassed) && navigate(`/lecture/${lecture.id}/quiz`)}
                  {...((isActive || isPassed) ? clickableProps(() => navigate(`/lecture/${lecture.id}/quiz`)) : {})}
                  className={`overflow-hidden transition-all ${(isActive || isPassed) ? 'cursor-pointer hover:-translate-y-1' : ''}`}
                  style={{
                    background: '#1a1a2e',
                    borderTop:    '2px solid rgba(255,255,255,0.12)',
                    borderLeft:   '2px solid rgba(255,255,255,0.12)',
                    borderBottom: '2px solid rgba(0,0,0,0.5)',
                    borderRight:  '2px solid rgba(0,0,0,0.5)',
                    outline: isPassed
                      ? `2px solid ${color}55`
                      : isActive
                      ? '2px solid rgba(239,159,39,0.55)'
                      : '2px solid rgba(232,232,208,0.06)',
                    outlineOffset: '-4px',
                    opacity: isLocked ? 0.55 : 1,
                  }}
                >
                  {/* Cover */}
                  <div className="relative">
                    <CourseCover idx={idx} color={color} />
                    {isLocked && (
                      <div
                        className="absolute inset-0 flex items-center justify-center"
                        style={{ background: 'rgba(15,15,26,0.6)' }}
                      >
                        <PixelIcon name="lock" size={24} color="rgba(232,232,208,0.4)" />
                      </div>
                    )}
                    {isPassed && (
                      <div
                        className="absolute top-2 right-2 text-xs font-sans font-bold px-2 py-0.5 rounded"
                        style={{ background: color, color: '#0f0f1a' }}
                      >
                        ✓
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="p-4">
                    {/* Tags */}
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span
                        className="text-xs font-sans font-semibold px-2 py-0.5 rounded"
                        style={{ background: `${color}20`, color }}
                      >
                        {tag}
                      </span>
                    </div>

                    {/* Title */}
                    <h3 className="text-pixel font-sans font-semibold text-sm leading-snug mb-3">
                      {lecture.title}
                    </h3>

                    {/* Progress bar (if started) */}
                    {isPassed && (
                      <div className="mb-3">
                        <div className="xp-bar-track" style={{ height: '6px' }}>
                          <div
                            className="xp-bar-fill"
                            style={{ width: `${lecture.score || 0}%`, height: '6px' }}
                          />
                        </div>
                        <p className="text-pixel/60 text-xs font-sans mt-1">{lecture.score}%</p>
                      </div>
                    )}

                    {/* Footer */}
                    <div
                      className="flex items-center justify-between pt-3"
                      style={{ borderTop: '1px solid rgba(232,232,208,0.06)' }}
                    >
                      <span className="text-pixel/55 text-xs font-sans">
                        👥 {teamCount}/{4} прошли
                      </span>
                      <div>
                        {isPassed && <span className="badge-passed">сдан</span>}
                        {isActive && <span className="badge-active">→ начать</span>}
                        {isLocked && <span className="badge-locked">закрыт</span>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Lead / no data view */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {[
              { title: 'Основы HTML', area: 'HTML', order: 1 },
              { title: 'Основы CSS', area: 'CSS', order: 2 },
              { title: 'Основы DevTools', area: 'DevTools', order: 3 },
              { title: 'Консоль и ошибки', area: 'Browser', order: 4 },
              { title: 'Адаптивная верстка', area: 'Responsive', order: 5 },
              { title: 'Отладка CSS', area: 'CSS', order: 6 },
              { title: 'Вкладка Network', area: 'Network', order: 7 },
              { title: 'JavaScript для QA', area: 'JavaScript', order: 8 },
              { title: 'Описание дефектов', area: 'Bug', order: 9 },
              { title: 'Продвинутое тестирование', area: 'Advanced', order: 10 },
            ].map((l, idx) => {
              const color = getSkillColor(l.area);
              return (
                <div
                  key={idx}
                  className="overflow-hidden"
                  style={{
                    background: '#1a1a2e',
                    borderTop:    '2px solid rgba(255,255,255,0.12)',
                    borderLeft:   '2px solid rgba(255,255,255,0.12)',
                    borderBottom: '2px solid rgba(0,0,0,0.5)',
                    borderRight:  '2px solid rgba(0,0,0,0.5)',
                    outline: `2px solid ${color}30`,
                    outlineOffset: '-4px',
                  }}
                >
                  <CourseCover idx={idx} color={color} />
                  <div className="p-4">
                    <span
                      className="text-xs font-sans font-semibold px-2 py-0.5 rounded mb-2 inline-block"
                      style={{ background: `${color}20`, color }}
                    >
                      {getTopicTag(l.area)}
                    </span>
                    <h3 className="text-pixel font-sans font-semibold text-sm leading-snug mb-2">{l.title}</h3>
                    <p className="text-pixel/60 text-xs font-sans">5 вопросов</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ===== CUSTOM COURSES ===== */}
        {customCourses.length > 0 && filteredCustomCourses.length > 0 && (
          <div className="mt-12">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2
                  className="font-pixel text-pixel mb-1"
                  style={{ fontSize: '0.65rem', lineHeight: 1.8 }}
                >
                  <span className="flex items-center gap-2"><PixelIcon name="pin" size={12} color="currentColor" /> Дополнительные курсы</span>
                </h2>
                <p className="text-pixel/60 text-xs font-sans">Созданы лидом команды</p>
              </div>
              {user.role === 'lead' && (
                <button
                  onClick={() => navigate('/lead/course-builder')}
                  className="btn-secondary text-xs px-3 py-1.5"
                >
                  + Создать ещё
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {filteredCustomCourses.map((cc: any) => {
                const color = cc.color || '#1D9E75';
                const courseIsNew = isNew(cc.created_at);
                const isDraft = !cc.is_published;
                const isLead = user.role === 'lead';

                return (
                  <div
                    key={cc.id}
                    onClick={() => navigate(`/custom-course/${cc.id}`)}
                    {...clickableProps(() => navigate(`/custom-course/${cc.id}`))}
                    className="overflow-hidden cursor-pointer transition-all hover:-translate-y-1"
                    style={{
                      background: '#1a1a2e',
                      borderTop:    '2px solid rgba(255,255,255,0.12)',
                      borderLeft:   '2px solid rgba(255,255,255,0.12)',
                      borderBottom: '2px solid rgba(0,0,0,0.5)',
                      borderRight:  '2px solid rgba(0,0,0,0.5)',
                      outline: `2px solid ${color}50`,
                      outlineOffset: '-4px',
                      opacity: isDraft && !isLead ? 0 : 1,
                      pointerEvents: isDraft && !isLead ? 'none' : 'auto',
                    }}
                  >
                    {/* Cover */}
                    <div
                      className="h-16 flex items-center justify-center text-2xl relative"
                      style={{ background: `${color}12` }}
                    >
                      <PixelIcon name="books" size={28} color={color} />
                      {isDraft && (
                        <div
                          className="absolute top-2 left-2 text-xs font-sans px-1.5 py-0.5 rounded"
                          style={{ background: 'rgba(232,232,208,0.1)', color: 'rgba(232,232,208,0.6)' }}
                        >
                          черновик
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="p-4">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span
                          className="text-xs font-sans font-semibold px-2 py-0.5 rounded"
                          style={{ background: `${color}20`, color }}
                        >
                          {cc.tag || 'Custom'}
                        </span>
                        {courseIsNew && (
                          <span
                            className="text-xs font-sans font-bold px-2 py-0.5 rounded"
                            style={{ background: '#EF9F27', color: '#0f0f1a' }}
                          >
                            NEW
                          </span>
                        )}
                      </div>
                      <h3 className="text-pixel font-sans font-semibold text-sm leading-snug mb-3">
                        {cc.title}
                      </h3>
                      <div
                        className="flex items-center justify-between pt-3"
                        style={{ borderTop: '1px solid rgba(232,232,208,0.06)' }}
                      >
                        <span className="text-pixel/55 text-xs font-sans truncate">
                          <span className="flex items-center gap-1"><PixelIcon name="pencil" size={10} color="currentColor" />{cc.author_name}</span>
                        </span>
                        {isLead && (
                          <button
                            onClick={e => { e.stopPropagation(); navigate(`/lead/course-builder/${cc.id}`); }}
                            aria-label="Редактировать курс"
                            className="btn-secondary text-xs px-2 py-0.5 flex-shrink-0 ml-2"
                          >
                            <PixelIcon name="pencil" size={12} color="currentColor" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* No results for the current filters */}
        {noResultsAtAll && (
          <div className="mt-8 rounded-lg p-8 text-center" style={{ background: '#1a1a2e', border: '1px dashed rgba(232,232,208,0.1)' }}>
            <PixelIcon name="search" size={22} color="rgba(232,232,208,0.3)" className="mb-3" />
            <p className="text-pixel/60 font-sans text-sm mb-3">Ничего не найдено по текущим фильтрам</p>
            <button
              onClick={() => { setSearch(''); setTagFilter(null); setStatusFilter('all'); }}
              className="btn-secondary text-xs px-4 py-2"
            >
              Сбросить фильтры
            </button>
          </div>
        )}

        {/* Lead empty state */}
        {user.role === 'lead' && customCourses.length === 0 && (
          <div
            className="mt-12 rounded-lg p-8 text-center"
            style={{ background: '#1a1a2e', border: '1px dashed rgba(232,232,208,0.1)' }}
          >
            <p className="text-pixel/60 font-sans text-sm mb-4">Вы ещё не создали ни одного курса</p>
            <button
              onClick={() => navigate('/lead/course-builder')}
              className="btn-primary px-6 py-2.5 font-bold text-sm"
            >
              <span className="flex items-center gap-2"><PixelIcon name="sparkle" size={13} color="currentColor" />Создать первый курс</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
