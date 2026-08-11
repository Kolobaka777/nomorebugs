import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navigation from '../components/Navigation';
import LevelBadge from '../components/LevelBadge';
import SnailLoader from '../components/SnailLoader';
import PixelAvatar from '../components/PixelAvatar';
import ProfileEditModal from '../components/ProfileEditModal';
import { testerApi, checklistApi, rewardsApi, presenceApi } from '../api';
import {
  Lecture, TestHistoryItem, SKillChart,
  FullProfile, getLevel, PresenceEntry,
} from '../types';
import { BG_LIST, type BgId, type FrameId } from '../components/PixelAvatar';
import Icon, { IconName } from '../components/Icon';
import { clickableProps } from '../utils/a11y';
import { parseServerDate } from '../utils/date';
import { showApiError } from '../utils/toast';
import { TIMEZONES, HOUR_OPTIONS } from '../utils/timezones';
import {
  PAGE_GRADIENT, PAGE_BG, CARD_BG, TEXT_PRIMARY, TEXT_MUTED, ACCENT, SECONDARY, TRACK_WIDE, BADGE_BG, BADGE_BORDER,
} from '../utils/theme';

interface MoyaNoraProps { user: any; onLogout: () => void; onUserUpdate?: (patch: Record<string, any>) => void; }

type Tab = 'favorites' | 'notes' | 'collection';

// ── Rarity ───────────────────────────────────────────────────────────────────
const RARITY_COLORS = { common: ACCENT, rare: '#7F77DD', epic: '#EF9F27' };
const RARITY_LABEL  = { common: '',       rare: 'RARE',    epic: 'EPIC'   };

const WEEKDAY_LABELS: [string, string][] = [['1', 'Пн'], ['2', 'Вт'], ['3', 'Ср'], ['4', 'Чт'], ['5', 'Пт'], ['6', 'Сб'], ['7', 'Вс']];
const LEAVE_LABELS: Record<string, string> = { vacation: 'Отпуск', sick: 'Больничный', day_off: 'Отгул', other: 'Другое' };

// Birthday is stored as 'MM-DD' (no year — see server/src/routes/presence.js)
// and is set once, at registration; this just renders it human-readably
// wherever it's shown read-only.
const MONTHS_GENITIVE = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
function formatBirthday(mmdd: string): string {
  const [mm, dd] = mmdd.split('-').map(Number);
  const month = MONTHS_GENITIVE[mm - 1];
  return month ? `${dd} ${month}` : mmdd;
}

// ── Badge metadata ────────────────────────────────────────────────────────────
const BADGE_META: Record<string, { name: string; icon: IconName; color: string }> = {
  'HTML structure':     { name: 'HTML-жук',        icon: 'globe',     color: ACCENT },
  'CSS reading':        { name: 'CSS-жук',         icon: 'palette',   color: '#7F77DD' },
  'DevTools':           { name: 'DevTools-жук',    icon: 'search',    color: '#EF9F27' },
  'Console errors':     { name: 'Консольный жук',  icon: 'lightning', color: '#e05252' },
  'Bug report quality': { name: 'Жук-репортёр',    icon: 'bug',       color: '#EF9F27' },
};

// ── Before/After summary (kept for future use on this page — not currently
//    wired into any tab) ─────────────────────────────────────────────────────
function getGrowthSummary(skills: SKillChart[], completed: number) {
  if (!skills.length || skills.every(s => s.before === 0))
    return { text: 'Пройди базовый опрос, чтобы увидеть прогресс', color: TEXT_MUTED };
  const avg = skills.reduce((s, r) => s + r.delta, 0) / skills.length;
  const pos = skills.filter(r => r.delta > 0).length;
  if (avg <= 0 && completed === 0)
    return { text: 'Ты только начинаешь путь — впереди все открытия', color: TEXT_MUTED };
  if (avg <= 0)
    return { text: `${completed} курс${completed === 1 ? '' : 'а'} пройдено — база становится крепче`, color: '#7F77DD' };
  if (avg < 1)
    return { text: `${pos} из ${skills.length} навыков уже подросли. Ты движешься!`, color: ACCENT };
  if (avg < 2)
    return { text: `Средний рост +${avg.toFixed(1)} пункта — это реально заметно`, color: ACCENT };
  return { text: `+${avg.toFixed(1)} пункта в среднем — ты точно не улитка`, color: '#EF9F27' };
}

// ── Shared flat card shell — same border/radius/shadow language as
//    HomePage/CustomCourseDetailPage, replacing the old RPG/Win98 panel. ──────
function Panel({ children, className = '', pad = 'p-5', style, onClick }: {
  children: React.ReactNode; className?: string; pad?: string; style?: React.CSSProperties; onClick?: () => void;
}) {
  return (
    <div
      className={`rounded-lg ${pad} ${className}`}
      style={{ background: CARD_BG, boxShadow: '0 6px 12px 0 rgba(0, 0, 0, 0.25)', ...style }}
      onClick={onClick}
      {...(onClick ? clickableProps(onClick) : {})}
    >
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="font-montserrat font-semibold mb-3" style={{ fontSize: 14, color: TEXT_MUTED, letterSpacing: TRACK_WIDE }}>{children}</p>;
}

// A plain divider-separated quick-link row, matching HomePage's LinkRow —
// same white-text/teal-hover pattern, reused here for Избранное/Заметки/
// Магазин instead of duplicating the styling.
function QuickLinkRow({ icon, label, onClick, showDivider, disabled, disabledLabel }: {
  icon: IconName; label: string; onClick: () => void; showDivider: boolean;
  // Coming-soon variant: no click, lock glyph instead of the usual icon, a
  // small "БУДЕТ ПОЗЖЕ" badge instead of the chevron.
  disabled?: boolean; disabledLabel?: string;
}) {
  return (
    <>
      <button
        onClick={disabled ? undefined : onClick}
        disabled={disabled}
        className="group w-full flex items-center gap-3 px-3 py-3 text-left rounded-lg transition-colors"
        style={{ color: disabled ? TEXT_MUTED : '#FFFFFF', cursor: disabled ? 'default' : 'pointer' }}
        onMouseEnter={e => { if (!disabled) { e.currentTarget.style.color = PAGE_BG; e.currentTarget.style.background = ACCENT; } }}
        onMouseLeave={e => { if (!disabled) { e.currentTarget.style.color = '#FFFFFF'; e.currentTarget.style.background = 'transparent'; } }}
      >
        <Icon name={disabled ? 'lock' : icon} size={22} color="currentColor" />
        <span className="font-geist text-sm flex-1" style={{ letterSpacing: TRACK_WIDE }}>{label.toUpperCase()}</span>
        {disabled ? (
          <span
            className="font-geist font-semibold shrink-0 rounded"
            style={{ fontSize: 10, letterSpacing: TRACK_WIDE, color: TEXT_MUTED, background: 'rgba(197, 198, 199,0.08)', padding: '3px 7px' }}
          >
            {disabledLabel || 'БУДЕТ ПОЗЖЕ'}
          </span>
        ) : (
          <Icon name="chevronRight" size={22} color="currentColor" />
        )}
      </button>
      {showDivider && <div style={{ width: 200, maxWidth: '100%', height: 1, background: SECONDARY, marginLeft: 12 }} />}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function MoyaNora({ user, onLogout, onUserUpdate }: MoyaNoraProps) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('favorites');

  const [metrics, setMetrics]           = useState<any>(null);
  const [lectures, setLectures]         = useState<Lecture[]>([]);
  const [history, setHistory]           = useState<TestHistoryItem[]>([]);
  const [beforeAfter, setBeforeAfter]   = useState<SKillChart[]>([]);
  const [profile, setProfile]           = useState<FullProfile | null>(null);
  const [loading, setLoading]           = useState(true);
  const [showEdit, setShowEdit]         = useState(false);
  const [taskCounts, setTaskCounts]     = useState<{ name: string; task_type: string; color: string; count: number }[]>([]);
  const [crafting, setCrafting]         = useState<string | null>(null);
  const [craftSuccess, setCraftSuccess] = useState<string | null>(null);
  const [premiumPoints, setPremiumPoints] = useState<{ premium_points: number; history: any[] } | null>(null);
  const [loadError, setLoadError] = useState('');
  const [myPresence, setMyPresence] = useState<PresenceEntry | null>(null);
  const [presenceForm, setPresenceForm] = useState({ work_start: '', work_end: '', days: new Set(['1', '2', '3', '4', '5']), timezone: 'Europe/Moscow' });
  const [savingPresence, setSavingPresence] = useState(false);

  const togglePresenceDay = (d: string) => setPresenceForm(f => {
    const days = new Set(f.days);
    if (days.has(d)) days.delete(d); else days.add(d);
    return { ...f, days };
  });

  const savePresence = async () => {
    setSavingPresence(true);
    try {
      await presenceApi.updateMe({
        work_start: presenceForm.work_start || null,
        work_end: presenceForm.work_end || null,
        work_days: Array.from(presenceForm.days).join(',') || '1,2,3,4,5',
        timezone: presenceForm.timezone,
        // Birthday is deliberately not sent from here — it's set once at
        // registration and read-only after that (see the identity card
        // above), not editable from this working-hours form anymore.
      });
      const res = await presenceApi.getTeam();
      setMyPresence(res.data.find((p: PresenceEntry) => p.id === user.id) || null);
    } catch (err: any) {
      showApiError(err, 'Не удалось сохранить рабочее время');
    } finally {
      setSavingPresence(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoadError('');
    try {
      const [metricsRes, lecturesRes, historyRes, baRes, profileRes] = await Promise.all([
        testerApi.getMetrics(),
        testerApi.getLectures(),
        testerApi.getHistory(),
        testerApi.getBeforeAfter(),
        testerApi.getProfileFull(),
      ]);

      // Task counts / premium points are secondary widgets on this page —
      // a toast on failure (rather than blocking the whole cabinet) is
      // enough; the rest of the page still fully works without them.
      checklistApi.getTaskCounts().then(r => setTaskCounts(r.data)).catch((err: any) => showApiError(err, 'Не удалось загрузить статистику по задачам'));
      rewardsApi.getMyPremiumPoints().then(r => setPremiumPoints(r.data)).catch((err: any) => showApiError(err, 'Не удалось загрузить премиальные баллы'));
      presenceApi.getTeam().then(r => {
        const mine = r.data.find((p: PresenceEntry) => p.id === user.id) || null;
        setMyPresence(mine);
        if (mine) {
          setPresenceForm({
            work_start: mine.workStart || '',
            work_end: mine.workEnd || '',
            days: new Set((mine.workDays || '1,2,3,4,5').split(',')),
            timezone: mine.timezone || 'Europe/Moscow',
          });
        }
      }).catch((err: any) => showApiError(err, 'Не удалось загрузить рабочее время'));
      setMetrics(metricsRes.data);
      setLectures(lecturesRes.data);
      setHistory(historyRes.data);
      setBeforeAfter(baRes.data);
      setProfile(profileRes.data);
      // The nav dropdown reads user.displayName from localStorage, which is
      // only ever set at login or after actively editing the nickname here —
      // without this, a nickname set in an earlier session (or on another
      // device) keeps showing the real name in the nav even while this very
      // page correctly shows the nickname, since the two read from different
      // places.
      const nickname = profileRes.data.nickname?.trim();
      if (nickname && nickname !== user.name && nickname !== user.displayName) {
        onUserUpdate?.({ displayName: nickname });
      }
      // Same staleness problem as displayName above — gender set on another
      // device/session wouldn't otherwise reach the localStorage user object
      // that HomePage etc. read it from.
      if (profileRes.data.gender !== undefined && profileRes.data.gender !== user.gender) {
        onUserUpdate?.({ gender: profileRes.data.gender });
      }
    } catch (err: any) {
      // This is the tester's main daily-use page — used to just log and
      // leave everything at its empty default, which reads as "you have no
      // progress yet" instead of "this failed to load".
      setLoadError(err.response?.data?.error || 'Не удалось загрузить кабинет');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen" style={{ background: PAGE_GRADIENT }}>
      <Navigation user={user} onLogout={onLogout} />
      <SnailLoader />
    </div>
  );

  if (loadError) return (
    <div className="min-h-screen" style={{ background: PAGE_GRADIENT }}>
      <Navigation user={user} onLogout={onLogout} />
      <div className="max-w-4xl mx-auto px-6 pt-16 pb-8">
        <div className="card text-center py-10">
          <p className="text-sm font-sans mb-4" style={{ color: '#e05252' }}>{loadError}</p>
          <button onClick={() => { setLoading(true); loadAll(); }} className="btn-secondary text-xs px-4 py-2">Повторить</button>
        </div>
      </div>
    </div>
  );

  const completed      = metrics?.lecturesCompleted || 0;
  const level          = getLevel(completed);
  const passedLectures = lectures.filter(l => l.status === 'passed');
  const nextLecture     = lectures.find(l => l.status === 'active');

  const badgeIds       = profile?.badges.map(b => b.badge_id) || [];
  const purchased      = profile?.purchased_items || [];

  const unlockedFrames = ['default', 'code',
    ...(badgeIds.length > 0 || purchased.includes('frame_gold')    ? ['gold']       : []),
    ...(badgeIds.includes('CSS reading') || purchased.includes('frame_rainbow') ? ['rainbow'] : []),
    ...(badgeIds.includes('DevTools')    || purchased.includes('frame_glitch')  ? ['glitch']  : []),
    ...(badgeIds.includes('Bug report quality') ? ['crimescene'] : []),
    ...(badgeIds.length >= 5             ? ['crown'] : []),
  ];
  const unlockedBgs = ['default', 'forest', 'console',
    ...(badgeIds.length > 0 || purchased.includes('bg_hive')  ? ['hive']  : []),
    ...(badgeIds.length >= 5 || purchased.includes('bg_amber') ? ['amber'] : []),
  ];

  const handleCraft = async (skill_area: string) => {
    setCrafting(skill_area);
    try {
      await testerApi.craftBadge(skill_area);
      setCraftSuccess(skill_area);
      await loadAll();
      setTimeout(() => setCraftSuccess(null), 3000);
    } catch (e: any) {
      showApiError(e, 'Ошибка крафтинга');
    } finally { setCrafting(null); }
  };

  const TABS: { id: Tab; label: string; icon: IconName }[] = [
    { id: 'favorites',  label: 'Избранное',   icon: 'star'      },
    { id: 'notes',      label: 'Заметки',     icon: 'memo'      },
    { id: 'collection', label: 'Коллекция',   icon: 'floppy'    },
  ];

  const defaultProfile = {
    id: user.id, email: user.email, name: user.name,
    avatar_initials: user.avatar_initials,
    created_at: new Date().toISOString(),
    nickname: user.name, status_quote: '', specialization: '',
    info_box: '', snail_joke: '', avatar_id: 'bug1',
    avatar_frame: 'default', profile_bg: 'default',
    showcase_badges: [], favorite_lecture_id: null, is_public: true,
    custom_avatar: null, gender: null, bug_coins: 0, purchased_items: [],
    stats: { int: 0, per: 0, spd: 0, def: 0, bug_pwr: 0 },
    streak: 0, cards: [], badges: [], craftable: [], favLecture: null,
  } as FullProfile;

  const totalTasks = taskCounts.reduce((s, t) => s + t.count, 0);
  const badgeCount = profile?.badges?.length ?? 0;
  // The chosen profile background theme (unlocked via badges/shop) still
  // applies here, just to the flat card's fill instead of the old RPG
  // window — otherwise picking one in the profile editor would have no
  // visible effect anymore.
  const bgStyle = BG_LIST.find(b => b.id === (profile?.profile_bg as BgId))?.style || {};

  return (
    <div className="min-h-screen" style={{ background: PAGE_GRADIENT }}>
      <Navigation user={user} onLogout={onLogout} />

      {showEdit && (
        <ProfileEditModal
          profile={profile ?? defaultProfile}
          passedLectures={passedLectures}
          unlockedFrames={unlockedFrames}
          unlockedBgs={unlockedBgs}
          onSave={patch => {
            setProfile(p => p ? { ...p, ...patch } : p);
            onUserUpdate?.({ displayName: patch.nickname?.trim() || user.name, gender: patch.gender ?? null });
          }}
          onClose={() => setShowEdit(false)}
        />
      )}

      <div className="max-w-6xl mx-auto px-8 pt-16 pb-16 fade-in">

        {/* ══════════════════════════════════════════════════════════
            PROFILE HERO — flat card, same language as HomePage/course
            pages: rounded-lg, CARD_BG, soft shadow. Replaces the old
            HoMM-style beveled character window.
        ══════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* LEFT: identity card */}
          <Panel className="lg:col-span-2" pad="p-6" style={bgStyle}>
            <div className="flex flex-col sm:flex-row gap-6">
              <div className="shrink-0 flex flex-col items-center gap-3">
                <PixelAvatar
                  id={(profile?.avatar_id || 'bug1') as any}
                  frame={(profile?.avatar_frame || 'default') as FrameId}
                  size={88}
                  customSrc={profile?.custom_avatar}
                  animate
                />
                <button
                  onClick={() => setShowEdit(true)}
                  className="rounded-lg font-geist font-semibold cursor-pointer flex items-center gap-1.5 px-3 py-1.5"
                  style={{ fontSize: 12, background: `${ACCENT}18`, color: ACCENT }}
                >
                  <Icon name="pencil" size={12} color="currentColor" /> Изменить
                </button>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-montserrat font-bold" style={{ fontSize: 20, color: TEXT_PRIMARY, letterSpacing: TRACK_WIDE }}>
                    {profile?.nickname || user.name}
                  </span>
                  <span
                    className="font-montserrat font-medium inline-block"
                    style={{ fontSize: 10, letterSpacing: TRACK_WIDE, color: PAGE_BG, background: BADGE_BG, border: `1px solid ${BADGE_BORDER}`, borderRadius: 4, padding: '2px 6px' }}
                  >
                    TESTER
                  </span>
                  {!profile?.is_public && <Icon name="lock" size={12} color={TEXT_MUTED} />}
                  {myPresence?.birthday && (
                    <span className="font-geist text-xs flex items-center gap-1" style={{ color: TEXT_MUTED }}>
                      <Icon name="star" size={12} color={TEXT_MUTED} /> {formatBirthday(myPresence.birthday)}
                    </span>
                  )}
                </div>
                {profile?.specialization && (
                  <p className="font-geist text-xs mb-2" style={{ color: TEXT_MUTED }}>{profile.specialization}</p>
                )}
                {profile?.status_quote && (
                  <p className="font-geist text-sm italic mb-3" style={{ color: 'rgba(197, 198, 199,0.7)', borderLeft: `2px solid ${ACCENT}40`, paddingLeft: 10 }}>
                    "{profile.status_quote}"
                  </p>
                )}

                <div className="flex flex-wrap gap-x-5 gap-y-1 mb-4 font-geist text-xs" style={{ color: TEXT_MUTED }}>
                  {profile?.created_at && (
                    <span>В гильдии с {parseServerDate(profile.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { label: 'Пройдено',  value: completed,                        color: ACCENT },
                    { label: 'Точность',  value: `${metrics?.averageScore || 0}%`,  color: '#EF9F27' },
                    ...(premiumPoints ? [{ label: 'Премиальные баллы', value: premiumPoints.premium_points, color: '#7F77DD' }] : []),
                  ].map((m, i) => (
                    <div key={i} className="rounded-lg p-3 text-center" style={{ background: 'rgba(197, 198, 199,0.04)' }}>
                      <p className="font-geist" style={{ fontSize: 11, color: TEXT_MUTED }}>{m.label}</p>
                      <p className="font-montserrat font-bold mt-0.5" style={{ color: m.color, fontSize: 17 }}>{m.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Panel>

          {/* RIGHT: level + achievements + next-course CTA */}
          <div className="space-y-4">
            <Panel pad="p-5">
              <div className="flex items-center justify-between mb-4">
                <LevelBadge lecturesCompleted={completed} size="sm" />
                <span className="font-geist text-xs flex items-center gap-1.5" style={{ color: ACCENT }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: ACCENT }} /> ONLINE
                </span>
              </div>

              <SectionLabel>Достижения {badgeCount}</SectionLabel>
              {badgeCount > 0 ? (
                <div className="flex flex-wrap gap-2 mb-1">
                  {profile!.badges.slice(0, 8).map(b => {
                    const meta = BADGE_META[b.badge_id];
                    return (
                      <div
                        key={b.id}
                        title={meta?.name || b.badge_id}
                        className="rounded-lg flex items-center justify-center"
                        style={{ width: 34, height: 34, background: `${meta?.color || ACCENT}18`, border: `1px solid ${meta?.color || ACCENT}40` }}
                      >
                        <Icon name={meta?.icon || 'bug'} size={22} color={meta?.color || ACCENT} />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="font-geist text-xs" style={{ color: TEXT_MUTED }}>Пока нет ачивок — пройди первую лекцию</p>
              )}
            </Panel>

            {nextLecture && (
              <button
                onClick={() => navigate(`/lecture/${nextLecture.id}/quiz`)}
                className="w-full rounded-lg font-geist font-semibold cursor-pointer flex items-center justify-center gap-2 py-3 transition-transform hover:-translate-y-0.5"
                style={{ background: '#EF9F27', color: PAGE_BG, fontSize: 14 }}
              >
                Продолжить обучение <Icon name="rocket" size={22} color={PAGE_BG} />
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT column: presence + tabs */}
          <div className="lg:col-span-2 space-y-6">
            {/* ══════════════════════════════════════════════════════
                МОЁ РАБОЧЕЕ ВРЕМЯ — powers "работают сейчас" on the team
                dashboard and the team news feed's vacation start/end items.
            ══════════════════════════════════════════════════════ */}
            <Panel pad="p-5">
              <SectionLabel>Моё рабочее время</SectionLabel>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div>
                  <label className="block font-geist mb-1" style={{ fontSize: 11, color: TEXT_MUTED }}>Начало</label>
                  <select value={presenceForm.work_start} onChange={e => setPresenceForm(f => ({ ...f, work_start: e.target.value }))} className="pixel-input">
                    <option value="">—</option>
                    {HOUR_OPTIONS.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block font-geist mb-1" style={{ fontSize: 11, color: TEXT_MUTED }}>Конец</label>
                  <select value={presenceForm.work_end} onChange={e => setPresenceForm(f => ({ ...f, work_end: e.target.value }))} className="pixel-input">
                    <option value="">—</option>
                    {HOUR_OPTIONS.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              </div>
              {/* Own full-width row — timezone labels ("Владивосток (UTC+10)")
                  were getting clipped sharing a quarter-width column with the
                  three short fields above. */}
              <div className="mb-3">
                <label className="block font-geist mb-1" style={{ fontSize: 11, color: TEXT_MUTED }}>Часовой пояс</label>
                <select value={presenceForm.timezone} onChange={e => setPresenceForm(f => ({ ...f, timezone: e.target.value }))} className="pixel-input w-full">
                  {TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
                </select>
              </div>
              <div className="flex gap-1 mb-3">
                {WEEKDAY_LABELS.map(([d, label]) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => togglePresenceDay(d)}
                    className="flex-1 py-1.5 rounded-lg text-xs font-geist cursor-pointer"
                    style={{ background: presenceForm.days.has(d) ? `${ACCENT}20` : 'rgba(197, 198, 199,0.04)', color: presenceForm.days.has(d) ? ACCENT : TEXT_MUTED }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button onClick={savePresence} disabled={savingPresence} className="btn-secondary text-xs px-4 py-2 disabled:opacity-50">
                {savingPresence ? '...' : 'Сохранить'}
              </button>
              {myPresence?.currentLeave && (
                <p className="text-xs font-geist mt-3" style={{ color: '#EF9F27' }}>
                  Сейчас отмечено: {LEAVE_LABELS[myPresence.currentLeave.type]}
                  {myPresence.currentLeave.end_date ? ` до ${myPresence.currentLeave.end_date}` : ' (без даты окончания)'} — изменить может тимлид.
                </p>
              )}
            </Panel>

            {/* ══════════════════════════════════════════════════════
                TAB BAR
            ══════════════════════════════════════════════════════ */}
            <div className="flex flex-wrap gap-1.5">
              {TABS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className="rounded-lg font-geist font-semibold cursor-pointer px-3.5 py-2 flex items-center gap-1.5 transition-colors"
                  style={{
                    fontSize: 13,
                    background: tab === t.id ? ACCENT : 'rgba(197, 198, 199,0.06)',
                    color: tab === t.id ? PAGE_BG : 'rgba(197, 198, 199,0.6)',
                  }}
                >
                  <Icon name={t.icon} size={22} color="currentColor" />
                  {t.label}
                </button>
              ))}
            </div>

            {/* ══════════════════════════════════════════════════════
                FAVORITES
            ══════════════════════════════════════════════════════ */}
            {tab === 'favorites' && (
              profile?.favLecture ? (
                <Panel className="flex items-center gap-4">
                  <Icon name="star" size={26} color="#EF9F27" style={{ flexShrink: 0 }} />
                  <div className="flex-1 min-w-0">
                    <p className="font-geist font-semibold" style={{ fontSize: 12, color: '#EF9F27', letterSpacing: TRACK_WIDE }}>ЛЮБИМАЯ ЛЕКЦИЯ</p>
                    <p className="font-montserrat font-semibold text-sm mt-0.5" style={{ color: TEXT_PRIMARY }}>{profile.favLecture.title}</p>
                    <p className="font-geist text-xs" style={{ color: TEXT_MUTED }}>
                      {profile.favLecture.skill_area}
                      {profile.favLecture.score != null && <> · <span style={{ color: ACCENT }}>{Math.round(profile.favLecture.score)}%</span></>}
                    </p>
                  </div>
                  <button onClick={() => navigate(`/lecture/${profile.favLecture!.id}/quiz`)} className="btn-amber text-xs px-3 py-2 cursor-pointer shrink-0">Перечитать <Icon name="chevronRight" size={16} color="currentColor" /></button>
                </Panel>
              ) : (
                <Panel className="text-center py-10">
                  <Icon name="star" size={28} color="rgba(197, 198, 199,0.15)" />
                  <p className="font-geist text-xs mt-3" style={{ color: TEXT_MUTED }}>Выбери любимую лекцию в редакторе профиля</p>
                </Panel>
              )
            )}

            {/* ══════════════════════════════════════════════════════
                NOTES
            ══════════════════════════════════════════════════════ */}
            {tab === 'notes' && (
              <Panel className="text-center py-16">
                <Icon name="memo" size={32} color="rgba(197, 198, 199,0.15)" />
                <p className="font-montserrat font-semibold mt-4" style={{ color: TEXT_MUTED, fontSize: 14, letterSpacing: TRACK_WIDE }}>ЗАМЕТКИ</p>
                <p className="font-geist text-xs mt-2" style={{ color: TEXT_MUTED }}>Здесь будут твои заметки с курсов</p>
              </Panel>
            )}

            {/* ══════════════════════════════════════════════════════
                COLLECTION — trading cards + craftable badges.
            ══════════════════════════════════════════════════════ */}
            {tab === 'collection' && (
              <div className="space-y-5">
                <div>
                  <SectionLabel>Карточки</SectionLabel>
                  {(profile?.cards?.length ?? 0) === 0 ? (
                    <Panel className="text-center py-8">
                      <Icon name="floppy" size={24} color="rgba(197, 198, 199,0.15)" />
                      <p className="font-geist text-xs mt-2" style={{ color: TEXT_MUTED }}>Пройди лекцию — получишь первую карточку</p>
                    </Panel>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {profile!.cards.map(c => {
                        const color = RARITY_COLORS[c.rarity];
                        return (
                          <div key={c.id} className="rounded-lg p-3" style={{ background: 'rgba(197, 198, 199,0.04)', border: `1px solid ${color}40` }}>
                            <p className="font-geist font-semibold" style={{ fontSize: 10, color, letterSpacing: TRACK_WIDE }}>{RARITY_LABEL[c.rarity] || 'CARD'}</p>
                            <p className="font-geist text-xs font-semibold mt-1" style={{ color: TEXT_PRIMARY }}>{c.skill_area}</p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div>
                  <SectionLabel>Значки</SectionLabel>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(profile?.badges ?? []).map(b => {
                      const meta = BADGE_META[b.badge_id];
                      return (
                        <div key={b.id} className="rounded-lg p-3 flex items-center gap-2" style={{ background: 'rgba(197, 198, 199,0.04)' }}>
                          <Icon name={meta?.icon || 'bug'} size={22} color={meta?.color || ACCENT} />
                          <span className="font-geist text-xs font-semibold" style={{ color: TEXT_PRIMARY }}>{meta?.name || b.badge_id}</span>
                        </div>
                      );
                    })}
                    {(profile?.craftable ?? []).map(skill_area => (
                      <div key={skill_area} className="rounded-lg p-3 flex items-center justify-between gap-2" style={{ background: 'rgba(197, 198, 199,0.04)', border: '1px solid rgba(239,159,39,0.4)' }}>
                        <span className="font-geist text-xs" style={{ color: 'rgba(197, 198, 199,0.75)' }}>Собран весь набор «{skill_area}»</span>
                        <button onClick={() => handleCraft(skill_area)} disabled={crafting === skill_area} className="btn-amber text-xs px-3 py-1.5 shrink-0 cursor-pointer">
                          {crafting === skill_area ? '...' : craftSuccess === skill_area ? '✓ Готово' : 'Скрафтить'}
                        </button>
                      </div>
                    ))}
                    {(profile?.badges?.length ?? 0) === 0 && (profile?.craftable?.length ?? 0) === 0 && (
                      <Panel className="text-center py-8 sm:col-span-2">
                        <Icon name="gear" size={24} color="rgba(197, 198, 199,0.15)" />
                        <p className="font-geist text-xs mt-2" style={{ color: TEXT_MUTED }}>Собери все карточки одной темы, чтобы скрафтить значок</p>
                      </Panel>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT column: quick links + stats */}
          <div className="space-y-4">
            <Panel pad="p-2">
              <QuickLinkRow icon="star" label="Избранное" onClick={() => setTab('favorites')} showDivider />
              <QuickLinkRow icon="memo" label="Заметки" onClick={() => setTab('notes')} showDivider />
              <QuickLinkRow icon="card" label="Магазин" onClick={() => {}} showDivider={false} disabled />
            </Panel>

            {/* "Статистика" (per-task-type counts — Прелендинг/Оффер/Вайт/etc.)
                temporarily pulled, same as Чеклисты elsewhere (Navigation.tsx,
                App.tsx) — these task types belong to the checklist feature,
                which is off for now. Commented out, not deleted; taskCounts/
                totalTasks above are left wired up so this drops back in
                as-is once checklists come back. */}
            {/* <Panel pad="p-5">
              <SectionLabel>Статистика</SectionLabel>
              {taskCounts.length > 0 ? (
                <div className="space-y-3">
                  {taskCounts.map(t => (
                    <div key={t.task_type} className="flex items-center justify-between">
                      <span className="font-geist font-semibold" style={{ fontSize: 12, color: t.color, letterSpacing: TRACK_WIDE }}>{t.name.toUpperCase()}</span>
                      <span className="font-montserrat font-bold" style={{ fontSize: 13, color: t.count > 0 ? t.color : TEXT_MUTED }}>{t.count}</span>
                    </div>
                  ))}
                  <div className="pt-2 flex items-center justify-between" style={{ borderTop: '1px solid rgba(197, 198, 199,0.08)' }}>
                    <span className="font-geist text-xs" style={{ color: TEXT_MUTED }}>ВСЕГО</span>
                    <span className="font-montserrat font-bold text-sm" style={{ color: TEXT_PRIMARY }}>{totalTasks}</span>
                  </div>
                </div>
              ) : (
                <p className="font-geist text-xs" style={{ color: TEXT_MUTED }}>Нет данных</p>
              )}
            </Panel> */}
          </div>
        </div>
      </div>
    </div>
  );
}
