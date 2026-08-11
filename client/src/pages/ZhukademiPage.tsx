import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navigation from '../components/Navigation';
import SnailLoader from '../components/SnailLoader';
import FrogIcon from '../components/FrogIcon';
import Icon from '../components/Icon';
import { testerApi, leadApi } from '../api';
import { Lecture } from '../types';
import { API_BASE_URL as API_BASE } from '../config';
import { authFetch } from '../auth';
import { clickableProps } from '../utils/a11y';
import { parseServerDate } from '../utils/date';
import { showApiError } from '../utils/toast';
import { getTopicTag, getCourseTagColor } from '../utils/topics';
import { BookOpenIcon, SearchIcon, LockIcon, CheckCircleIcon, PlusIcon, PencilLineIcon } from '../components/CatalogIcons';
import {
  PAGE_GRADIENT, PAGE_BG, CARD_BG, TEXT_PRIMARY, TEXT_MUTED, ACCENT, SECONDARY, TRACK_WIDE,
} from '../utils/theme';

// A course is "NEW" while it's recent AND this user hasn't opened it yet —
// the badge disappears the moment they view it (per-user, via the
// custom_course_views table), not on a fixed timer alone.
function isNew(createdAt: string, viewed: boolean): boolean {
  if (viewed) return false;
  return Date.now() - parseServerDate(createdAt).getTime() < 7 * 24 * 60 * 60 * 1000;
}

const NEW_BADGE_COLOR = '#4ADE80';

function deadlineChip(deadline: string | null | undefined): { label: string; color: string } | null {
  if (!deadline) return null;
  const diffDays = Math.ceil((parseServerDate(deadline).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (diffDays < 0) return { label: 'Дедлайн прошёл', color: '#e05252' };
  if (diffDays <= 3) return { label: `Дедлайн через ${diffDays} дн.`, color: '#EF9F27' };
  return { label: `До ${parseServerDate(deadline).toLocaleDateString('ru-RU')}`, color: 'rgba(197, 198, 199,0.5)' };
}

interface ZhukademiPageProps {
  user: any;
  onLogout: () => void;
}

type StatusFilter = 'all' | 'active' | 'locked' | 'passed';

// Shared card shell for both the seeded-lecture catalog and lead-authored
// custom courses — same border/radius/type treatment either way so the two
// sections read as one design language, not two.
function CourseCard({
  modulesLabel, tag, tagColor, title, isNew: showNew, isDraft, pendingReview, isLocked, isPassed, ctaLabel, ctaColor,
  statsLabel, onClick, clickable, editHref, onEdit,
}: {
  modulesLabel: string;
  tag: string;
  tagColor: string;
  title: string;
  isNew?: boolean;
  isDraft?: boolean;
  // A tester's proposal awaiting lead review — distinct from isDraft (a
  // lead's own work-in-progress): different badge color/label so the two
  // unpublished states don't read as the same thing.
  pendingReview?: boolean;
  isLocked?: boolean;
  isPassed?: boolean;
  ctaLabel: string;
  ctaColor: string;
  statsLabel?: string;
  onClick?: () => void;
  clickable?: boolean;
  editHref?: string;
  onEdit?: () => void;
}) {
  const navigate = useNavigate();
  return (
    <div
      onClick={onClick}
      {...(clickable && onClick ? clickableProps(onClick) : {})}
      className={`relative rounded-lg transition-all h-full ${clickable ? 'cursor-pointer hover:-translate-y-1' : ''}`}
      style={{
        background: CARD_BG,
        border: `1.5px solid ${isLocked ? 'rgba(197, 198, 199, 0.18)' : `${tagColor}70`}`,
        boxShadow: '0 6px 12px 0 rgba(0, 0, 0, 0.25)',
        opacity: isLocked ? 0.6 : 1,
      }}
    >
      {showNew && (
        <span
          className="absolute -top-2.5 right-3 font-geist font-bold rounded px-2 py-0.5"
          style={{ background: NEW_BADGE_COLOR, color: PAGE_BG, fontSize: 10, letterSpacing: TRACK_WIDE }}
        >
          NEW
        </span>
      )}
      {editHref !== undefined && onEdit && (
        <button
          onClick={e => { e.stopPropagation(); onEdit(); }}
          aria-label="Редактировать курс"
          className="absolute -top-2.5 left-3 flex items-center justify-center rounded cursor-pointer"
          style={{ width: 20, height: 20, background: CARD_BG, border: `1px solid ${SECONDARY}` }}
        >
          <PencilLineIcon size={12} color={SECONDARY} />
        </button>
      )}

      {/* flex-col + h-full so every card in the grid fills its row (Grid's
          default align-items:stretch already equalizes height *within* a
          row) and the title is clamped to a fixed two-line box regardless
          of how long it actually is — that's what makes cards uniform
          *across* rows too, not just row-by-row: a one-line title reserves
          the same space a two-line one would need, so the grid's tallest
          card no longer varies row to row. mt-auto pins the footer to the
          bottom instead of it drifting up under a short title. */}
      <div className="p-4 h-full flex flex-col">
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="font-geist" style={{ fontSize: 12, color: TEXT_MUTED, letterSpacing: TRACK_WIDE }}>
            {modulesLabel}
          </span>
          {pendingReview ? (
            <span className="font-geist font-semibold rounded px-2 py-0.5" style={{ fontSize: 11, background: 'rgba(239,159,39,0.15)', color: '#EF9F27' }}>
              На рассмотрении
            </span>
          ) : isDraft ? (
            <span className="font-geist font-semibold rounded px-2 py-0.5" style={{ fontSize: 11, background: 'rgba(197, 198, 199,0.1)', color: 'rgba(197, 198, 199,0.6)' }}>
              Draft
            </span>
          ) : (
            <span
              className="font-geist font-semibold rounded px-2 py-0.5"
              style={{ fontSize: 11, background: `${tagColor}22`, color: tagColor, border: `1px solid ${tagColor}55` }}
            >
              {tag}
            </span>
          )}
        </div>

        <h3 className="font-montserrat font-semibold flex items-start gap-2 mb-4" style={{ fontSize: 15, lineHeight: 1.4, color: TEXT_PRIMARY }}>
          <span className="flex-1 break-words min-w-0" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{title}</span>
          {isLocked && <LockIcon size={16} color="rgba(197, 198, 199,0.4)" className="shrink-0 mt-0.5" />}
        </h3>

        <div className="flex items-center justify-between gap-2 mt-auto">
          <span className="font-geist truncate" style={{ fontSize: 11, color: 'rgba(197, 198, 199,0.55)' }}>
            {statsLabel}
          </span>
          <span
            className="font-geist font-semibold flex items-center gap-1 shrink-0"
            style={{ fontSize: 12, color: isLocked ? 'rgba(197, 198, 199,0.4)' : ctaColor, letterSpacing: TRACK_WIDE }}
          >
            {isPassed && <CheckCircleIcon size={13} color={ctaColor} />}
            {ctaLabel}
            {!isPassed && !isLocked && <Icon name="chevronRight" size={14} color="currentColor" />}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function ZhukademiPage({ user, onLogout }: ZhukademiPageProps) {
  const navigate = useNavigate();
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [loading, setLoading] = useState(true);
  const [customCourses, setCustomCourses] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [draftOnly, setDraftOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [loadError, setLoadError] = useState('');
  // Real per-lecture pass counts, lead/admin only — see loadLectures below.
  const [lectureStatsById, setLectureStatsById] = useState<Record<number, { passedCount: number; totalTesters: number }>>({});

  const loadLectures = () => {
    setLoading(true);
    setLoadError('');
    // Fetch custom courses for all roles — a secondary section on this
    // page, so a failure here just shows a toast rather than blocking the
    // whole catalog.
    authFetch(`${API_BASE}/custom-courses`)
      .then(async r => {
        const data = await r.json().catch(() => null);
        if (!r.ok) throw new Error(data?.error || 'Не удалось загрузить дополнительные курсы');
        if (Array.isArray(data)) setCustomCourses(data);
      })
      .catch((err: any) => showApiError(err, 'Не удалось загрузить дополнительные курсы'));

    // Fetched for every role, not just testers — leads/admins get a
    // read-only preview of the same catalog instead of a dead placeholder
    // grid. Per-user status (active/locked/passed) only makes sense for
    // testers, since only testers take quizzes — see isTester below.
    // This IS the page's main content, so a failure gets its own retryable
    // error state instead of an empty catalog that looks like "no courses".
    testerApi.getLectures()
      .then(r => setLectures(r.data))
      .catch((err: any) => setLoadError(err.response?.data?.error || 'Не удалось загрузить курсы'))
      .finally(() => setLoading(false));

    // Real "X/Y team members passed this" — replaces what used to be a
    // hardcoded, made-up array shown to every role regardless of whether it
    // meant anything. Lead/admin-only endpoint, so only fetched for them;
    // a failure here just means the count doesn't show, not a page error.
    if (user.role === 'lead' || user.role === 'admin') {
      leadApi.getLectureStats().then(r => {
        const byId: Record<number, { passedCount: number; totalTesters: number }> = {};
        for (const s of r.data) byId[s.id] = { passedCount: s.passedCount, totalTesters: s.totalTesters };
        setLectureStatsById(byId);
      }).catch(() => {});
    }
  };

  useEffect(() => { loadLectures(); }, []);

  // Filters apply across both the seeded-lecture catalog and custom courses,
  // matched by title search + a shared tag vocabulary (topic tag for
  // lectures, the course's own `tag` field for custom courses). Status
  // filtering only makes sense for lectures — custom courses don't have a
  // per-user aggregate status from this endpoint.
  const matchesSearch = (title: string) => !search.trim() || title.toLowerCase().includes(search.trim().toLowerCase());

  // Hooks must run unconditionally, so these stay above the loading/error
  // early returns below even though their output is only used past them.
  const filteredLectures = useMemo(() => lectures.filter(l =>
    matchesSearch(l.title) &&
    (!tagFilter || getTopicTag(l.skill_area) === tagFilter) &&
    (statusFilter === 'all' || l.status === statusFilter) &&
    !draftOnly
  ), [lectures, search, tagFilter, statusFilter, draftOnly]);
  const filteredCustomCourses = useMemo(() => customCourses.filter((cc: any) =>
    matchesSearch(cc.title) &&
    (!tagFilter || (cc.tag || 'Custom') === tagFilter) &&
    (!draftOnly || !cc.is_published)
  ), [customCourses, search, tagFilter, draftOnly]);

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: PAGE_GRADIENT }}>
        <Navigation user={user} onLogout={onLogout} />
        <SnailLoader />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen" style={{ background: PAGE_GRADIENT }}>
        <Navigation user={user} onLogout={onLogout} />
        <div className="max-w-7xl mx-auto px-8 pt-16 pb-8">
          <div className="rounded-lg p-10 text-center" style={{ background: CARD_BG, boxShadow: '0 6px 12px 0 rgba(0, 0, 0, 0.25)' }}>
            <p className="font-geist text-sm mb-4 break-words" style={{ color: '#e05252' }}>{loadError}</p>
            <button onClick={loadLectures} className="btn-secondary text-xs px-4 py-2">Повторить</button>
          </div>
        </div>
      </div>
    );
  }

  const availableTags = Array.from(new Set([
    ...lectures.map(l => getTopicTag(l.skill_area)),
    ...customCourses.map((cc: any) => cc.tag || 'Custom'),
  ]));

  const hasActiveFilters = search.trim() !== '' || tagFilter !== null || statusFilter !== 'all' || draftOnly;
  const noResultsAtAll = hasActiveFilters && filteredLectures.length === 0 && filteredCustomCourses.length === 0
    && (lectures.length > 0 || customCourses.length > 0);
  // Genuinely nothing exists yet (no filters involved) — distinct from both
  // the error state above and "no results for these filters" below, so it
  // doesn't get mistaken for either.
  const nothingExistsYet = !hasActiveFilters && lectures.length === 0 && customCourses.length === 0;

  return (
    <div className="min-h-screen" style={{ background: PAGE_GRADIENT }}>
      <Navigation user={user} onLogout={onLogout} />

      <div className="max-w-7xl mx-auto px-8 pt-16 pb-16 fade-in">
        {/* ===== HEADER ===== */}
        <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
          <div>
            <h1 className="font-montserrat font-bold flex items-center gap-3" style={{ fontSize: 28, color: TEXT_PRIMARY, letterSpacing: TRACK_WIDE }}>
              <BookOpenIcon size={26} color={ACCENT} />
              КУРСЫ
            </h1>
            <p className="font-geist mt-1" style={{ fontSize: 14, color: TEXT_MUTED }}>
              Каталог курсов
            </p>
          </div>

          {user.role === 'lead' ? (
            <button
              onClick={() => navigate('/lead/course-builder')}
              className="rounded-lg font-geist font-semibold flex items-center gap-2 px-5 py-2.5 cursor-pointer transition-transform hover:-translate-y-0.5"
              style={{ background: ACCENT, color: PAGE_BG, fontSize: 14 }}
            >
              <PlusIcon size={16} color={PAGE_BG} /> Создать курс
            </button>
          ) : (
            // Any other role can propose one instead of creating it
            // outright — the button looks the same as the lead's, just
            // worded as a suggestion; the server enforces the actual gate
            // (see POST /api/custom-courses) regardless of who clicks it.
            <button
              onClick={() => navigate('/propose-course')}
              className="rounded-lg font-geist font-semibold flex items-center gap-2 px-5 py-2.5 cursor-pointer transition-transform hover:-translate-y-0.5"
              style={{ background: `${ACCENT}18`, color: ACCENT, border: `1px solid ${ACCENT}55`, fontSize: 14 }}
            >
              <Icon name="lightbulb" size={16} color={ACCENT} /> Предложить курс
            </button>
          )}
        </div>

        {/* ===== SEARCH + FILTERS ===== */}
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <div className="flex items-center gap-3">
            <FrogIcon size={44} />
            {/* Single rounded-full pill with the search glyph inside it
                (right-aligned, muted teal) instead of a two-part input +
                solid-fill button — matches the mockup. */}
            <div className="relative" style={{ minWidth: 260 }}>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Поищи курс"
                aria-label="Поиск курсов по названию"
                className="font-geist text-sm w-full"
                style={{ background: CARD_BG, color: TEXT_PRIMARY, border: '1px solid rgba(197, 198, 199,0.15)', borderRadius: 9999, height: 44, padding: '0 44px 0 20px' }}
              />
              <span
                className="absolute flex items-center"
                style={{ right: 16, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
              >
                <SearchIcon size={18} color={ACCENT} />
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => { setTagFilter(null); setDraftOnly(false); }}
              className="font-geist font-semibold rounded-full px-3.5 py-1.5 cursor-pointer transition-colors"
              style={{ fontSize: 12, background: tagFilter === null && !draftOnly ? ACCENT : 'rgba(197, 198, 199,0.06)', color: tagFilter === null && !draftOnly ? PAGE_BG : 'rgba(197, 198, 199,0.5)' }}
            >
              Все темы
            </button>
            {availableTags.map(tag => {
              const color = getCourseTagColor(tag);
              const active = tagFilter === tag;
              return (
                <button
                  key={tag}
                  onClick={() => { setTagFilter(t => t === tag ? null : tag); setDraftOnly(false); }}
                  className="font-geist font-semibold rounded-full px-3.5 py-1.5 cursor-pointer transition-all"
                  style={{
                    fontSize: 12,
                    background: active ? color : `${color}20`,
                    color: active ? PAGE_BG : color,
                    border: active ? `1px solid ${color}` : '1px solid transparent',
                    boxShadow: active ? `0 0 0 2px ${color}40` : 'none',
                  }}
                >
                  {tag}
                </button>
              );
            })}
            {user.role === 'lead' && (
              <button
                onClick={() => { setDraftOnly(d => !d); setTagFilter(null); }}
                className="font-geist font-semibold rounded-full px-3.5 py-1.5 cursor-pointer transition-colors"
                style={{ fontSize: 12, background: draftOnly ? 'rgba(197, 198, 199,0.5)' : 'rgba(197, 198, 199,0.06)', color: draftOnly ? PAGE_BG : 'rgba(197, 198, 199,0.5)' }}
              >
                Draft
              </button>
            )}
          </div>

          {user.role === 'tester' && lectures.length > 0 && (
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as StatusFilter)}
              aria-label="Фильтр по статусу лекции"
              className="rounded-lg px-2.5 py-2 font-geist outline-none"
              style={{ fontSize: 12, background: CARD_BG, color: TEXT_PRIMARY, border: '1px solid rgba(197, 198, 199,0.15)' }}
            >
              <option value="all">Любой статус</option>
              <option value="active">Доступные</option>
              <option value="locked">Закрытые</option>
              <option value="passed">Пройденные</option>
            </select>
          )}
        </div>

        {/* ===== COURSE GRID ===== */}
        {lectures.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredLectures.map((lecture) => {
              const tagColor = getCourseTagColor(getTopicTag(lecture.skill_area));
              const isTester = user.role === 'tester';
              const isPassed = isTester && lecture.status === 'passed';
              const isActive = isTester && lecture.status === 'active';
              const isLocked = isTester && lecture.status === 'locked';
              const canOpen = isTester && (isActive || isPassed);
              const stats = lectureStatsById[lecture.id];
              const ctaLabel = isPassed ? 'КУРС ПРОЙДЕН!' : isLocked ? 'КУРС ЗАКРЫТ' : isActive ? 'ПРОДОЛЖИТЬ КУРС' : !isTester ? 'ПРОСМОТР' : 'НАЧАТЬ КУРС';
              const ctaColor = isPassed ? ACCENT : tagColor;

              return (
                <CourseCard
                  key={lecture.id}
                  modulesLabel={isPassed ? `Результат: ${lecture.score ?? 0}%` : 'Итоговый тест'}
                  tag={getTopicTag(lecture.skill_area)}
                  tagColor={tagColor}
                  title={lecture.title}
                  isLocked={isLocked}
                  isPassed={isPassed}
                  ctaLabel={ctaLabel}
                  ctaColor={ctaColor}
                  statsLabel={stats ? `${stats.passedCount}/${stats.totalTesters} прошли` : ''}
                  clickable={canOpen}
                  onClick={() => canOpen && navigate(`/lecture/${lecture.id}/quiz`)}
                />
              );
            })}
          </div>
        )}
        {lectures.length === 0 && !hasActiveFilters && customCourses.length === 0 && (
          <div className="rounded-lg p-8 text-center" style={{ background: CARD_BG, border: '1px dashed rgba(197, 198, 199,0.1)', boxShadow: '0 6px 12px 0 rgba(0, 0, 0, 0.25)' }}>
            <BookOpenIcon size={26} color="rgba(197, 198, 199,0.3)" className="mb-3" />
            <p className="font-geist text-sm" style={{ color: TEXT_MUTED }}>Курсы пока не добавлены</p>
          </div>
        )}

        {/* ===== CUSTOM COURSES ===== */}
        {customCourses.length > 0 && filteredCustomCourses.length > 0 && (
          <div className="mt-12">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="font-montserrat font-semibold" style={{ fontSize: 18, color: TEXT_PRIMARY, letterSpacing: TRACK_WIDE }}>
                  Дополнительные курсы
                </h2>
                <p className="font-geist mt-0.5" style={{ fontSize: 12, color: TEXT_MUTED }}>Созданы лидом команды или предложены тестировщиками</p>
              </div>
              {user.role === 'lead' && (
                <button onClick={() => navigate('/lead/course-builder')} className="btn-secondary text-xs px-3 py-1.5">
                  + Создать ещё
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredCustomCourses.map((cc: any) => {
                const color = cc.color || ACCENT;
                const courseIsNew = isNew(cc.created_at, !!cc.viewed);
                const isDraft = !cc.is_published;
                const isPending = cc.proposal_status === 'pending';
                const isLead = user.role === 'lead';
                const isOwn = cc.created_by === user.id;
                // A lead sees every draft/proposal (their own review queue);
                // anyone else only sees their own — the server already only
                // sends rows they're allowed to see, this just mirrors that
                // instead of flashing someone else's hidden work.
                const hidden = isDraft && !isLead && !isOwn;

                return (
                  <div key={cc.id} className="h-full flex flex-col" style={hidden ? { display: 'none' } : undefined}>
                    <div className="flex-1">
                    <CourseCard
                      modulesLabel="Дополнительный курс"
                      tag={cc.tag || 'Custom'}
                      tagColor={color}
                      title={cc.title}
                      isNew={courseIsNew}
                      isDraft={isDraft}
                      pendingReview={isPending}
                      ctaLabel="ОТКРЫТЬ КУРС"
                      ctaColor={color}
                      statsLabel={isPending ? `Предложил(а): ${cc.author_name}` : cc.completedCount !== undefined ? `${cc.completedCount}/${cc.totalTesters} прошли` : cc.author_name}
                      clickable
                      onClick={() => navigate(`/custom-course/${cc.id}`)}
                      editHref={isLead ? `/lead/course-builder/${cc.id}` : undefined}
                      onEdit={isLead ? () => navigate(`/lead/course-builder/${cc.id}`) : undefined}
                    />
                    </div>
                    {(() => {
                      const chip = deadlineChip(cc.effectiveDeadline);
                      return chip ? (
                        <p className="font-geist text-center mt-1.5" style={{ fontSize: 11, color: chip.color }}>{chip.label}</p>
                      ) : null;
                    })()}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Genuinely nothing yet — not a load failure, not a filter mismatch */}
        {nothingExistsYet && user.role !== 'lead' && (
          <div className="mt-8 rounded-lg p-8 text-center" style={{ background: CARD_BG, border: '1px dashed rgba(197, 198, 199,0.1)', boxShadow: '0 6px 12px 0 rgba(0, 0, 0, 0.25)' }}>
            <p className="font-geist text-sm" style={{ color: TEXT_MUTED }}>Курсов пока нет — загляни попозже.</p>
          </div>
        )}

        {/* No results for the current filters */}
        {noResultsAtAll && (
          <div className="mt-8 rounded-lg p-8 text-center" style={{ background: CARD_BG, border: '1px dashed rgba(197, 198, 199,0.1)', boxShadow: '0 6px 12px 0 rgba(0, 0, 0, 0.25)' }}>
            <SearchIcon size={26} color="rgba(197, 198, 199,0.3)" className="mb-3" />
            <p className="font-geist text-sm mb-3" style={{ color: TEXT_MUTED }}>Ничего не найдено по текущим фильтрам</p>
            <button
              onClick={() => { setSearch(''); setTagFilter(null); setStatusFilter('all'); setDraftOnly(false); }}
              className="btn-secondary text-xs px-4 py-2"
            >
              Сбросить фильтры
            </button>
          </div>
        )}

        {/* Lead empty state */}
        {user.role === 'lead' && customCourses.length === 0 && (
          <div className="mt-12 rounded-lg p-8 text-center" style={{ background: CARD_BG, border: '1px dashed rgba(197, 198, 199,0.1)', boxShadow: '0 6px 12px 0 rgba(0, 0, 0, 0.25)' }}>
            <p className="font-geist text-sm mb-4" style={{ color: TEXT_MUTED }}>Вы ещё не создали ни одного курса</p>
            <button
              onClick={() => navigate('/lead/course-builder')}
              className="rounded-lg font-geist font-semibold px-6 py-2.5 cursor-pointer inline-flex items-center gap-2"
              style={{ background: ACCENT, color: PAGE_BG, fontSize: 14 }}
            >
              <PlusIcon size={16} color={PAGE_BG} />Создать первый курс
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
