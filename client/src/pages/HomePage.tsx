import { useEffect, useState, ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';
import Navigation from '../components/Navigation';
import FrogLoader from '../components/FrogLoader';
import GreetingFrogIcon from '../components/GreetingFrogIcon';
import Icon from '../components/Icon';
import { BookIcon, ShopIcon, HomeIcon, ChevronRightIcon, ChevronRightDoubleIcon } from '../components/QuickLinkIcons';
import graduationCapIcon from '../assets/icons/graduation-cap.svg';
import chartLineIcon from '../assets/icons/chart-line.svg';
import peopleGroupIcon from '../assets/icons/people-group.svg';
import checkIcon from '../assets/icons/check.svg';
import starIcon from '../assets/icons/star.svg';
import { statsApi, testerApi, leadApi, teamApi } from '../api';
import { GlobalStats, TeamMember, TeamNewsItem } from '../types';
import { timeAgo } from '../utils/date';
import { showApiError } from '../utils/toast';
import { formatActivityAction, formatTeamEvent } from '../utils/activity';
import { EVENT_ICON } from '../utils/newsIcons';
import {
  ACCENT, NUM_BRIGHT, NUM_DIM, SECONDARY, PAGE_BG,
  TEXT_PRIMARY, TEXT_MUTED, CARD_BG_PATTERN, PAGE_GRADIENT,
  CARD_SHADOW, CARD_SHADOW_TALL, STAT_GRADIENT, STAT_SHADOW, TRACK_WIDE,
  STAT_LABEL_COLOR,
} from '../utils/theme';

interface HomePageProps {
  user: any;
  onLogout: () => void;
}

// Actions excluded from a tester's own "Последние результаты": login/
// session/account noise (a tester's own login history isn't a "result"),
// plus failed_lecture — this list is explicitly positive-only, per the
// owner ("только про результаты положительные"), so a failed attempt
// doesn't show up here at all (it's still visible to the lead elsewhere,
// e.g. UleyPage/AdminPage's full activity log — this only trims the
// tester-facing "results" teaser).
const NOISY_PERSONAL_ACTIONS = new Set([
  'login', 'register', 'register_telegram', 'login_telegram',
  'password_changed', 'password_reset_self_service', 'failed_lecture',
]);

// Team-news event types relevant to the lead's home-page teaser — lectures,
// new materials, new teammates. Birthdays/leave still show on the full
// /news page, just not repeated here.
const HOME_NEWS_TYPES = new Set(['lecture_video_added', 'guide_published', 'course_published', 'member_joined']);

export default function HomePage({ user, onLogout }: HomePageProps) {
  const navigate = useNavigate();
  const isTester = user.role === 'tester';
  const [stats, setStats] = useState<GlobalStats>({ courses: 10, testers: 4, bugsCaught: 0, avgScore: 0, checklistsCompleted: 0 });
  const [loading, setLoading] = useState(true);

  // Tester-facing
  const [metrics, setMetrics] = useState<{
    lecturesCompleted: number; averageScore: number; skillGrowth: string;
    onboardingCourseCompleted: boolean; onboardingCourseId: number | null;
  } | null>(null);
  // "Последние результаты" used to be a flat quiz-score list (getHistory) —
  // switched to the same activity-log feed MoyaNora's "Активность" tab
  // uses (richer, explanatory entries: passed/failed a lecture, submitted a
  // checklist, crafted a badge, ...) with real offset-based pagination.
  const [myActivity, setMyActivity] = useState<any[]>([]);
  const [myActivityOffset, setMyActivityOffset] = useState(0);
  const [myActivityHasMore, setMyActivityHasMore] = useState(false);
  const [myActivityLoadingMore, setMyActivityLoadingMore] = useState(false);

  // Lead/admin-facing — was a raw activity_log feed (leadApi.getActivity),
  // which meant every teammate's login showed up here alongside anything
  // actually newsworthy. Regular users don't need "who logged in when" —
  // not even about themselves (see the tester branch above) — and the
  // lead's home teaser specifically should only be about lectures, new
  // materials, and new team members, not a security/audit log. That's
  // exactly the existing team-news taxonomy (see NewsPage.tsx), so this
  // reuses it instead of a bespoke filter over activity_log.
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [teamNews, setTeamNews] = useState<TeamNewsItem[]>([]);

  useEffect(() => {
    statsApi.getGlobal().then(r => setStats(r.data)).catch((err: any) => showApiError(err, 'Не удалось загрузить статистику площадки'));

    if (isTester) {
      Promise.all([testerApi.getMetrics(), testerApi.getMyActivity()])
        .then(([m, a]) => {
          setMetrics(m.data);
          const rows = a.data.rows.filter((row: any) => !NOISY_PERSONAL_ACTIONS.has(row.action));
          setMyActivity(rows);
          setMyActivityHasMore(a.data.hasMore);
          setMyActivityOffset(a.data.rows.length);
        })
        // Was silent — a failure here left the widgets at their empty
        // default, indistinguishable from "you haven't done anything yet".
        .catch((err: any) => showApiError(err, 'Не удалось загрузить твои данные'))
        .finally(() => setLoading(false));
    } else {
      Promise.all([leadApi.getTeam(), teamApi.getNews()])
        .then(([t, n]) => {
          setTeam(t.data);
          setTeamNews(n.data.rows.filter((item: TeamNewsItem) => HOME_NEWS_TYPES.has(item.event_type)).slice(0, 6));
        })
        .catch((err: any) => showApiError(err, 'Не удалось загрузить данные команды'))
        .finally(() => setLoading(false));
    }
  }, [isTester]);

  const loadMoreMyActivity = () => {
    setMyActivityLoadingMore(true);
    testerApi.getMyActivity({ offset: myActivityOffset })
      .then(r => {
        const rows = r.data.rows.filter((row: any) => !NOISY_PERSONAL_ACTIONS.has(row.action));
        setMyActivity(prev => [...prev, ...rows]);
        setMyActivityHasMore(r.data.hasMore);
        setMyActivityOffset(o => o + r.data.rows.length);
      })
      .catch((err: any) => showApiError(err, 'Не удалось загрузить ещё результаты'))
      .finally(() => setMyActivityLoadingMore(false));
  };

  const testerStats = [
    { label: 'Курсов пройдено', value: metrics ? metrics.lecturesCompleted : '—', suffix: metrics ? '/10' : '' },
    { label: 'Средний балл', value: metrics ? metrics.averageScore : '—', suffix: metrics ? '%' : '', dot: true },
  ];
  const leadStats = [
    { label: 'Человек в команде', value: team.length || '—' },
    { label: 'Средний балл', value: team.length ? Math.round(team.reduce((s, t) => s + t.avgScore, 0) / team.length) : '—', suffix: team.length ? '%' : '', dot: true },
  ];
  const headerStats = isTester ? testerStats : leadStats;

  return (
    <div className="min-h-screen relative" style={{ background: PAGE_GRADIENT }}>
      <Navigation user={user} onLogout={onLogout} />

      {/* The app-wide BAGANET watermark (App.tsx → BgWatermark.tsx) now
          renders behind every page — this used to have its own local copy
          here, which meant Home briefly rendered two overlapping
          watermarks at different opacities. Removed in favor of the
          shared one. */}
      <div className="relative z-10 max-w-7xl mx-auto px-8 pt-16 pb-16">
        {/* ===== HERO: greeting + skills panel side by side =====
            Kit spacing (reference frame 1440×1037, everything below
            expressed as a clamp() so it holds exactly at 1440 and scales
            fluidly outside it, same approach as the header rebuild):
            - frog inset from the page container's own left edge: 138px
              (the container already carries the site-wide 32px `px-8`, so
              138 + 32 = the kit's 170px "from the frog to where the header
              starts" — the header itself sits flush with this container).
            - gap between the greeting text and the skills panel: 106px.
            - gap from this section down to "ПОСЛЕДНИЕ РЕЗУЛЬТАТЫ": 123px.
            No `justify-content: space-between` — the kit's numbers are all
            relative offsets in a left-to-right flow, not edge-anchored, so
            wherever the skills panel lands after the fixed gap is correct
            (it isn't pinned to the container's right edge). */}
        <section
          className="flex flex-col lg:flex-row lg:items-start"
          style={{ gap: 'clamp(24px, 7.3611vw, 106px)', marginBottom: 'clamp(48px, 8.5417vw, 123px)' }}
        >
          <div className="flex items-center gap-4" style={{ marginLeft: 'clamp(0px, 9.5833vw, 138px)' }}>
            <GreetingFrogIcon size={60} />
            <h1
              className="font-montserrat font-semibold min-w-0"
              style={{ fontSize: 'clamp(22px, 2.2222vw, 32px)', lineHeight: 1.25, letterSpacing: TRACK_WIDE, textAlign: 'center' }}
            >
              <span style={{ color: STAT_LABEL_COLOR, display: 'block' }}>Привет,</span>
              <span className="break-words" style={{ color: ACCENT, display: 'block' }}>
                {(user.displayName || user.name).split(' ')[0]}<span style={{ color: '#FFFFFF' }}>!</span>
              </span>
            </h1>
          </div>

          <div className="w-full lg:w-auto lg:min-w-[420px]">
            <TwoTone first={isTester ? 'ТВОИ' : 'КОМАНДА'} second={isTester ? 'НАВЫКИ' : 'СЕГОДНЯ'} />
            <div className="grid grid-cols-2 gap-3 mt-3">
              {headerStats.map(s => <StatCard key={s.label} {...s} />)}
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          {/* ===== LEFT: personalized panel ===== */}
          <div className="lg:col-span-2 space-y-6">
            {isTester ? (
              <div>
                <TwoTone first="ПОСЛЕДНИЕ" second="РЕЗУЛЬТАТЫ" />
                {loading && <FrogLoader />}
                {/* Onboarding nudge — deliberately tenure-neutral copy (not
                    "welcome, newbie!"), so it reads fine for a long-tenured
                    tester who just never got around to it. Shown to anyone
                    who hasn't finished it, no matter how long they've been
                    here; disappears the moment onboardingCourseCompleted
                    flips true, or if no onboarding course is published yet. */}
                {!loading && metrics && !metrics.onboardingCourseCompleted && metrics.onboardingCourseId != null && (
                  <div
                    className="p-5 rounded-lg mt-3 mb-4 flex flex-col sm:flex-row sm:items-center gap-4 justify-between"
                    style={{ background: CARD_BG_PATTERN, boxShadow: CARD_SHADOW, border: `1px solid ${ACCENT}40` }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Icon name="graduation" size={20} color={ACCENT} className="shrink-0" />
                      <p className="font-geist text-sm min-w-0 break-words" style={{ color: TEXT_PRIMARY }}>
                        «Вводный курс» — про сервисы, к кому обращаться и какие бывают задачи. Ещё не пройден — загляни, если будет минутка.
                      </p>
                    </div>
                    <button
                      onClick={() => navigate(`/custom-course/${metrics.onboardingCourseId}`)}
                      className="btn-primary text-xs px-4 py-2 shrink-0 flex items-center gap-1.5"
                    >
                      Открыть <Icon name="chevronRight" size={13} color="currentColor" />
                    </button>
                  </div>
                )}
                {!loading && myActivity.length === 0 && (!metrics || metrics.onboardingCourseCompleted || metrics.onboardingCourseId == null) && (
                  <div
                    className="p-10 flex flex-col items-center gap-8 rounded-lg mt-3"
                    style={{ background: CARD_BG_PATTERN, boxShadow: CARD_SHADOW }}
                  >
                    <p className="font-geist text-center" style={{ fontSize: 15, fontWeight: 400, color: TEXT_MUTED, letterSpacing: TRACK_WIDE }}>
                      Ещё ни одна лекция не пройдена ;(
                    </p>
                    <button
                      onClick={() => navigate('/zhukademia')}
                      className="font-geist rounded-lg cursor-pointer transition-all hover:brightness-110 flex items-center"
                      style={{
                        width: 322,
                        maxWidth: '100%',
                        height: 44,
                        padding: '14px 39px 14px 32px',
                        background: ACCENT,
                        color: PAGE_BG,
                        fontSize: 14,
                        fontWeight: 600,
                        letterSpacing: TRACK_WIDE,
                      }}
                    >
                      Начать первую лекцию
                      <Icon name="rocket" size={13} color={PAGE_BG} style={{ marginLeft: 8 }} />
                    </button>
                  </div>
                )}
                {myActivity.length > 0 && (
                  <div className="rounded-lg mt-3 px-4 py-1" style={{ background: CARD_BG_PATTERN, boxShadow: CARD_SHADOW }}>
                    {/* Scrolls internally once it grows past ~6 rows instead
                        of pushing the rest of the page down indefinitely —
                        "Показать ещё" below still extends the underlying
                        list past what's currently loaded. */}
                    <div style={{ maxHeight: 420, overflowY: 'auto' }}>
                      {myActivity.map((a, i) => (
                        <div
                          key={a.id}
                          className="py-3 flex items-center gap-3"
                          style={{ borderBottom: i < myActivity.length - 1 ? '1px solid rgba(197, 198, 199, 0.1)' : 'none' }}
                        >
                          <div className="shrink-0 w-1.5 h-1.5 rounded-full" style={{ background: ACCENT }} />
                          <p className="flex-1 min-w-0 break-words font-geist text-sm" style={{ color: TEXT_PRIMARY }}>
                            {formatActivityAction(a.action, { lectureTitle: a.lecture_title, courseTitle: a.course_title, gender: user.gender })}
                          </p>
                          <span className="font-geist text-xs shrink-0" style={{ color: TEXT_MUTED }}>{timeAgo(a.created_at)}</span>
                        </div>
                      ))}
                    </div>
                    {myActivityHasMore && (
                      <div className="text-center py-3" style={{ borderTop: '1px solid rgba(197, 198, 199, 0.1)' }}>
                        <button onClick={loadMoreMyActivity} disabled={myActivityLoadingMore} className="btn-secondary text-xs px-4 py-1.5 disabled:opacity-50">
                          {myActivityLoadingMore ? 'Загрузка...' : 'Показать ещё'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Team news teaser — lectures, new materials, new teammates
                    only (see HOME_NEWS_TYPES above); the full feed with
                    birthdays/leave lives at /news. */}
                <div>
                  <TwoTone first="НОВОСТИ" second="КОМАНДЫ" />
                  {loading && <FrogLoader />}
                  {!loading && teamNews.length === 0 && (
                    <p className="font-geist text-sm text-center py-6" style={{ color: TEXT_MUTED }}>Пока пусто</p>
                  )}
                  {teamNews.length > 0 && (
                    <div className="rounded-lg mt-3 px-4 py-1" style={{ background: CARD_BG_PATTERN, boxShadow: CARD_SHADOW }}>
                      {teamNews.map((item, i) => (
                        <div
                          key={item.id}
                          className="py-3 flex items-center gap-3"
                          style={{ borderBottom: i < teamNews.length - 1 ? '1px solid rgba(197, 198, 199, 0.1)' : 'none' }}
                        >
                          <Icon name={EVENT_ICON[item.event_type] || 'bug'} size={18} color={ACCENT} className="shrink-0" />
                          <p className="flex-1 min-w-0 break-words font-geist text-xs" style={{ color: TEXT_PRIMARY }}>{formatTeamEvent(item)}</p>
                          <span className="font-geist text-xs shrink-0" style={{ color: TEXT_MUTED }}>{timeAgo(item.created_at)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* ===== RIGHT: quick links ===== */}
          {/* Team-news teaser used to live here too, but it isn't part of
              the Figma homepage — dropped from this page only; the feature
              itself is untouched (still reachable via the "Новости" nav
              link → the full /news page). */}
          <div>
            <TwoTone first="БЫСТРЫЕ" second="ССЫЛКИ" />
            <div className="mt-3">
              {[
                { label: isTester ? 'Продолжить курс' : 'Каталог курсов', Icon: BookIcon, to: '/zhukademia' },
                { label: 'Квакодельня', Icon: ShopIcon, to: '/bagodelnya' },
                // Чеклисты — temporarily off the quick-links list too, see Navigation.tsx/App.tsx.
                // { label: 'Чеклисты', Icon: ChecklistIcon, to: '/checklists' },
                { label: isTester ? 'Моё болото' : 'Команда', Icon: HomeIcon, to: isTester ? '/cabinet' : '/dashboard' },
              ].map((link, i, arr) => (
                <LinkRow key={link.to} {...link} onClick={() => navigate(link.to)} showDivider={i < arr.length - 1} />
              ))}
            </div>
          </div>
        </div>

        {/* ===== BOTTOM: platform-wide stats ===== */}
        <div className="mt-10">
          <TwoTone first="СТАТИСТИКА" second="ПЛОЩАДКИ" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-3">
            {[
              { icon: graduationCapIcon, label: 'Курсов', value: stats.courses },
              { icon: chartLineIcon, label: 'Балл', value: stats.avgScore },
              { icon: peopleGroupIcon, label: 'Тестеров', value: stats.testers },
              { icon: null, label: 'Мух', value: stats.bugsCaught },
              { icon: checkIcon, label: 'Чеклистов', value: stats.checklistsCompleted },
            ].map(item => (
              <div
                key={item.label}
                className="flex flex-col justify-center items-center rounded-lg"
                style={{ height: 80, padding: 8, gap: 10, background: STAT_GRADIENT, boxShadow: STAT_SHADOW }}
              >
                <p className="font-geist font-normal flex items-center justify-center gap-1.5" style={{ color: ACCENT, fontSize: 20, letterSpacing: 4 }}>
                  {item.value}
                  {/* "Мух" (flies caught) has no icon-kit asset — frogs catch
                      flies with their tongue, matching the app's "QA testers
                      catch bugs" gag one step further down the food chain. */}
                  {item.icon ? <img src={item.icon} width={24} height={24} alt="" /> : <Icon name="frog" size={24} color={ACCENT} />}
                </p>
                <p className="font-geist font-normal text-center" style={{ color: STAT_LABEL_COLOR, fontSize: 16, letterSpacing: 3.2 }}>{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Two-tone Montserrat section heading — first word muted gray, second word
// in the accent color (matches the redesign's "ТВОИ НАВЫКИ" / "ПОСЛЕДНИЕ
// РЕЗУЛЬТАТЫ" style headings throughout). 18px/600/0.2em per Figma Inspect.
function TwoTone({ first, second }: { first: string; second: string }) {
  return (
    <p className="font-montserrat font-semibold" style={{ fontSize: 18, lineHeight: '26px', letterSpacing: TRACK_WIDE }}>
      <span style={{ color: TEXT_MUTED }}>{first} </span>
      <span style={{ color: ACCENT }}>{second}</span>
    </p>
  );
}

// Big stat-card number: bright headline digit + dimmed suffix (score/10,
// score%) — per Figma's two number colors (#8AFFF5 full, 60%-opacity dim).
function StatCard({ value, suffix, label, dot }: { value: string | number; suffix?: string; label: string; dot?: boolean }) {
  return (
    <div
      className="relative flex flex-col items-start rounded-lg"
      style={{ padding: 16, gap: 24, background: CARD_BG_PATTERN, boxShadow: CARD_SHADOW_TALL }}
    >
      {/* Kit uses a small glowing sparkle here, not a plain dot — star.svg
          already bakes in its own drop-shadow glow filter. */}
      {dot && (
        <img src={starIcon} alt="" className="absolute top-2 right-2" width={14} height={14} />
      )}
      <p className="font-montserrat font-extrabold" style={{ fontSize: 'clamp(1.5rem, 4vw, 2.5rem)', letterSpacing: TRACK_WIDE }}>
        <span style={{ color: NUM_BRIGHT }}>{value}</span>
        {suffix && <span style={{ color: NUM_DIM }}>{suffix}</span>}
      </p>
      <p className="font-geist font-normal" style={{ fontSize: 15, color: TEXT_MUTED, letterSpacing: TRACK_WIDE }}>{label}</p>
    </div>
  );
}

// Per the UI Kit: a plain divider-separated list (no per-row card fill),
// white text by default; hover fills solid accent with dark text and swaps
// the single chevron for a double one. Pure CSS (Tailwind `group`/hover),
// no JS state — icons/chevrons use `currentColor` so they follow the
// button's own text-color hover transition automatically. The divider is
// its own fixed-width element (245x1px, solid SECONDARY) rather than a
// full-row border — the kit's line doesn't span the row's full width.
const LINK_ROW_DEFAULT_COLOR = '#FFFFFF';
function LinkRow({ Icon, label, onClick, showDivider }: { Icon: ComponentType<{ size?: number; color?: string }>; label: string; onClick: () => void; showDivider: boolean }) {
  // Icon + chevrons are pinned to the accent teal (matches the rest of the
  // site's icon language) instead of following the row's own hover-driven
  // text color — only the label text still flips white↔dark on hover; the
  // icons flip too (so they stay visible once the row fills solid accent
  // on hover) but via their own state, not currentColor inherited from the
  // button's text color.
  const [hovered, setHovered] = useState(false);
  const glyphColor = hovered ? PAGE_BG : ACCENT;
  return (
    <>
      <button
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="group w-full flex items-center gap-3 px-3 py-3.5 text-left cursor-pointer rounded-lg transition-colors"
        style={{ color: hovered ? PAGE_BG : LINK_ROW_DEFAULT_COLOR, background: hovered ? ACCENT : 'transparent' }}
      >
        <Icon size={22} color={glyphColor} />
        <span className="font-geist text-sm flex-1 group-hover:font-semibold" style={{ letterSpacing: TRACK_WIDE }}>{label.toUpperCase()}</span>
        <ChevronRightIcon size={20} color={glyphColor} className="group-hover:hidden" />
        <ChevronRightDoubleIcon size={20} color={glyphColor} className="hidden group-hover:block" />
      </button>
      {showDivider && <div style={{ width: 245, maxWidth: '100%', height: 1, background: SECONDARY, marginLeft: 12 }} />}
    </>
  );
}
