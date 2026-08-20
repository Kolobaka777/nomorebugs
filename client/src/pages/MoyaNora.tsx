import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navigation from '../components/Navigation';
import FrogLoader from '../components/FrogLoader';
import PixelAvatar from '../components/PixelAvatar';
import ProfileEditModal from '../components/ProfileEditModal';
import { primeAvatarCache } from '../components/Navigation';
import { testerApi, rewardsApi, presenceApi } from '../api';
import {
  Lecture, SKillChart,
  FullProfile, PresenceEntry, CourseFavorite, CourseNoteGroup,
} from '../types';
import { AVATAR_LIST, FRAME_LIST, BG_LIST, type BgId, type FrameId, type AvatarId } from '../components/PixelAvatar';
import Icon, { IconName } from '../components/Icon';
import { clickableProps } from '../utils/a11y';
import { parseServerDate } from '../utils/date';
import { apiErrorMessage, showApiError } from '../utils/toast';
import { celebrateAchievements } from '../utils/achievements';
import { TIMEZONES, HOUR_OPTIONS } from '../utils/timezones';
import { BADGE_META, ACHIEVEMENTS_CATALOG } from '../utils/badges';
import { shopItemFor } from '../utils/shop';
import { ROLE_META, ROLE_SHORT } from '../utils/roles';
import { counted } from '../utils/plural';
import { BookOpenIcon, PagesIcon, CapIcon } from '../components/CatalogIcons';
import { PAGE_GRADIENT, PAGE_BG, CARD_BG, TEXT_PRIMARY, TEXT_MUTED, ACCENT, TRACK_WIDE, ERROR } from '../utils/theme';

interface MoyaNoraProps { user: any; onLogout: () => void; onUserUpdate?: (patch: Record<string, any>) => void; }

type Tab = 'favorites' | 'notes' | 'shop' | 'collection' | 'presence';

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

// Kept only as a reference for whoever wires a before/after summary into
// this page — nothing calls it today.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  return { text: `+${avg.toFixed(1)} пункта в среднем — ты явно не в спячке`, color: '#EF9F27' };
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

function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <p className="font-montserrat font-semibold" style={{ fontSize: 14, color: TEXT_MUTED, letterSpacing: TRACK_WIDE }}>{children}</p>
      {right}
    </div>
  );
}

// Sidebar navigation row — replaces the old horizontal tab-chip bar with a
// vertical "you are here" list (per the reference design): active row is a
// filled accent pill with the chevron pointing back into the row, inactive
// rows are plain text with a muted chevron pointing forward and a small
// tinted icon chip naming the section.
function NavRow({ icon, label, color, active, onClick }: {
  icon: IconName; label: string; color: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors"
      style={{ background: active ? color : 'transparent', color: active ? PAGE_BG : 'rgba(197, 198, 199,0.75)' }}
    >
      <Icon name={active ? 'chevronLeft' : 'chevronRight'} size={16} color={active ? PAGE_BG : 'rgba(197, 198, 199,0.35)'} />
      <span className="font-geist text-xs font-semibold flex-1 text-left" style={{ letterSpacing: TRACK_WIDE }}>{label.toUpperCase()}</span>
      <span
        className="rounded-full flex items-center justify-center shrink-0"
        style={{ width: 26, height: 26, background: active ? 'rgba(0, 0, 0, 0.18)' : `${color}20` }}
      >
        <Icon name={icon} size={14} color={active ? PAGE_BG : color} />
      </span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function MoyaNora({ user, onLogout, onUserUpdate }: MoyaNoraProps) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('favorites');

  const [metrics, setMetrics]           = useState<any>(null);
  const [lectures, setLectures]         = useState<Lecture[]>([]);
  const [profile, setProfile]           = useState<FullProfile | null>(null);
  const [loading, setLoading]           = useState(true);
  const [showEdit, setShowEdit]         = useState(false);
  const [crafting, setCrafting]         = useState<string | null>(null);
  const [craftSuccess, setCraftSuccess] = useState<string | null>(null);
  const [premiumPoints, setPremiumPoints] = useState<{ premium_points: number; history: any[] } | null>(null);
  const [loadError, setLoadError] = useState('');
  const [myPresence, setMyPresence] = useState<PresenceEntry | null>(null);
  const [presenceForm, setPresenceForm] = useState({ work_start: '', work_end: '', days: new Set(['1', '2', '3', '4', '5']), timezone: 'Europe/Moscow' });
  const [savingPresence, setSavingPresence] = useState(false);
  const [favorites, setFavorites]       = useState<CourseFavorite[]>([]);
  const [noteGroups, setNoteGroups]     = useState<CourseNoteGroup[]>([]);
  const [achievementsExpanded, setAchievementsExpanded] = useState(false);
  const [shopBuyingId, setShopBuyingId] = useState<string | null>(null);
  const [shopError, setShopError]       = useState('');

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
      // getHistory/getBeforeAfter used to be fetched here too — two requests
      // on every load of this page whose results were stored in state and
      // never rendered by anything. Removed rather than kept "for later".
      const [metricsRes, lecturesRes, profileRes] = await Promise.all([
        testerApi.getMetrics(),
        testerApi.getLectures(),
        testerApi.getProfileFull(),
      ]);

      // Premium points is a secondary widget on this page — a toast on
      // failure (rather than blocking the whole cabinet) is enough; the
      // rest of the page still fully works without it.
      rewardsApi.getMyPremiumPoints().then(r => setPremiumPoints(r.data)).catch((err: any) => showApiError(err, 'Не удалось загрузить премиальные баллы'));
      testerApi.getFavorites().then(r => setFavorites(r.data)).catch((err: any) => showApiError(err, 'Не удалось загрузить избранное'));
      testerApi.getNotes().then(r => setNoteGroups(r.data)).catch((err: any) => showApiError(err, 'Не удалось загрузить заметки'));
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
      setLoadError(apiErrorMessage(err, 'Не удалось загрузить кабинет'));
    } finally {
      setLoading(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen" style={{ background: PAGE_GRADIENT }}>
      <Navigation user={user} onLogout={onLogout} />
      <FrogLoader />
    </div>
  );

  if (loadError) return (
    <div className="min-h-screen" style={{ background: PAGE_GRADIENT }}>
      <Navigation user={user} onLogout={onLogout} />
      <div className="max-w-4xl mx-auto px-6 pt-16 pb-8">
        <div className="card text-center py-10">
          <p className="text-sm font-sans mb-4 break-words" style={{ color: ERROR }}>{loadError}</p>
          <button onClick={() => { setLoading(true); loadAll(); }} className="btn-secondary text-xs px-4 py-2">Повторить</button>
        </div>
      </div>
    </div>
  );

  const completed      = metrics?.lecturesCompleted || 0;
  const nextLecture     = lectures.find(l => l.status === 'active');

  const badgeIds       = profile?.badges.map(b => b.badge_id) || [];
  const purchased      = profile?.purchased_items || [];
  // Personal accent — the "Цветовая схема" picker in the edit modal, applied
  // here to everything that reads as "your" color (level box, edit button,
  // active nav row, Магазин's "own" icon) instead of always the site's
  // fixed teal — otherwise that picker would have no visible effect at all.
  const accent = profile?.profile_accent_color || ACCENT;

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
  // Avatars: most of the 9 frogs are free-equip; 'frog1' is the shop's one
  // priced tile (see server SHOP_CATALOG), 'frog9' unlocks the first time
  // any badge is earned — mirrors the reference design's mixed price-lock/
  // achievement-lock/free avatar grid instead of leaving everything free.
  const unlockedAvatars = ['frog2', 'frog3', 'frog4', 'frog5', 'frog6', 'frog7', 'frog8',
    ...(purchased.includes('avatar_frog1') ? ['frog1'] : []),
    ...(badgeIds.length > 0 ? ['frog9'] : []),
  ];

  // The single achievement chosen to show off (edit modal's "Достижение
  // напоказ", up to 3 picked — only the first is featured here, matching
  // the reference's single highlighted card). Falls back to the next
  // not-yet-earned achievement as a goal teaser when nothing's picked (or
  // the pick was for a badge since lost relevance) — the reference always
  // has something in this slot, never an empty gap, and "closest real goal"
  // is honest data rather than a fabricated placeholder.
  const pickedShowcaseId = profile?.showcase_badges?.find(id => badgeIds.includes(id));
  const nextGoal = !pickedShowcaseId ? ACHIEVEMENTS_CATALOG.find(a => !badgeIds.includes(a.id)) : undefined;
  const showcaseId = pickedShowcaseId ?? nextGoal?.id;
  const showcaseMeta = showcaseId ? BADGE_META[showcaseId] : undefined;
  const showcaseDescription = showcaseId ? ACHIEVEMENTS_CATALOG.find(a => a.id === showcaseId)?.description : undefined;
  const showcaseIsGoal = !pickedShowcaseId && !!nextGoal;

  const handleCraft = async (skill_area: string) => {
    setCrafting(skill_area);
    try {
      const res = await testerApi.craftBadge(skill_area);
      celebrateAchievements(res.data.newAchievements);
      setCraftSuccess(skill_area);
      await loadAll();
      setTimeout(() => setCraftSuccess(null), 3000);
    } catch (e: any) {
      showApiError(e, 'Ошибка крафтинга');
    } finally { setCrafting(null); }
  };

  const removeFavorite = async (f: CourseFavorite) => {
    setFavorites(prev => prev.filter(x => !(x.course_type === f.course_type && x.course_id === f.course_id)));
    try {
      await testerApi.removeFavorite(f.course_type, f.course_id);
    } catch (e: any) {
      showApiError(e, 'Не удалось убрать из избранного');
      testerApi.getFavorites().then(r => setFavorites(r.data)).catch(() => {});
    }
  };

  const deleteNote = async (noteId: number) => {
    setNoteGroups(prev => prev.map(g => ({ ...g, notes: g.notes.filter(n => n.id !== noteId) })).filter(g => g.notes.length > 0));
    try {
      await testerApi.deleteNote(noteId);
    } catch (e: any) {
      showApiError(e, 'Не удалось удалить заметку');
      testerApi.getNotes().then(r => setNoteGroups(r.data)).catch(() => {});
    }
  };

  // Equip is instant (no separate "save" step) — clicking an already-owned
  // avatar/frame/background in the shop just wears it, same one-click
  // mental model as the rest of the shop's "click to get/use" cards.
  const equipItem = async (patch: Record<string, string>) => {
    try {
      await testerApi.updateProfile(patch);
      setProfile(p => p ? { ...p, ...patch } : p);
      if (patch.avatar_id !== undefined || patch.avatar_frame !== undefined) {
        primeAvatarCache(user.id, {
          avatar_id: patch.avatar_id ?? profile?.avatar_id ?? 'frog1',
          avatar_frame: patch.avatar_frame ?? profile?.avatar_frame ?? 'default',
          custom_avatar: profile?.custom_avatar ?? null,
        });
      }
    } catch (e: any) {
      showApiError(e, 'Не удалось применить');
    }
  };

  const buyAndEquip = async (itemId: string, kind: 'frame' | 'bg' | 'avatar', refId: string) => {
    setShopError('');
    setShopBuyingId(itemId);
    try {
      const res = await testerApi.buyShopItem(itemId);
      setProfile(p => p ? { ...p, bug_coins: res.data.newCoins, purchased_items: [...p.purchased_items, itemId] } : p);
      await equipItem(kind === 'frame' ? { avatar_frame: refId } : kind === 'bg' ? { profile_bg: refId } : { avatar_id: refId });
    } catch (e: any) {
      setShopError(apiErrorMessage(e, 'Не удалось купить'));
    } finally {
      setShopBuyingId(null);
    }
  };

  const NAV_ITEMS: { id: Tab; label: string; icon: IconName; color: string }[] = [
    { id: 'favorites',  label: 'Избранное',      icon: 'star',  color: '#EF9F27' },
    { id: 'notes',      label: 'Заметки',        icon: 'memo',  color: ERROR },
    { id: 'shop',       label: 'Магазин',        icon: 'card',  color: accent },
    { id: 'collection', label: 'Коллекция',      icon: 'floppy', color: '#7F77DD' },
    { id: 'presence',   label: 'Рабочее время',  icon: 'clock', color: TEXT_MUTED },
  ];

  const defaultProfile = {
    id: user.id, email: user.email, name: user.name, phone: null,
    avatar_initials: user.avatar_initials,
    created_at: new Date().toISOString(),
    nickname: user.name, status_quote: '', specialization: '',
    info_box: '', snail_joke: '', avatar_id: 'frog1',
    avatar_frame: 'default', profile_bg: 'default', profile_accent_color: ACCENT,
    showcase_badges: [], favorite_lecture_id: null, is_public: true,
    custom_avatar: null, gender: null, bug_coins: 0, purchased_items: [],
    stats: { int: 0, per: 0, spd: 0, def: 0, bug_pwr: 0 },
    cards: [], badges: [], craftable: [], favLecture: null,
    lecturesCompleted: 0, averageScore: 0,
    coursesProposed: 0, coursesApproved: 0, guidesProposed: 0, guidesApproved: 0,
  } as FullProfile;

  const badgeCount = profile?.badges?.length ?? 0;
  // The chosen profile background theme (unlocked via badges/shop) still
  // applies here, just to the flat card's fill instead of the old RPG
  // window — otherwise picking one in the profile editor would have no
  // visible effect anymore.
  const bgStyle = BG_LIST.find(b => b.id === (profile?.profile_bg as BgId))?.style || {};
  const roleColor = (ROLE_META[user.role] || ROLE_META.tester).color;

  const statItems = [
    { label: 'КУРСОВ ПРОЙДЕНО',        value: completed },
    { label: 'ТОЧНОСТЬ ПРОХОЖДЕНИЯ',   value: `${metrics?.averageScore || 0}%` },
    ...(premiumPoints ? [{ label: 'ПРЕМИАЛЬНЫЕ БАЛЛЫ', value: premiumPoints.premium_points }] : []),
  ];

  return (
    <div className="min-h-screen" style={{ background: PAGE_GRADIENT }}>
      <Navigation user={user} onLogout={onLogout} />

      {showEdit && (
        <ProfileEditModal
          profile={profile ?? defaultProfile}
          unlockedFrames={unlockedFrames}
          unlockedBgs={unlockedBgs}
          unlockedAvatars={unlockedAvatars}
          badgeIds={badgeIds}
          onPurchase={(item_id, newCoins) => {
            setProfile(p => p ? { ...p, bug_coins: newCoins, purchased_items: [...p.purchased_items, item_id] } : p);
          }}
          onSave={patch => {
            setProfile(p => p ? { ...p, ...patch } : p);
            onUserUpdate?.({ displayName: patch.nickname?.trim() || user.name, gender: patch.gender ?? null });
            // Navigation no longer refetches the avatar on every mount (see
            // its own comment) — push the new one straight into its cache
            // so the header picks it up on the next navigation instead of
            // keeping the stale one until some unrelated cache eviction.
            if (patch.avatar_id !== undefined || patch.avatar_frame !== undefined || patch.custom_avatar !== undefined) {
              primeAvatarCache(user.id, {
                avatar_id: patch.avatar_id ?? profile?.avatar_id ?? 'frog1',
                avatar_frame: patch.avatar_frame ?? profile?.avatar_frame ?? 'default',
                custom_avatar: patch.custom_avatar !== undefined ? patch.custom_avatar : (profile?.custom_avatar ?? null),
              });
            }
          }}
          onClose={() => setShowEdit(false)}
        />
      )}

      <div className="max-w-6xl mx-auto px-8 pt-16 pb-16 fade-in">

        {/* ══════════════════════════════════════════════════════════
            PROFILE HERO — identity card (big square avatar + name/quote
            + stat boxes) on the left, level/showcase card + edit button
            on the right. Matches the reference 1:1 layout.
        ══════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* LEFT: identity card */}
          <Panel className="lg:col-span-2" pad="p-6" style={{ border: `1px solid ${accent}70`, ...bgStyle }}>
            <div className="flex flex-col sm:flex-row gap-6">
              <div className="shrink-0">
                <PixelAvatar
                  id={(profile?.avatar_id || 'frog1') as AvatarId}
                  frame={(profile?.avatar_frame || 'default') as FrameId}
                  size={132}
                  customSrc={profile?.custom_avatar}
                  animate
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-montserrat font-bold break-words min-w-0" style={{ fontSize: 20, color: TEXT_PRIMARY, letterSpacing: TRACK_WIDE }}>
                    {profile?.nickname || user.name}
                  </span>
                  {/* Was the literal string "TESTER" in teal, which is
                      what a lead saw on their own profile. */}
                  <span
                    className="font-montserrat font-medium inline-block"
                    style={{ fontSize: 10, letterSpacing: TRACK_WIDE, color: PAGE_BG, background: `${roleColor}99`, border: `1px solid ${roleColor}CC`, borderRadius: 4, padding: '2px 6px' }}
                  >
                    {ROLE_SHORT[user.role] || ROLE_SHORT.tester}
                  </span>
                  {!profile?.is_public && <Icon name="lock" size={12} color={TEXT_MUTED} />}
                  {myPresence?.birthday && (
                    <span className="font-geist text-xs flex items-center gap-1" style={{ color: TEXT_MUTED }}>
                      <Icon name="star" size={12} color={TEXT_MUTED} /> {formatBirthday(myPresence.birthday)}
                    </span>
                  )}
                </div>
                {profile?.specialization && (
                  <p className="font-geist text-xs mb-2 break-words" style={{ color: TEXT_MUTED }}>{profile.specialization}</p>
                )}
                {profile?.status_quote && (
                  <p className="font-geist text-sm italic mb-2 break-words" style={{ color: 'rgba(197, 198, 199,0.7)', borderLeft: `2px solid ${accent}40`, paddingLeft: 10 }}>
                    "{profile.status_quote}"
                  </p>
                )}
                {profile?.info_box && (
                  <p className="font-geist text-xs mb-3 break-words" style={{ color: 'rgba(197, 198, 199,0.55)' }}>{profile.info_box}</p>
                )}

                <div className="flex flex-wrap gap-x-5 gap-y-1 mb-4 font-geist text-xs" style={{ color: TEXT_MUTED }}>
                  {profile?.created_at && (
                    <span>*В Жабьем Бору с {parseServerDate(profile.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                  )}
                </div>
              </div>

              {/* Stat boxes — stacked, right-aligned, matching the
                  reference's two bordered boxes beside the identity block. */}
              {/* Row on a phone, column from sm up. The row has to wrap: three
                  150px tiles plus gaps do not fit in a 390px viewport, and
                  without wrapping they pushed the whole page 132px wide
                  horizontally instead of stacking. */}
              <div className="flex flex-wrap sm:flex-nowrap sm:flex-col gap-2 shrink-0" style={{ minWidth: 0 }}>
                {statItems.map((m, i) => (
                  <div key={i} className="rounded-lg px-4 py-2.5 text-right flex-1 sm:flex-none" style={{ background: 'rgba(0, 0, 0, 0.2)', border: '1px solid rgba(197, 198, 199,0.15)', minWidth: 140 }}>
                    <p className="font-montserrat font-bold" style={{ fontSize: 19, color: TEXT_PRIMARY }}>{m.value}</p>
                    <p className="font-geist" style={{ fontSize: 10, color: TEXT_MUTED, letterSpacing: TRACK_WIDE }}>{m.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </Panel>

          {/* RIGHT: achievement showcase + edit button. The bordered
              "3 LEVEL" box that used to sit opposite the ONLINE dot is
              gone along with the rest of the level system — the courses
              count and the badges below already carry that information. */}
          <div className="space-y-3">
            <Panel pad="p-5" style={{ border: `1px solid ${accent}70` }}>
              <div className="flex items-center justify-end mb-3">
                <span className="font-geist text-xs flex items-center gap-1.5" style={{ color: accent }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: accent }} /> ONLINE
                </span>
              </div>

              {showcaseMeta && (
                <div className="rounded-lg p-3 flex items-center gap-3 relative" style={{ background: `${accent}12`, border: `1px solid ${accent}30`, opacity: showcaseIsGoal ? 0.75 : 1 }}>
                  <div className="rounded-lg flex items-center justify-center shrink-0" style={{ width: 36, height: 36, background: `${showcaseMeta.color}20` }}>
                    <Icon name={showcaseMeta.icon} size={20} color={showcaseMeta.color} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-geist font-semibold text-xs break-words" style={{ color: TEXT_PRIMARY }}>{showcaseMeta.name}</p>
                    {showcaseDescription && (
                      <p className="font-geist text-xs break-words" style={{ color: TEXT_MUTED, fontSize: 10 }}>{showcaseDescription}</p>
                    )}
                  </div>
                  <span
                    className="font-geist font-semibold rounded shrink-0 self-start"
                    style={{ fontSize: 9, letterSpacing: TRACK_WIDE, padding: '2px 6px', color: showcaseIsGoal ? TEXT_MUTED : accent, background: showcaseIsGoal ? 'rgba(197, 198, 199,0.1)' : `${accent}20` }}
                  >
                    {showcaseIsGoal ? 'ЦЕЛЬ' : 'НАПОКАЗ'}
                  </span>
                </div>
              )}
            </Panel>

            <button
              onClick={() => setShowEdit(true)}
              className="w-full rounded-lg font-geist font-semibold cursor-pointer flex items-center justify-center gap-2 py-3 transition-all hover:brightness-110"
              style={{ background: accent, color: PAGE_BG, fontSize: 14 }}
            >
              Редактировать профиль <Icon name="pencil" size={16} color={PAGE_BG} />
            </button>

            {/* Proposals — only shown once the tester has actually
                submitted one, so it doesn't clutter the cabinet for
                everyone who's never used "Предложить курс/гайд". */}
            {profile && ((profile.coursesProposed ?? 0) > 0 || (profile.guidesProposed ?? 0) > 0) && (
              <Panel pad="p-5">
                <SectionLabel>Мои предложения</SectionLabel>
                <div className="space-y-2">
                  {profile.coursesProposed > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="font-geist text-xs flex items-center gap-1.5" style={{ color: TEXT_MUTED }}>
                        <Icon name="lightbulb" size={14} color={TEXT_MUTED} /> Курсов предложено
                      </span>
                      <span className="font-montserrat font-bold text-sm" style={{ color: TEXT_PRIMARY }}>
                        {profile.coursesProposed} <span style={{ color: accent, fontSize: 11 }}>({profile.coursesApproved} одобрено)</span>
                      </span>
                    </div>
                  )}
                  {profile.guidesProposed > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="font-geist text-xs flex items-center gap-1.5" style={{ color: TEXT_MUTED }}>
                        <Icon name="books" size={14} color={TEXT_MUTED} /> Гайдов предложено
                      </span>
                      <span className="font-montserrat font-bold text-sm" style={{ color: TEXT_PRIMARY }}>
                        {profile.guidesProposed} <span style={{ color: accent, fontSize: 11 }}>({profile.guidesApproved} одобрено)</span>
                      </span>
                    </div>
                  )}
                </div>
              </Panel>
            )}

            {nextLecture && (
              <button
                onClick={() => navigate(`/lecture/${nextLecture.id}/quiz`)}
                className="w-full rounded-lg font-geist font-semibold cursor-pointer flex items-center justify-center gap-2 py-3 transition-all hover:brightness-110"
                style={{ background: '#EF9F27', color: PAGE_BG, fontSize: 14 }}
              >
                Продолжить обучение <Icon name="rocket" size={22} color={PAGE_BG} />
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT column: active tab content only — which tab is chosen from
              the sidebar nav list on the right, not a horizontal tab bar. */}
          <div className="lg:col-span-2">

            {/* ══════════════════════════════════════════════════════
                FAVORITES
            ══════════════════════════════════════════════════════ */}
            {tab === 'favorites' && (
              favorites.length === 0 ? (
                <Panel className="text-center py-10">
                  <Icon name="star" size={28} color="rgba(197, 198, 199,0.15)" />
                  <p className="font-geist text-xs mt-3" style={{ color: TEXT_MUTED }}>Пока нет избранных курсов — добавляй их звёздочкой в каталоге</p>
                </Panel>
              ) : (
                <div className="space-y-3">
                  {favorites.map(f => {
                    const tagColor = f.color || accent;
                    return (
                    // Outlined in the course's own tag colour, so a list of
                    // favourites reads the same way the catalog does.
                    <div key={`${f.course_type}-${f.course_id}`} className="relative group">
                      <Panel style={{ border: `1px solid ${tagColor}` }}>
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <p className="font-montserrat font-semibold break-words min-w-0" style={{ fontSize: 16, letterSpacing: '1.6px', color: TEXT_PRIMARY }}>{f.title}</p>
                          <span className="font-geist font-semibold rounded shrink-0" style={{ fontSize: 11, padding: '2px 8px', background: `${tagColor}22`, color: tagColor, border: `1px solid ${tagColor}55` }}>{f.tag}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <div className="flex items-center gap-5 flex-wrap font-geist" style={{ fontSize: 12, color: TEXT_MUTED, letterSpacing: TRACK_WIDE }}>
                            {f.course_type === 'custom' ? (
                              <>
                                <span className="flex items-center gap-2"><BookOpenIcon size={15} color="currentColor" />{counted(f.totalLessons ?? 0, ['УРОК', 'УРОКА', 'УРОКОВ'])}</span>
                                <span className="flex items-center gap-2"><PagesIcon size={15} color="currentColor" />{counted(f.totalModules ?? 0, ['МОДУЛЬ', 'МОДУЛЯ', 'МОДУЛЕЙ'])}</span>
                                <span className="flex items-center gap-2"><CapIcon size={15} color="currentColor" />{counted(f.totalTests ?? 0, ['ТЕСТ', 'ТЕСТА', 'ТЕСТОВ'])}</span>
                              </>
                            ) : (
                              <span>{f.score != null ? <span style={{ color: accent }}>{Math.round(f.score)}%</span> : 'Ещё не пройдено'}</span>
                            )}
                          </div>
                          {/* Revealed on hover/focus, as in the design — a
                              row of permanent buttons made a list of
                              favourites read as a list of controls. */}
                          <button
                            onClick={() => navigate(f.course_type === 'custom' ? `/custom-course/${f.course_id}` : `/lecture/${f.course_id}/quiz`)}
                            className="font-geist font-semibold flex items-center gap-1 cursor-pointer shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                            style={{ fontSize: 12, color: TEXT_PRIMARY, letterSpacing: TRACK_WIDE }}
                          >
                            ПЕРЕЙТИ К КУРСУ <Icon name="chevronRight" size={16} color="currentColor" />
                          </button>
                        </div>
                      </Panel>
                      <button
                        onClick={() => removeFavorite(f)}
                        aria-label="Убрать из избранного"
                        className="absolute -top-2.5 -right-2.5 rounded-full flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                        style={{ width: 22, height: 22, background: CARD_BG, border: `1px solid ${ERROR}`, color: ERROR }}
                      >
                        <Icon name="close" size={12} color="currentColor" />
                      </button>
                    </div>
                    );
                  })}
                </div>
              )
            )}

            {/* ══════════════════════════════════════════════════════
                NOTES — aggregated across every custom course, grouped
                one panel per course, replacing the old localStorage-only
                per-course drawer (still the entry point for adding a note —
                see CustomCourseLearningPage's NotesDrawer, now server-backed).
            ══════════════════════════════════════════════════════ */}
            {tab === 'notes' && (
              noteGroups.length === 0 ? (
                <Panel className="text-center py-16">
                  <Icon name="memo" size={32} color="rgba(197, 198, 199,0.15)" />
                  <p className="font-montserrat font-semibold mt-4" style={{ color: TEXT_MUTED, fontSize: 14, letterSpacing: TRACK_WIDE }}>ЗАМЕТКИ</p>
                  <p className="font-geist text-xs mt-2" style={{ color: TEXT_MUTED }}>Здесь будут твои заметки с курсов</p>
                </Panel>
              ) : (
                <div className="space-y-4">
                  {noteGroups.map(g => (
                    <Panel key={g.course_id}>
                      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                        <p className="font-montserrat font-semibold text-sm break-words" style={{ color: TEXT_PRIMARY }}>
                          {g.title} <span style={{ color: TEXT_MUTED, fontWeight: 400 }}>({g.notes.length})</span>
                        </p>
                        <span className="font-geist font-semibold rounded px-2 py-0.5 shrink-0" style={{ fontSize: 11, background: `${g.color || accent}20`, color: g.color || accent }}>{g.tag}</span>
                      </div>
                      <div className="space-y-2">
                        {g.notes.map((n, i) => (
                          <div key={n.id} className="group rounded-lg p-3" style={{ background: 'rgba(197, 198, 199,0.04)' }}>
                            <div className="flex items-center justify-between gap-2 mb-1.5">
                              <span className="font-geist font-semibold shrink-0" style={{ fontSize: 12, color: accent }}>{i + 1}</span>
                              <span className="font-geist text-xs flex-1 min-w-0 break-words" style={{ color: 'rgba(197, 198, 199,0.75)' }}>
                                {n.module_title ? `${n.module_title} › ` : ''}{n.lesson_title}
                              </span>
                              <span className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex items-center gap-2 shrink-0">
                                <button onClick={() => navigate(`/custom-course/${g.course_id}/learn`)} className="font-geist text-xs cursor-pointer flex items-center gap-1" style={{ color: accent }}>
                                  Перейти к заметке <Icon name="chevronRight" size={14} color="currentColor" />
                                </button>
                                <button onClick={() => deleteNote(n.id)} aria-label="Удалить заметку" className="cursor-pointer flex items-center" style={{ color: ERROR }}>
                                  <Icon name="close" size={14} color="currentColor" />
                                </button>
                              </span>
                            </div>
                            <p className="font-geist text-xs leading-relaxed break-words" style={{ color: 'rgba(197, 198, 199,0.65)' }}>{n.text}</p>
                          </div>
                        ))}
                      </div>
                    </Panel>
                  ))}
                </div>
              )
            )}

            {/* ══════════════════════════════════════════════════════
                SHOP — avatars (mostly free-equip, one priced + one
                achievement-locked), frames/backgrounds (real bug_coins
                purchases). Frame/bg tiles preview just the border/fill
                style itself (empty swatch), matching the reference.
            ══════════════════════════════════════════════════════ */}
            {tab === 'shop' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <SectionLabel>Магазин</SectionLabel>
                  <span className="font-geist font-bold flex items-center gap-1.5" style={{ fontSize: 15, color: '#EF9F27' }}>
                    {profile?.bug_coins ?? 0} <Icon name="lightning" size={16} color="currentColor" />
                  </span>
                </div>

                <div>
                  <p className="font-montserrat font-semibold mb-2 flex items-center gap-1.5" style={{ fontSize: 13, color: TEXT_MUTED, letterSpacing: TRACK_WIDE }}>
                    АВАТАРЫ <Icon name="chevronUp" size={12} color={TEXT_MUTED} />
                  </p>
                  <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                    {AVATAR_LIST.map(av => {
                      const equipped = (profile?.avatar_id || 'frog1') === av.id;
                      const locked = !unlockedAvatars.includes(av.id);
                      const shopItem = shopItemFor('avatar', av.id);
                      return (
                        <button
                          key={av.id}
                          onClick={() => { if (!locked) equipItem({ avatar_id: av.id }); else if (shopItem) buyAndEquip(shopItem.id, 'avatar', av.id); }}
                          disabled={locked && !shopItem}
                          className="relative flex items-center justify-center p-1.5 rounded-lg cursor-pointer overflow-hidden transition-all"
                          style={{ background: equipped ? `${accent}18` : 'rgba(197, 198, 199,0.04)', border: `1px solid ${equipped ? accent : 'transparent'}` }}
                        >
                          {equipped && <Icon name="check" size={12} color={accent} className="absolute top-1 right-1 z-10" />}
                          <PixelAvatar id={av.id} size={56} />
                          {locked && shopItem && (
                            <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0, 0, 0, 0.72)' }}>
                              <span className="font-geist font-semibold rounded flex items-center gap-1 px-1.5 py-0.5" style={{ fontSize: 10, color: (profile?.bug_coins ?? 0) >= shopItem.cost ? '#EF9F27' : 'rgba(197, 198, 199,0.5)' }}>
                                {shopBuyingId === shopItem.id ? '...' : <>{shopItem.cost}<Icon name="lightning" size={9} color="currentColor" /></>}
                              </span>
                            </div>
                          )}
                          {locked && !shopItem && (
                            <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0, 0, 0, 0.6)' }}>
                              <Icon name="lock" size={18} color="rgba(197, 198, 199,0.7)" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <p className="font-montserrat font-semibold mb-2 flex items-center gap-1.5" style={{ fontSize: 13, color: TEXT_MUTED, letterSpacing: TRACK_WIDE }}>
                    РАМКИ <Icon name="chevronDown" size={12} color={TEXT_MUTED} />
                  </p>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {FRAME_LIST.map(f => {
                      const equipped = (profile?.avatar_frame || 'default') === f.id;
                      const locked = !unlockedFrames.includes(f.id);
                      const shopItem = shopItemFor('frame', f.id);
                      return (
                        <button
                          key={f.id}
                          onClick={() => { if (!locked) equipItem({ avatar_frame: f.id }); else if (shopItem) buyAndEquip(shopItem.id, 'frame', f.id); }}
                          disabled={locked && !shopItem}
                          className="flex flex-col items-center gap-1 p-2 rounded-lg cursor-pointer transition-all"
                          style={{ background: equipped ? `${accent}18` : 'rgba(197, 198, 199,0.04)', border: `1px solid ${equipped ? accent : 'transparent'}`, opacity: locked && !shopItem ? 0.4 : 1 }}
                        >
                          <PixelAvatar id="frog1" size={44} frame={f.id} empty />
                          <span className="font-geist text-center" style={{ fontSize: 10, color: 'rgba(197, 198, 199,0.6)' }}>{f.name}</span>
                          {locked && shopItem && (
                            <span className="font-geist font-semibold rounded flex items-center gap-1 px-1.5 py-0.5" style={{ fontSize: 10, color: (profile?.bug_coins ?? 0) >= shopItem.cost ? '#EF9F27' : 'rgba(197, 198, 199,0.4)', background: 'rgba(239,159,39,0.1)' }}>
                              {shopBuyingId === shopItem.id ? '...' : <>{shopItem.cost}<Icon name="lightning" size={9} color="currentColor" /></>}
                            </span>
                          )}
                          {locked && !shopItem && <span className="font-geist text-center" style={{ fontSize: 9, color: 'rgba(197, 198, 199,0.4)' }}>{f.unlock}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <p className="font-montserrat font-semibold mb-2 flex items-center gap-1.5" style={{ fontSize: 13, color: TEXT_MUTED, letterSpacing: TRACK_WIDE }}>
                    ФОН <Icon name="chevronDown" size={12} color={TEXT_MUTED} />
                  </p>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {BG_LIST.map(bItem => {
                      const equipped = (profile?.profile_bg || 'default') === bItem.id;
                      const locked = !unlockedBgs.includes(bItem.id);
                      const shopItem = shopItemFor('bg', bItem.id);
                      return (
                        <button
                          key={bItem.id}
                          onClick={() => { if (!locked) equipItem({ profile_bg: bItem.id }); else if (shopItem) buyAndEquip(shopItem.id, 'bg', bItem.id); }}
                          disabled={locked && !shopItem}
                          className="flex flex-col items-center justify-center gap-1 p-2 rounded-lg cursor-pointer transition-all"
                          style={{ ...bItem.style, border: equipped ? `2px solid ${accent}` : '2px solid transparent', opacity: locked && !shopItem ? 0.45 : 1, minHeight: 60 }}
                        >
                          <span className="font-geist text-center" style={{ fontSize: 10, color: '#C5C6C7' }}>{bItem.name}</span>
                          {locked && shopItem && (
                            <span className="font-geist font-semibold rounded flex items-center gap-1 px-1.5 py-0.5" style={{ fontSize: 10, color: (profile?.bug_coins ?? 0) >= shopItem.cost ? '#EF9F27' : 'rgba(197, 198, 199,0.5)', background: 'rgba(0,0,0,0.4)' }}>
                              {shopBuyingId === shopItem.id ? '...' : <>{shopItem.cost}<Icon name="lightning" size={9} color="currentColor" /></>}
                            </span>
                          )}
                          {locked && !shopItem && <span className="font-geist text-center" style={{ fontSize: 9, color: 'rgba(197, 198, 199,0.55)' }}>{bItem.unlock}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {shopError && <p className="font-geist text-xs" style={{ color: ERROR }}>{shopError}</p>}
              </div>
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
                            <p className="font-geist text-xs font-semibold mt-1 break-words" style={{ color: TEXT_PRIMARY }}>{c.skill_area}</p>
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
                          <Icon name={meta?.icon || 'bug'} size={22} color={meta?.color || accent} />
                          <span className="font-geist text-xs font-semibold" style={{ color: TEXT_PRIMARY }}>{meta?.name || b.badge_id}</span>
                        </div>
                      );
                    })}
                    {(profile?.craftable ?? []).map(skill_area => (
                      <div key={skill_area} className="rounded-lg p-3 flex items-center justify-between gap-2" style={{ background: 'rgba(197, 198, 199,0.04)', border: '1px solid rgba(239,159,39,0.4)' }}>
                        <span className="font-geist text-xs break-words min-w-0" style={{ color: 'rgba(197, 198, 199,0.75)' }}>Собран весь набор «{skill_area}»</span>
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

            {/* ══════════════════════════════════════════════════════
                МОЁ РАБОЧЕЕ ВРЕМЯ — powers "работают сейчас" on the team
                dashboard and the team news feed's vacation start/end items.
                Moved in here as its own sidebar-nav tab (was a
                permanently-visible panel above the tab bar) so the left
                column always shows exactly one active section, matching
                the reference layout.
            ══════════════════════════════════════════════════════ */}
            {tab === 'presence' && (
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
                      style={{ background: presenceForm.days.has(d) ? `${accent}20` : 'rgba(197, 198, 199,0.04)', color: presenceForm.days.has(d) ? accent : TEXT_MUTED }}
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
            )}
          </div>

          {/* RIGHT column: achievements panel + sidebar nav (replaces the
              old separate quick-links row + horizontal tab bar). */}
          <div className="space-y-4">
            <Panel pad="p-5">
              <SectionLabel right={<span className="font-montserrat font-bold" style={{ fontSize: 14, color: TEXT_PRIMARY }}>{badgeCount}</span>}>Достижения</SectionLabel>
              {!achievementsExpanded ? (
                badgeCount > 0 ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {profile!.badges.slice(0, 5).map(b => {
                      const meta = BADGE_META[b.badge_id];
                      return (
                        <div
                          key={b.id}
                          title={meta?.name || b.badge_id}
                          className="rounded-lg flex items-center justify-center"
                          style={{ width: 34, height: 34, background: `${meta?.color || accent}18`, border: `1px solid ${meta?.color || accent}40` }}
                        >
                          <Icon name={meta?.icon || 'bug'} size={22} color={meta?.color || accent} />
                        </div>
                      );
                    })}
                    <button
                      onClick={() => setAchievementsExpanded(true)}
                      aria-label="Показать все достижения"
                      className="rounded-lg flex items-center justify-center cursor-pointer"
                      style={{ width: 34, height: 34, background: 'rgba(197, 198, 199,0.06)', color: TEXT_MUTED, fontSize: 18, letterSpacing: 1 }}
                    >
                      •••
                    </button>
                  </div>
                ) : (
                  <p className="font-geist text-xs" style={{ color: TEXT_MUTED }}>Пока нет ачивок — пройди первую лекцию</p>
                )
              ) : (
                // Full catalog — every real achievement, earned or not, with
                // what actually earns it (see ACHIEVEMENTS_CATALOG's
                // descriptions, mirroring routeHelpers.js's ACHIEVEMENT_IDS
                // triggers). Locked ones show greyed-out with the same
                // description, so it doubles as "how do I get this".
                <div className="space-y-2">
                  {ACHIEVEMENTS_CATALOG.map(a => {
                    const meta = BADGE_META[a.id];
                    const earned = badgeIds.includes(a.id);
                    return (
                      <div key={a.id} className="flex items-center gap-3 rounded-lg p-2" style={{ background: earned ? `${meta?.color || accent}10` : 'rgba(197, 198, 199,0.03)', opacity: earned ? 1 : 0.55 }}>
                        <div className="rounded-lg flex items-center justify-center shrink-0" style={{ width: 30, height: 30, background: `${meta?.color || accent}18`, border: `1px solid ${meta?.color || accent}40` }}>
                          <Icon name={meta?.icon || 'trophy'} size={18} color={meta?.color || accent} />
                        </div>
                        <div className="min-w-0">
                          <p className="font-geist font-semibold text-xs break-words" style={{ color: earned ? TEXT_PRIMARY : TEXT_MUTED }}>{meta?.name}</p>
                          <p className="font-geist text-xs break-words" style={{ color: TEXT_MUTED, fontSize: 10 }}>{a.description}</p>
                        </div>
                      </div>
                    );
                  })}
                  <button
                    onClick={() => setAchievementsExpanded(false)}
                    className="w-full text-center cursor-pointer font-geist text-xs pt-1"
                    style={{ color: accent }}
                  >
                    Свернуть
                  </button>
                </div>
              )}
            </Panel>

            <Panel pad="p-2">
              {NAV_ITEMS.map(n => (
                <NavRow key={n.id} icon={n.icon} label={n.label} color={n.color} active={tab === n.id} onClick={() => setTab(n.id)} />
              ))}
            </Panel>

          </div>
        </div>
      </div>
    </div>
  );
}