import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import Navigation from '../components/Navigation';
import FrogLoader from '../components/FrogLoader';
import FrogPerched from '../components/FrogPerched';
import Icon from '../components/Icon';
import { testerApi, leadApi, coursesApi } from '../api';
import { Lecture } from '../types';
import { clickableProps } from '../utils/a11y';
import { parseServerDate } from '../utils/date';
import { apiErrorMessage, showApiError } from '../utils/toast';
import { getTopicTag, getCourseTagColor, tagChipStyle, tagChipStyleMuted } from '../utils/topics';
import { pickByGender } from '../utils/gender';
import { BookOpenIcon, SearchIcon, LockIcon, CheckCircleIcon, PlusIcon, PencilLineIcon, TrashLineIcon, PeopleIcon } from '../components/CatalogIcons';
import { ACCENT, CARD_BG, CARD_BG_PATTERN, ERROR, PAGE_BG, PAGE_GRADIENT, SECONDARY, SUCCESS, TEXT_MUTED, TEXT_PRIMARY, TRACK_WIDE, H1, H2 } from '../utils/theme';

// A course is "NEW" while it's recent AND this user hasn't opened it yet —
// the badge disappears the moment they view it (per-user, via the
// custom_course_views table), not on a fixed timer alone.
function isNew(createdAt: string, viewed: boolean): boolean {
  if (viewed) return false;
  return Date.now() - parseServerDate(createdAt).getTime() < 7 * 24 * 60 * 60 * 1000;
}

// Per the kit: the badge is the accent teal, not a green of its own, and it
// carries a faint amber glow so it lifts off the card it sits on.
const NEW_BADGE: CSSProperties = {
  color: PAGE_BG,
  fontSize: 14,
  fontWeight: 600,
  letterSpacing: '2.8px',
  borderRadius: 4,
  border: `1px solid ${ACCENT}`,
  background: 'rgba(102, 252, 241, 0.96)',
  boxShadow: '0 0 4px 0 rgba(239, 159, 39, 0.25)',
  padding: '2px 4px',
};

// Every filter reads as a standing chip in its own topic colour — the same
// square-cornered badge shape a card wears for its tag, not the pill the
// page used to draw only once something had been picked.
function filterChipStyle(color: string, active: boolean, tag?: string): CSSProperties {
  return {
    fontSize: 12,
    padding: '4px 9px',
    letterSpacing: '0.08em',
    ...(active ? tagChipStyle(color, tag) : tagChipStyleMuted(color, tag)),
  };
}

function deadlineChip(deadline: string | null | undefined): { label: string; color: string } | null {
  if (!deadline) return null;
  const diffDays = Math.ceil((parseServerDate(deadline).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (diffDays < 0) return { label: 'Дедлайн прошёл', color: ERROR };
  if (diffDays <= 3) return { label: `Дедлайн через ${diffDays} дн.`, color: '#EF9F27' };
  return { label: `До ${parseServerDate(deadline).toLocaleDateString('ru-RU')}`, color: 'rgba(197, 198, 199,0.5)' };
}

interface ZhukademiPageProps {
  user: any;
  onLogout: () => void;
}

type StatusFilter = 'all' | 'active' | 'locked' | 'passed' | 'unpassed';

// Shared card shell for both the seeded-lecture catalog and lead-authored
// custom courses — same border/radius/type treatment either way so the two
// sections read as one design language, not two.
// The states a custom-course card can be in, in one place — the catalog
// renders these cards from two separate grids ("Для новичков" and the main
// one) and a state defined twice is a state that eventually differs.
//
// Only the first two are about the course itself; the rest are about how
// far the reader has got, which the list endpoint now reports.
function courseCardState(cc: any, color: string) {
  if (cc.proposal_status === 'pending') return { ctaLabel: 'НА РАССМОТРЕНИИ', ctaColor: '#EF9F27', isPassed: false, progressPct: undefined };
  if (!cc.is_published) return { ctaLabel: 'ПРОДОЛЖИТЬ РЕДАКТИРОВАНИЕ', ctaColor: color, isPassed: false, progressPct: undefined };

  const total = cc.modulesTotal ?? 0;
  const done = cc.modulesDone ?? 0;
  // Undefined rather than 0 when there is nothing to measure: a bar at zero
  // is a claim about progress, and an empty course makes none. It also
  // keeps the strip from being announced as a progressbar reading 0%.
  const pct = total > 0 ? (done / total) * 100 : undefined;

  if (cc.isCompleted) return { ctaLabel: 'КУРС ПРОЙДЕН!', ctaColor: SUCCESS, isPassed: true, progressPct: 100 };
  // "Started" is judged on lessons, not modules: reading one lesson of a
  // four-lesson module is a course you have started, even though the
  // module count still says nothing is finished.
  if ((cc.lessonsDone ?? 0) > 0) return { ctaLabel: 'ПРОДОЛЖИТЬ КУРС', ctaColor: color, isPassed: false, progressPct: pct };
  return { ctaLabel: 'НАЧАТЬ КУРС', ctaColor: color, isPassed: false, progressPct: pct };
}

// "2/12 модулей" — the label the design puts in the strip that doubles as
// the progress bar. Falls back to the old descriptive text for a course
// with no modules at all, where a count would say nothing.
function modulesLabelFor(cc: any, fallback: string) {
  return (cc.modulesTotal ?? 0) > 0 ? `${cc.modulesDone ?? 0}/${cc.modulesTotal} модулей` : fallback;
}

function CourseCard({
  modulesLabel, tag, tagColor, title, isNew: showNew, isDraft, pendingReview, isLocked, isPassed, ctaLabel, ctaColor,
  statsLabel, onClick, clickable, onEdit, onDelete, teamCount, isFavorited, onToggleFavorite,
  progressPct,
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
  onDelete?: () => void;
  teamCount?: number;
  isFavorited?: boolean;
  onToggleFavorite?: () => void;
  // 0–100. Fills the header strip behind `modulesLabel`, which is where
  // the design puts progress — not a second bar lower down. Absent for
  // cards nobody can take yet (a draft, a proposal awaiting review).
  progressPct?: number;
}) {
  return (
    <div className="relative h-full group">
      {/* Lead-only toolbar, floating above the card's top edge — revealed on
          hover/focus instead of a permanent fixture, so a whole grid of
          editable cards doesn't read as cluttered by default. */}
      {onEdit && (
        <div
          className="absolute -top-7 left-0 right-0 flex items-center justify-between px-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
          onClick={e => e.stopPropagation()}
        >
          {teamCount !== undefined ? (
            <span className="flex items-center gap-1 font-geist text-xs" style={{ color: TEXT_MUTED }}>
              <PeopleIcon size={13} color="currentColor" /> {teamCount}
            </span>
          ) : <span />}
          <span className="flex items-center gap-1.5">
            <button
              onClick={onEdit}
              aria-label="Редактировать курс"
              className="flex items-center justify-center rounded cursor-pointer"
              style={{ width: 22, height: 22, background: CARD_BG, border: `1px solid ${SECONDARY}` }}
            >
              <PencilLineIcon size={12} color={SECONDARY} />
            </button>
            {onDelete && (
              <button
                onClick={onDelete}
                aria-label="Удалить курс"
                className="flex items-center justify-center rounded cursor-pointer"
                style={{ width: 22, height: 22, background: CARD_BG, border: '1px solid rgba(224,82,82,0.5)' }}
              >
                <TrashLineIcon size={12} color={ERROR} />
              </button>
            )}
          </span>
        </div>
      )}
    <div
      onClick={onClick}
      {...(clickable && onClick ? clickableProps(onClick) : {})}
      className={`relative rounded-lg transition-all h-full flex flex-col ${clickable ? 'cursor-pointer hover:brightness-105' : ''}`}
      style={{
        // Same beetle tile the homepage cards sit on, so the catalog reads
        // as the same surface rather than a flat panel next to a textured one.
        background: CARD_BG_PATTERN,
        border: `1.5px solid ${isLocked ? 'rgba(197, 198, 199, 0.18)' : `${tagColor}70`}`,
        boxShadow: '0 6px 12px 0 rgba(0, 0, 0, 0.25)',
        opacity: isLocked ? 0.6 : 1,
      }}
    >
      {showNew && (
        <span
          className="absolute -top-3 right-3 z-10 font-geist"
          style={NEW_BADGE}
        >
          NEW
        </span>
      )}

      {/* The progress bar is the card's header band, edge to edge under the
          top border, exactly as the design has it: the fill runs behind the
          label rather than beside it, so a course's progress is the first
          thing the eye lands on and nothing else competes for that row.
          The radius is the card's own minus its border, so the band's top
          corners sit flush inside them instead of squaring them off. */}
      <div
        className="relative flex items-center shrink-0 overflow-hidden rounded-t-[6px]"
        style={{
          background: 'rgba(197, 198, 199, 0.06)',
          borderBottom: `1px solid ${isLocked ? 'rgba(197, 198, 199, 0.12)' : `${tagColor}40`}`,
        }}
      >
        {progressPct !== undefined && (
          <span
            aria-hidden="true"
            className="absolute inset-y-0 left-0 transition-all"
            style={{ width: `${Math.min(100, Math.max(0, progressPct))}%`, background: `${isPassed ? SUCCESS : tagColor}55` }}
          />
        )}
        <span
          className="relative font-geist px-3 py-1.5"
          style={{ fontSize: 12, color: isLocked ? 'rgba(197, 198, 199,0.4)' : 'rgba(197, 198, 199,0.8)', letterSpacing: TRACK_WIDE }}
          {...(progressPct !== undefined ? {
            role: 'progressbar',
            'aria-valuemin': 0,
            'aria-valuemax': 100,
            'aria-valuenow': Math.round(progressPct),
            'aria-label': `Прогресс курса: ${modulesLabel}`,
          } : {})}
        >
          {modulesLabel}
        </span>
      </div>

      {/* flex-1 + flex-col so every card in the grid fills its row (Grid's
          default align-items:stretch already equalizes height *within* a
          row) and the title is clamped to a fixed two-line box regardless
          of how long it actually is — that's what makes cards uniform
          *across* rows too, not just row-by-row: a one-line title reserves
          the same space a two-line one would need, so the grid's tallest
          card no longer varies row to row. mt-auto pins the footer to the
          bottom instead of it drifting up under a short title. */}
      <div className="p-4 flex-1 flex flex-col">
        {/* Title and its badge share a row, per the design. They used to sit
            in separate rows, which put the badge on top of the progress
            fill — legible enough, but it read as two labels fighting for
            the same strip. */}
        <div className="flex items-start justify-between gap-2 mb-4">
          <h3 className="font-montserrat flex items-start gap-2 min-w-0" style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.3, letterSpacing: '4px', color: TEXT_PRIMARY }}>
            {onToggleFavorite && (
              <button
                onClick={e => { e.stopPropagation(); onToggleFavorite(); }}
                aria-label={isFavorited ? 'Убрать из избранного' : 'Добавить в избранное'}
                className="shrink-0 cursor-pointer flex items-center mt-0.5"
                style={{ color: isFavorited ? '#EF9F27' : 'rgba(197, 198, 199,0.3)' }}
              >
                <Icon name="star" size={15} color="currentColor" />
              </button>
            )}
            <span className="flex-1 break-words min-w-0" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{title}</span>
            {isLocked && <LockIcon size={16} color="rgba(197, 198, 199,0.4)" className="shrink-0 mt-1" />}
          </h3>

          {pendingReview ? (
            <span className="shrink-0 mt-0.5 font-geist font-semibold rounded px-2 py-0.5" style={{ fontSize: 11, background: 'rgba(239,159,39,0.15)', color: '#EF9F27' }}>
              На рассмотрении
            </span>
          ) : isDraft ? (
            <span className="shrink-0 mt-0.5 font-geist font-semibold rounded px-2 py-0.5" style={{ fontSize: 11, background: 'rgba(197, 198, 199,0.1)', color: 'rgba(197, 198, 199,0.6)' }}>
              Draft
            </span>
          ) : (
            <span
              className="shrink-0 mt-0.5 font-geist font-semibold px-2 py-0.5"
              style={{ fontSize: 11, letterSpacing: '0.06em', ...tagChipStyle(tagColor, tag) }}
            >
              {tag}
            </span>
          )}
        </div>

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
            {isLocked && <LockIcon size={13} color="rgba(197, 198, 199,0.4)" />}
            {!isPassed && !isLocked && <Icon name="chevronRight" size={14} color="currentColor" />}
          </span>
        </div>
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
  const [sections, setSections] = useState<{ id: number; name: string }[]>([]);
  const [newSectionName, setNewSectionName] = useState('');
  const [renamingSectionId, setRenamingSectionId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [draftOnly, setDraftOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [loadError, setLoadError] = useState('');
  // Real per-lecture pass counts, lead/admin only — see loadLectures below.
  const [lectureStatsById, setLectureStatsById] = useState<Record<number, { passedCount: number; totalTesters: number }>>({});
  // `${course_type}:${course_id}` keys — a Set is enough here, the catalog
  // card only needs to know "is this one starred", not the full favorite
  // detail (that's what the profile's own Избранное tab renders).
  const [favoriteKeys, setFavoriteKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    testerApi.getFavorites().then(r => setFavoriteKeys(new Set(r.data.map((f: any) => `${f.course_type}:${f.course_id}`))))
      .catch(() => {}); // Non-critical — the star just won't show as filled yet, no toast needed.
  }, []);

  const toggleFavorite = (courseType: 'lecture' | 'custom', courseId: number) => {
    const key = `${courseType}:${courseId}`;
    const wasFavorited = favoriteKeys.has(key);
    setFavoriteKeys(prev => {
      const next = new Set(prev);
      if (wasFavorited) next.delete(key); else next.add(key);
      return next;
    });
    const call = wasFavorited ? testerApi.removeFavorite(courseType, courseId) : testerApi.addFavorite(courseType, courseId);
    call.catch((err: any) => {
      showApiError(err, wasFavorited ? 'Не удалось убрать из избранного' : 'Не удалось добавить в избранное');
      setFavoriteKeys(prev => {
        const next = new Set(prev);
        if (wasFavorited) next.add(key); else next.delete(key);
        return next;
      });
    });
  };

  const loadLectures = () => {
    setLoading(true);
    setLoadError('');
    // Fetch custom courses for all roles — a secondary section on this
    // page, so a failure here just shows a toast rather than blocking the
    // whole catalog.
    coursesApi.list()
      .then(r => { if (Array.isArray(r.data)) setCustomCourses(r.data); })
      .catch((err: any) => showApiError(err, 'Не удалось загрузить дополнительные курсы'));

    // Fetched for every role, not just testers — leads/admins get a
    // read-only preview of the same catalog instead of a dead placeholder
    // grid. Per-user status (active/locked/passed) only makes sense for
    // testers, since only testers take quizzes — see isTester below.
    // This IS the page's main content, so a failure gets its own retryable
    // error state instead of an empty catalog that looks like "no courses".
    testerApi.getLectures()
      .then(r => setLectures(r.data))
      .catch((err: any) => setLoadError(apiErrorMessage(err, 'Не удалось загрузить курсы')))
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

  // Course sections — a public catalog-organization layer (unlike suggestion
  // folders, every role sees these, not just the lead who manages them).
  const loadSections = () => {
    coursesApi.getSections()
      .then(r => { if (Array.isArray(r.data)) setSections(r.data); })
      .catch(() => {});
  };
  useEffect(() => { loadSections(); }, []);

  const createSection = () => {
    const name = newSectionName.trim();
    if (!name) return;
    coursesApi.createSection(name)
      .then(() => { setNewSectionName(''); loadSections(); })
      .catch((err: any) => showApiError(err, 'Не удалось создать раздел'));
  };

  const startRenameSection = (s: { id: number; name: string }) => {
    setRenamingSectionId(s.id);
    setRenameValue(s.name);
  };

  const saveRenameSection = () => {
    const name = renameValue.trim();
    if (!name || renamingSectionId == null) { setRenamingSectionId(null); return; }
    coursesApi.renameSection(renamingSectionId, name)
      .then(() => { setRenamingSectionId(null); loadSections(); loadLectures(); })
      .catch((err: any) => { showApiError(err, 'Не удалось переименовать раздел'); setRenamingSectionId(null); });
  };

  const deleteSection = (id: number) => {
    if (!window.confirm('Удалить раздел? Курсы из него не удалятся — просто станут «Без раздела».')) return;
    coursesApi.removeSection(id)
      .then(() => { loadSections(); loadLectures(); })
      .catch((err: any) => showApiError(err, 'Не удалось удалить раздел'));
  };

  // Quick reassignment from the catalog grid itself — a full PUT is
  // overkill-looking, but the route already treats every field as optional
  // (falls back to the current DB value when omitted), so sending just
  // { section_id } is a safe, minimal update — no risk to the course's
  // modules/lessons since `modules` is never included here.
  const assignSection = (courseId: number, sectionId: number | null) => {
    coursesApi.update(courseId, { section_id: sectionId })
      .then(() => loadLectures())
      .catch((err: any) => showApiError(err, 'Не удалось перенести курс в раздел'));
  };

  // Quick delete straight from the catalog card's hover toolbar — same
  // endpoint/confirm-dialog convention as CustomCourseDetailPage's "Удалить
  // курс" button, just reachable without opening the course first.
  const deleteCourse = (courseId: number, title: string) => {
    if (!window.confirm(`Удалить курс «${title}»? Это действие нельзя отменить.`)) return;
    coursesApi.remove(courseId)
      .then(() => loadLectures())
      .catch((err: any) => showApiError(err, 'Не удалось удалить курс'));
  };

  // Onboarding courses (is_onboarding) get their own permanent "Для
  // новичков" section — always visible regardless of the topic tag filter,
  // and excluded from the regular "Дополнительные курсы" grid/tag
  // vocabulary below so nothing renders twice.
  const onboardingCourses = customCourses.filter((cc: any) => cc.is_onboarding);
  const nonOnboardingCourses = customCourses.filter((cc: any) => !cc.is_onboarding);

  // Filters apply across both the seeded-lecture catalog and custom courses,
  // matched by title search + a shared tag vocabulary (topic tag for
  // lectures, the course's own `tag` field for custom courses).
  //
  // Status now covers courses too: the list endpoint reports how many of a
  // course's lessons this person has finished. "Доступные" and "Закрытые"
  // stay lecture-only ideas — a course is never locked — so picking those
  // leaves the course grids empty on purpose rather than silently ignoring
  // the filter.
  const matchesSearch = (title: string) => !search.trim() || title.toLowerCase().includes(search.trim().toLowerCase());

  // Hooks must run unconditionally, so these stay above the loading/error
  // early returns below even though their output is only used past them.
  const filteredLectures = useMemo(() => lectures.filter(l =>
    matchesSearch(l.title) &&
    (!tagFilter || getTopicTag(l.skill_area) === tagFilter) &&
    (statusFilter === 'all' || (statusFilter === 'unpassed' ? l.status !== 'passed' : l.status === statusFilter)) &&
    !draftOnly
  ), [lectures, search, tagFilter, statusFilter, draftOnly]);
  const matchesStatus = (cc: any) => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'passed') return !!cc.isCompleted;
    if (statusFilter === 'unpassed' || statusFilter === 'active') return !cc.isCompleted;
    return false; // 'locked' — nothing here is ever locked
  };
  const filteredCustomCourses = useMemo(() => nonOnboardingCourses.filter((cc: any) =>
    matchesSearch(cc.title) &&
    (!tagFilter || (cc.tag || 'Custom') === tagFilter) &&
    matchesStatus(cc) &&
    (!draftOnly || !cc.is_published)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [nonOnboardingCourses, search, tagFilter, statusFilter, draftOnly]);
  // No tag filter here — the "Для новичков" section is a permanent fixture,
  // not part of the browse-by-topic grids.
  const filteredOnboardingCourses = useMemo(() => onboardingCourses.filter((cc: any) =>
    matchesSearch(cc.title) && matchesStatus(cc) && (!draftOnly || !cc.is_published)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [onboardingCourses, search, statusFilter, draftOnly]);

  // Group the regular custom-courses grid by section (a public catalog
  // layer, unlike suggestion_folders' lead-private ones — every role sees
  // this grouping). Only shown once at least one section actually exists;
  // otherwise it stays the flat grid it always was. Sections with nothing
  // matching the current filters are simply skipped rather than shown
  // empty; unfiled courses land in a synthetic trailing "Без раздела"
  // group, shown only when there's something in it.
  const courseGroups = useMemo(() => {
    const bySection = new Map<number, any[]>();
    const unfiled: any[] = [];
    for (const cc of filteredCustomCourses) {
      if (cc.section_id) {
        if (!bySection.has(cc.section_id)) bySection.set(cc.section_id, []);
        bySection.get(cc.section_id)!.push(cc);
      } else {
        unfiled.push(cc);
      }
    }
    const groups = sections
      .filter(s => bySection.has(s.id))
      .map(s => ({ id: s.id as number | null, name: s.name, courses: bySection.get(s.id)! }));
    if (unfiled.length > 0) groups.push({ id: null, name: 'Без раздела', courses: unfiled });
    return groups;
  }, [filteredCustomCourses, sections]);

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: PAGE_GRADIENT }}>
        <Navigation user={user} onLogout={onLogout} />
        <FrogLoader />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen" style={{ background: PAGE_GRADIENT }}>
        <Navigation user={user} onLogout={onLogout} />
        <div className="max-w-7xl mx-auto px-8 pt-16 pb-8">
          <div className="rounded-lg p-10 text-center" style={{ background: CARD_BG, boxShadow: '0 6px 12px 0 rgba(0, 0, 0, 0.25)' }}>
            <p className="font-geist text-sm mb-4 break-words" style={{ color: ERROR }}>{loadError}</p>
            <button onClick={loadLectures} className="btn-secondary text-xs px-4 py-2">Повторить</button>
          </div>
        </div>
      </div>
    );
  }

  const availableTags = Array.from(new Set([
    ...lectures.map(l => getTopicTag(l.skill_area)),
    ...nonOnboardingCourses.map((cc: any) => cc.tag || 'Custom'),
  ]));

  // These all deliberately look at the regular catalog only (lectures +
  // non-onboarding custom courses) — the "Для новичков" section is a
  // separate, always-there fixture, not part of "is there anything to
  // browse/search here".
  const hasActiveFilters = search.trim() !== '' || tagFilter !== null || statusFilter !== 'all' || draftOnly;
  const noResultsAtAll = hasActiveFilters && filteredLectures.length === 0 && filteredCustomCourses.length === 0
    && (lectures.length > 0 || nonOnboardingCourses.length > 0);
  // Genuinely nothing exists yet (no filters involved) — distinct from both
  // the error state above and "no results for these filters" below, so it
  // doesn't get mistaken for either.
  const nothingExistsYet = !hasActiveFilters && lectures.length === 0 && nonOnboardingCourses.length === 0;

  return (
    <div className="min-h-screen" style={{ background: PAGE_GRADIENT }}>
      <Navigation user={user} onLogout={onLogout} />

      <div className="max-w-7xl mx-auto px-8 pt-16 pb-16 fade-in">
        {/* ===== HEADER — title block left; the frog, the search field and
             the filters stack down the right edge, per the design ===== */}
        <div className="flex items-start justify-between mb-8 flex-wrap gap-6">
          <div>
            <h1 className="font-montserrat flex items-center gap-3" style={{ ...H1 }}>
              <BookOpenIcon size={30} color={ACCENT} />
              КУРСЫ
            </h1>
            {/* A heading in its own right, not a caption under one — the kit
                gives it 24px and the same wide tracking as the title. */}
            <p className="font-montserrat mt-3" style={{ ...H2, lineHeight: '40px' }}>
              Каталог курсов
            </p>
          </div>

          <div className="flex flex-col items-end gap-3 min-w-0">
            <div className="flex items-center gap-3 flex-wrap justify-end">
              {user.role === 'lead' ? (
                <button
                  onClick={() => navigate('/lead/course-builder')}
                  className="btn-primary font-geist flex items-center gap-2 px-5"
                  style={{ fontSize: 14, height: 48 }}
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
                  className="rounded-lg font-geist font-semibold flex items-center gap-2 px-5 cursor-pointer transition-all hover:brightness-110"
                  style={{ background: `${ACCENT}18`, color: ACCENT, border: `1px solid ${ACCENT}55`, fontSize: 14, height: 48 }}
                >
                  <Icon name="lightbulb" size={16} color={ACCENT} /> Предложить курс
                </button>
              )}

              {/* The frog sits on the field's top-left corner instead of
                  standing off beside the filters — it is the one piece of
                  the mascot the design places rather than parks. Feet
                  overlap the border, so it reads as perched, and it takes
                  no pointer events so it can't swallow a click meant for
                  the input underneath. */}
              <div className="relative" style={{ width: 396, maxWidth: '100%' }}>
                <FrogPerched className="absolute pointer-events-none" style={{ left: -16, bottom: 'calc(100% - 30px)' }} />
                <div
                  className="flex items-center justify-between"
                  style={{ height: 48, padding: '0 16px', borderRadius: 8, border: `1px solid ${SECONDARY}`, background: 'rgba(11, 12, 16, 0.72)' }}
                >
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Поищи курс"
                    aria-label="Поиск курсов по названию"
                    className="font-geist text-sm flex-1 min-w-0 bg-transparent outline-none border-none"
                    style={{ color: TEXT_PRIMARY }}
                  />
                  <SearchIcon size={20} color={ACCENT} />
                </div>
              </div>
            </div>

            {/* ===== FILTERS ===== */}
            <div className="flex flex-wrap items-center gap-2 justify-end">
              <button
                onClick={() => { setTagFilter(null); setDraftOnly(false); }}
                className="font-geist font-semibold cursor-pointer transition-colors"
                style={filterChipStyle(ACCENT, tagFilter === null && !draftOnly)}
              >
                Все темы
              </button>
              {availableTags.map(tag => {
                const color = getCourseTagColor(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => { setTagFilter(t => t === tag ? null : tag); setDraftOnly(false); }}
                    className="font-geist font-semibold cursor-pointer transition-all"
                    style={filterChipStyle(color, tagFilter === tag, tag)}
                  >
                    {tag}
                  </button>
                );
              })}
              {user.role === 'lead' && (
                <button
                  onClick={() => { setDraftOnly(d => !d); setTagFilter(null); }}
                  className="font-geist font-semibold cursor-pointer transition-colors"
                  style={filterChipStyle('#C5C6C7', draftOnly)}
                >
                  Draft
                </button>
              )}

              {(lectures.length > 0 || customCourses.length > 0) && (
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value as StatusFilter)}
                  aria-label="Фильтр по статусу"
                  className="font-geist outline-none cursor-pointer"
                  style={{ fontSize: 12, borderRadius: 4, padding: '4px 8px', background: 'rgba(11, 12, 16, 0.72)', color: TEXT_PRIMARY, border: '1px solid rgba(197, 198, 199,0.25)' }}
                >
                  <option value="all">Любой статус</option>
                  <option value="passed">Пройденные</option>
                  <option value="unpassed">Непройденные</option>
                  {lectures.length > 0 && <option value="active">Доступные лекции</option>}
                  {lectures.length > 0 && <option value="locked">Закрытые лекции</option>}
                </select>
              )}
            </div>
          </div>
        </div>

        {/* ===== FOR NEWCOMERS — permanent, not affected by the tag filter ===== */}
        {filteredOnboardingCourses.length > 0 && (
          <div className="mb-12">
            <div className="mb-6">
              <h2 className="font-montserrat font-semibold flex items-center gap-2" style={{ fontSize: 18, color: TEXT_PRIMARY, letterSpacing: TRACK_WIDE }}>
                <Icon name="graduation" size={18} color={ACCENT} />
                Для новичков
              </h2>
              <p className="font-geist mt-0.5" style={{ fontSize: 12, color: TEXT_MUTED }}>
                Справочные материалы — про сервисы, контакты и задачи команды. Можно пройти в любой момент, не только в первый день.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 stagger-in">
              {filteredOnboardingCourses.map((cc: any) => {
                const color = cc.color || ACCENT;
                const isDraft = !cc.is_published;
                const isPending = cc.proposal_status === 'pending';
                const isLead = user.role === 'lead';
                const isOwn = cc.created_by === user.id;
                const state = courseCardState(cc, color);
                const hidden = isDraft && !isLead && !isOwn;

                return (
                  <div key={cc.id} className="h-full flex flex-col" style={hidden ? { display: 'none' } : undefined}>
                    <CourseCard
                      modulesLabel={modulesLabelFor(cc, 'Вводный курс')}
                      tag={cc.tag || 'Custom'}
                      tagColor={color}
                      title={cc.title}
                      isDraft={isDraft}
                      pendingReview={isPending}
                      ctaLabel={state.ctaLabel}
                      ctaColor={state.ctaColor}
                      isPassed={state.isPassed}
                      progressPct={state.progressPct}
                      statsLabel={isPending ? pickByGender(cc.author_gender, `Предложил: ${cc.author_name}`, `Предложила: ${cc.author_name}`, `Предложение от ${cc.author_name}`) : cc.completedCount !== undefined ? `${cc.completedCount}/${cc.totalTesters} прошли` : cc.author_name}
                      clickable
                      onClick={() => navigate(`/custom-course/${cc.id}`)}
                      onEdit={isLead ? () => navigate(`/lead/course-builder/${cc.id}`) : undefined}
                      onDelete={isLead ? () => deleteCourse(cc.id, cc.title) : undefined}
                      teamCount={isLead ? cc.totalTesters : undefined}
                      isFavorited={favoriteKeys.has(`custom:${cc.id}`)}
                      onToggleFavorite={() => toggleFavorite('custom', cc.id)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ===== COURSE GRID ===== */}
        {lectures.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 stagger-in">
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
                  // A lecture is one test, not a sequence, so its strip is
                  // either empty or full — no invented intermediate.
                  progressPct={isTester ? (isPassed ? 100 : 0) : undefined}
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
                  isFavorited={favoriteKeys.has(`lecture:${lecture.id}`)}
                  onToggleFavorite={() => toggleFavorite('lecture', lecture.id)}
                />
              );
            })}
          </div>
        )}
        {lectures.length === 0 && !hasActiveFilters && nonOnboardingCourses.length === 0 && (
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

            {/* Lead-only section management — unlike suggestion folders,
                these sections are part of the public catalog everyone sees
                below, not a private sorting tool. */}
            {user.role === 'lead' && (
              <div className="p-4 rounded-lg mb-6" style={{ background: CARD_BG, border: '1px dashed rgba(197, 198, 199,0.2)' }}>
                <p className="text-xs font-geist mb-2" style={{ color: TEXT_MUTED }}>Разделы каталога — видят все, помогают ориентироваться среди курсов. Раздел для конкретного курса выбирается в его карточке ниже или в редакторе курса.</p>
                <div className="flex flex-wrap gap-2 mb-2">
                  {sections.map(s => (
                    <span key={s.id} className="flex items-center gap-1.5 text-xs font-geist px-2.5 py-1 rounded-lg" style={{ background: 'rgba(197, 198, 199,0.07)', color: TEXT_PRIMARY }}>
                      {renamingSectionId === s.id ? (
                        <input
                          autoFocus
                          className="pixel-input text-xs"
                          style={{ height: 22, padding: '0 6px', width: 140 }}
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveRenameSection(); if (e.key === 'Escape') setRenamingSectionId(null); }}
                          onBlur={saveRenameSection}
                        />
                      ) : (
                        <span className="break-words min-w-0">{s.name}</span>
                      )}
                      <button onClick={() => startRenameSection(s)} aria-label={`Переименовать раздел ${s.name}`} style={{ color: TEXT_MUTED }}>
                        <Icon name="pencil" size={11} color="currentColor" />
                      </button>
                      <button onClick={() => deleteSection(s.id)} aria-label={`Удалить раздел ${s.name}`} style={{ color: ERROR }}>
                        <Icon name="close" size={12} color="currentColor" />
                      </button>
                    </span>
                  ))}
                  {sections.length === 0 && <p className="text-xs font-geist" style={{ color: TEXT_MUTED }}>Разделов пока нет.</p>}
                </div>
                <div className="flex gap-2 max-w-sm">
                  <input
                    className="pixel-input text-xs"
                    placeholder="Например: Основы"
                    value={newSectionName}
                    onChange={e => setNewSectionName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && createSection()}
                  />
                  <button onClick={createSection} className="btn-secondary text-xs px-4 py-2 shrink-0">+ Раздел</button>
                </div>
              </div>
            )}

            {(sections.length > 0 ? courseGroups : [{ id: null, name: '', courses: filteredCustomCourses }]).map(group => (
              <div key={String(group.id)} className="mb-8 last:mb-0">
                {sections.length > 0 && (
                  <p className="font-montserrat font-semibold mb-3" style={{ color: TEXT_MUTED, fontSize: 13, letterSpacing: TRACK_WIDE }}>{group.name.toUpperCase()}</p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 stagger-in">
                  {group.courses.map((cc: any) => {
                    const color = cc.color || ACCENT;
                    const courseIsNew = isNew(cc.created_at, !!cc.viewed);
                    const isDraft = !cc.is_published;
                    const isPending = cc.proposal_status === 'pending';
                    const isLead = user.role === 'lead';
                    const state = courseCardState(cc, color);
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
                          modulesLabel={modulesLabelFor(cc, 'Дополнительный курс')}
                          tag={cc.tag || 'Custom'}
                          tagColor={color}
                          title={cc.title}
                          isNew={courseIsNew}
                          isDraft={isDraft}
                          pendingReview={isPending}
                          ctaLabel={state.ctaLabel}
                          ctaColor={state.ctaColor}
                          isPassed={state.isPassed}
                          progressPct={state.progressPct}
                          statsLabel={isPending ? pickByGender(cc.author_gender, `Предложил: ${cc.author_name}`, `Предложила: ${cc.author_name}`, `Предложение от ${cc.author_name}`) : cc.completedCount !== undefined ? `${cc.completedCount}/${cc.totalTesters} прошли` : cc.author_name}
                          clickable
                          onClick={() => navigate(`/custom-course/${cc.id}`)}
                          onEdit={isLead ? () => navigate(`/lead/course-builder/${cc.id}`) : undefined}
                          onDelete={isLead ? () => deleteCourse(cc.id, cc.title) : undefined}
                          teamCount={isLead ? cc.totalTesters : undefined}
                          isFavorited={favoriteKeys.has(`custom:${cc.id}`)}
                          onToggleFavorite={() => toggleFavorite('custom', cc.id)}
                        />
                        </div>
                        {(() => {
                          const chip = deadlineChip(cc.effectiveDeadline);
                          return chip ? (
                            <p className="font-geist text-center mt-1.5" style={{ fontSize: 11, color: chip.color }}>{chip.label}</p>
                          ) : null;
                        })()}
                        {isLead && sections.length > 0 && (
                          <select
                            value={cc.section_id ?? ''}
                            onChange={e => assignSection(cc.id, e.target.value ? Number(e.target.value) : null)}
                            aria-label={`Раздел для курса ${cc.title}`}
                            className="mt-1.5 font-geist text-xs rounded-lg outline-none"
                            style={{ background: CARD_BG, color: TEXT_MUTED, border: '1px solid rgba(197, 198, 199,0.15)', padding: '4px 8px' }}
                          >
                            <option value="">Без раздела</option>
                            {sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
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
        {user.role === 'lead' && nonOnboardingCourses.length === 0 && (
          <div className="mt-12 rounded-lg p-8 text-center" style={{ background: CARD_BG, border: '1px dashed rgba(197, 198, 199,0.1)', boxShadow: '0 6px 12px 0 rgba(0, 0, 0, 0.25)' }}>
            <p className="font-geist text-sm mb-4" style={{ color: TEXT_MUTED }}>Вы ещё не создали ни одного курса</p>
            <button
              onClick={() => navigate('/lead/course-builder')}
              className="btn-primary font-geist px-6 py-2.5 inline-flex items-center gap-2"
              style={{ fontSize: 14 }}
            >
              <PlusIcon size={16} color={PAGE_BG} />Создать первый курс
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
