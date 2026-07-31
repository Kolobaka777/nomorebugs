import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navigation from '../components/Navigation';
import LevelBadge from '../components/LevelBadge';
import SnailLoader from '../components/SnailLoader';
import PixelAvatar from '../components/PixelAvatar';
import ProfileEditModal from '../components/ProfileEditModal';
import { testerApi, checklistApi, rewardsApi } from '../api';
import {
  Lecture, TestHistoryItem, SKillChart,
  FullProfile, getLevel,
} from '../types';
import { BG_LIST, type BgId, type FrameId } from '../components/PixelAvatar';
import PixelIcon, { IconName } from '../components/PixelIcon';
import { clickableProps } from '../utils/a11y';
import { parseServerDate } from '../utils/date';

interface MoyaNoraProps { user: any; onLogout: () => void; }

type Tab = 'favorites' | 'notes' | 'btn3' | 'btn4';

// ── Daily facts ───────────────────────────────────────────────────────────────
const SNAIL_FACTS = [
  { icon: 'snail',      text: 'Улитка преодолевает 50 метров в час. Баг-репорт без скриншота — примерно так же полезен.' },
  { icon: 'search',     text: 'Хороший QA — как улитка: медленно, но везде оставляет след. Иногда это называют логами.' },
  { icon: 'snail',      text: 'Улитка спросила черепаху: «Ты куда так быстро?» — «К новому спринту готовлюсь».' },
  { icon: 'lightbulb',  text: 'Почему улитки — лучшие тестировщики? Они медленно, но находят каждую трещину.' },
  { icon: 'snail',      text: 'Улитка — единственное существо, которое носит с собой полный бэкап среды.' },
  { icon: 'bug',        text: 'Тестировщик нашёл баг в баге. Разработчик сказал, что это рекурсия.' },
  { icon: 'snail',      text: 'Улитка возит дом на спине. QA-инженер — тест-кейсы в голове. Оба никогда без инструментов.' },
  { icon: 'bug',        text: '"Это не баг, это фича!" — "Это баг с хорошим PR-менеджером" — отвечает QA.' },
  { icon: 'snail',      text: 'Улитка без домика — беженец. Тест без assert — притворство.' },
  { icon: 'lightbulb',  text: 'Фул-стэк-улитка: медленная, но с раковиной.' },
  { icon: 'snail',      text: 'Спидраны в QA запрещены. Улитки знают почему.' },
  { icon: 'wrench',     text: 'Баг-репорт без шагов воспроизведения — как карта без территории.' },
];

// ── Rarity ───────────────────────────────────────────────────────────────────
const RARITY_COLORS = { common: '#1D9E75', rare: '#7F77DD', epic: '#EF9F27' };
const RARITY_LABEL  = { common: '',       rare: 'RARE',    epic: 'EPIC'   };

// ── Badge metadata ────────────────────────────────────────────────────────────
const BADGE_META: Record<string, { name: string; icon: IconName; color: string }> = {
  'HTML structure':     { name: 'HTML-жук',        icon: 'globe',     color: '#1D9E75' },
  'CSS reading':        { name: 'CSS-жук',         icon: 'palette',   color: '#7F77DD' },
  'DevTools':           { name: 'DevTools-жук',    icon: 'search',    color: '#EF9F27' },
  'Console errors':     { name: 'Консольный жук',  icon: 'lightning', color: '#e05252' },
  'Bug report quality': { name: 'Жук-репортёр',    icon: 'bug',       color: '#EF9F27' },
};

// ── Shop catalog (mirrors server SHOP_CATALOG) ────────────────────────────────
const SHOP_CATALOG = [
  { id: 'frame_gold',    type: 'frame' as const, label: 'Золотая рамка',  icon: 'star'    as IconName, cost: 200, desc: 'Позолоченный контур портрета' },
  { id: 'frame_rainbow', type: 'frame' as const, label: 'Рамка-радуга',   icon: 'sparkle' as IconName, cost: 350, desc: 'Цветной анимированный контур' },
  { id: 'frame_glitch',  type: 'frame' as const, label: 'Глитч-рамка',   icon: 'floppy'  as IconName, cost: 300, desc: 'Цифровой сбой у твоей аватарки' },
  { id: 'bg_hive',       type: 'bg'    as const, label: 'Фон «Улей»',    icon: 'bee'     as IconName, cost: 150, desc: 'Тёплый янтарно-медовый фон' },
  { id: 'bg_amber',      type: 'bg'    as const, label: 'Фон «Янтарь»',  icon: 'beehive' as IconName, cost: 250, desc: 'Янтарное свечение мудрого жука' },
];

// ── Before/After summary ──────────────────────────────────────────────────────
function getGrowthSummary(skills: SKillChart[], completed: number) {
  if (!skills.length || skills.every(s => s.before === 0))
    return { text: 'Пройди базовый опрос, чтобы увидеть прогресс', color: 'rgba(232,232,208,0.6)' };
  const avg = skills.reduce((s, r) => s + r.delta, 0) / skills.length;
  const pos = skills.filter(r => r.delta > 0).length;
  if (avg <= 0 && completed === 0)
    return { text: 'Ты только начинаешь путь — впереди все открытия', color: 'rgba(232,232,208,0.6)' };
  if (avg <= 0)
    return { text: `${completed} курс${completed === 1 ? '' : 'а'} пройдено — база становится крепче`, color: '#7F77DD' };
  if (avg < 1)
    return { text: `${pos} из ${skills.length} навыков уже подросли. Ты движешься!`, color: '#1D9E75' };
  if (avg < 2)
    return { text: `Средний рост +${avg.toFixed(1)} пункта — это реально заметно`, color: '#1D9E75' };
  return { text: `+${avg.toFixed(1)} пункта в среднем — ты точно не улитка`, color: '#EF9F27' };
}

// ── Corner SVG ornament ───────────────────────────────────────────────────────
function Corner({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) {
  const style: React.CSSProperties = {
    position: 'absolute', width: 10, height: 10, zIndex: 2, pointerEvents: 'none',
    ...(pos === 'tl' ? { top: -3, left: -3 } :
        pos === 'tr' ? { top: -3, right: -3 } :
        pos === 'bl' ? { bottom: -3, left: -3 } :
                       { bottom: -3, right: -3 }),
  };
  const r = pos === 'tr' ? '90deg' : pos === 'br' ? '180deg' : pos === 'bl' ? '270deg' : '0deg';
  return (
    <svg style={{ ...style, transform: `rotate(${r})` }} width="10" height="10" viewBox="0 0 10 10">
      <rect x="0" y="0" width="4" height="10" fill="#2a1f4f" />
      <rect x="0" y="0" width="10" height="4" fill="#2a1f4f" />
      <rect x="1" y="1" width="3" height="3" fill="#EF9F27" opacity="0.85" />
    </svg>
  );
}

// ── RPG Panel wrapper ─────────────────────────────────────────────────────────
function RpgPanel({
  children, style, className = '', variant = 'default', corners = true, onClick,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
  variant?: 'default' | 'gold' | 'dark';
  corners?: boolean;
  onClick?: () => void;
}) {
  const cls = variant === 'gold' ? 'rpg-panel-gold' : variant === 'dark' ? 'rpg-panel-dark' : 'rpg-panel';
  return (
    <div className={`${cls} ${className}`} style={style} onClick={onClick} {...(onClick ? clickableProps(onClick) : {})}>
      {corners && <>
        <Corner pos="tl" /><Corner pos="tr" />
        <Corner pos="bl" /><Corner pos="br" />
      </>}
      {children}
    </div>
  );
}

// ── Pixel stars ───────────────────────────────────────────────────────────────
function Stars({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} style={{ width: 9, height: 9, background: i < value ? color : 'rgba(232,232,208,0.08)', imageRendering: 'pixelated' }} />
      ))}
    </div>
  );
}

// ── RPG Stat row ──────────────────────────────────────────────────────────────
function StatRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-pixel shrink-0" style={{ fontSize: '0.6rem', color, width: 58, lineHeight: 2 }}>{label}</span>
      <div className="stat-bar-track flex-1" style={{ borderLeft: `2px solid ${color}30` }}>
        <div className="stat-bar-fill" style={{ width: `${(value / max) * 100}%`, background: color }} />
      </div>
      <span className="font-pixel shrink-0" style={{ fontSize: '0.6rem', color, width: 22, textAlign: 'right', lineHeight: 2 }}>
        {value}
      </span>
    </div>
  );
}

// ── Map helpers ───────────────────────────────────────────────────────────────
function MapNode({ lecture, index }: { lecture: Lecture; index: number }) {
  const [hover, setHover] = useState(false);
  const isPassed = lecture.status === 'passed';
  const isActive = lecture.status === 'active';
  const isLocked = lecture.status === 'locked';
  return (
    <div className="relative shrink-0" style={{ width: 52, height: 52 }}>
      <div
        className={isActive ? 'map-node-active' : ''}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          width: 52, height: 52,
          background: isPassed ? '#1D9E75' : isActive ? '#1a1a2e' : '#12121f',
          border: `2px solid ${isPassed ? '#0f7a5a' : isActive ? '#EF9F27' : '#1a1430'}`,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          opacity: isLocked ? 0.4 : 1,
        }}
      >
        <span className="font-pixel" style={{ fontSize: isLocked ? '0.7rem' : '0.75rem', color: isPassed ? '#0f0f1a' : isActive ? '#EF9F27' : 'rgba(232,232,208,0.2)', lineHeight: 1 }}>
          {isPassed ? '✓' : isActive ? `${index}` : <PixelIcon name="lock" size={12} color="rgba(232,232,208,0.4)" />}
        </span>
        {!isLocked && <span style={{ fontSize: '0.58rem', color: isPassed ? '#0f0f1a' : '#EF9F27', fontFamily: 'Press Start 2P', lineHeight: 1.6, opacity: 0.7 }}>#{index}</span>}
      </div>
      {hover && (
        <div className="absolute z-20 px-3 py-2 text-xs font-sans pointer-events-none"
          style={{ background: '#0f0f1a', border: '2px solid #2a1f4f', boxShadow: '0 0 0 1px rgba(239,159,39,0.2)', bottom: '110%', left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap', color: '#e8e8d0' }}>
          {lecture.title}
          {isPassed && lecture.score != null && <span style={{ color: '#1D9E75', marginLeft: 6 }}>{Math.round(lecture.score)}%</span>}
        </div>
      )}
    </div>
  );
}
function HLine({ passed }: { passed: boolean }) {
  return <div className="flex-1" style={{ height: 3, borderTop: `3px dashed ${passed ? '#1D9E75' : 'rgba(232,232,208,0.08)'}` }} />;
}

// ─────────────────────────────────────────────────────────────────────────────
export default function MoyaNora({ user, onLogout }: MoyaNoraProps) {
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
  const [buying, setBuying]             = useState<string | null>(null);
  const [premiumPoints, setPremiumPoints] = useState<{ premium_points: number; history: any[] } | null>(null);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try {
      const [metricsRes, lecturesRes, historyRes, baRes, profileRes] = await Promise.all([
        testerApi.getMetrics(),
        testerApi.getLectures(),
        testerApi.getHistory(),
        testerApi.getBeforeAfter(),
        testerApi.getProfileFull(),
      ]);

      // Load task counts from real server (silently skip if server is down)
      checklistApi.getTaskCounts().then(r => setTaskCounts(r.data)).catch(() => {});
      rewardsApi.getMyPremiumPoints().then(r => setPremiumPoints(r.data)).catch(() => {});
      setMetrics(metricsRes.data);
      setLectures(lecturesRes.data);
      setHistory(historyRes.data);
      setBeforeAfter(baRes.data);
      setProfile(profileRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen" style={{ background: '#0f0f1a' }}>
      <Navigation user={user} onLogout={onLogout} />
      <SnailLoader />
    </div>
  );

  const completed      = metrics?.lecturesCompleted || 0;
  const level          = getLevel(completed);
  const todayJoke      = SNAIL_FACTS[new Date().getDate() % SNAIL_FACTS.length];
  const growthSummary  = getGrowthSummary(beforeAfter, completed);
  const passedLectures = lectures.filter(l => l.status === 'passed');

  const badgeIds       = profile?.badges.map(b => b.badge_id) || [];
  const purchased      = profile?.purchased_items || [];
  const coins          = profile?.bug_coins || 0;

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

  const bgStyle = BG_LIST.find(b => b.id === (profile?.profile_bg as BgId))?.style || { background: '#1a1a2e' };

  const handleCraft = async (skill_area: string) => {
    setCrafting(skill_area);
    try {
      await testerApi.craftBadge(skill_area);
      setCraftSuccess(skill_area);
      await loadAll();
      setTimeout(() => setCraftSuccess(null), 3000);
    } catch (e: any) {
      alert(e?.response?.data?.error || 'Ошибка крафтинга');
    } finally { setCrafting(null); }
  };

  const handleBuy = async (item_id: string) => {
    setBuying(item_id);
    try {
      const res = await testerApi.buyShopItem(item_id);
      setProfile(p => p ? { ...p, bug_coins: res.data.newCoins, purchased_items: [...(p.purchased_items || []), item_id] } : p);
    } catch (e: any) {
      alert(e?.response?.data?.error || 'Ошибка покупки');
    } finally { setBuying(null); }
  };

  const row1         = lectures.slice(0, 5);
  const row2         = lectures.slice(5, 10).reverse();
  const row1LastPass = row1.length > 0 && row1[row1.length - 1].status === 'passed';

  const TABS: { id: Tab; label: string; icon: IconName }[] = [
    { id: 'favorites', label: 'Избранное', icon: 'star'   },
    { id: 'notes',     label: 'Заметки',   icon: 'memo'   },
    { id: 'btn3',      label: 'Кнопка',    icon: 'floppy' },
    { id: 'btn4',      label: 'Кнопка',    icon: 'gear'   },
  ];

  const defaultProfile = {
    id: user.id, email: user.email, name: user.name,
    avatar_initials: user.avatar_initials,
    created_at: new Date().toISOString(),
    nickname: user.name, status_quote: '', specialization: '',
    info_box: '', snail_joke: '', avatar_id: 'bug1',
    avatar_frame: 'default', profile_bg: 'default',
    showcase_badges: [], favorite_lecture_id: null, is_public: true,
    custom_avatar: null, bug_coins: 0, purchased_items: [],
    stats: { int: 0, per: 0, spd: 0, def: 0, bug_pwr: 0 },
    streak: 0, cards: [], badges: [], craftable: [], favLecture: null,
  } as FullProfile;

  return (
    <div className="min-h-screen" style={{ background: '#0f0f1a' }}>
      <Navigation user={user} onLogout={onLogout} />

      {showEdit && (
        <ProfileEditModal
          profile={profile ?? defaultProfile}
          passedLectures={passedLectures}
          unlockedFrames={unlockedFrames}
          unlockedBgs={unlockedBgs}
          onSave={patch => setProfile(p => p ? { ...p, ...patch } : p)}
          onClose={() => setShowEdit(false)}
        />
      )}

      <div className="max-w-5xl mx-auto px-4 pt-16 pb-6 fade-in">

        {/* ══════════════════════════════════════════════════════════
            CHARACTER WINDOW  (HoMM 3 style)
        ══════════════════════════════════════════════════════════ */}
        <RpgPanel
          variant="gold"
          className="mb-6 overflow-hidden"
          style={{ ...bgStyle }}
        >
          {/* Top strip: name + level + coins */}
          <div className="rpg-banner flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="font-pixel" style={{ fontSize: '0.55rem', color: '#EF9F27', lineHeight: 1.8 }}>
                {profile?.nickname || user.name}
              </span>
              {profile?.specialization && (
                <span className="text-pixel/60 text-xs font-sans">· {profile.specialization}</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {/* монетки скрыты
              <div className="coin-chip">
                <span className="coin-spin">🪙</span>
                <span>{coins}</span>
              </div>
              */}
              {!profile?.is_public && <PixelIcon name="lock" size={12} color="rgba(232,232,208,0.3)" />}
            </div>
          </div>

          {/* Main character row */}
          <div className="flex flex-col sm:flex-row gap-0">
            {/* LEFT: Portrait */}
            <div className="shrink-0 p-4 flex flex-col items-center gap-3" style={{ width: 132, borderRight: '2px solid rgba(42,31,79,0.5)' }}>
              <div className="portrait-frame p-1">
                <PixelAvatar
                  id={(profile?.avatar_id || 'bug1') as any}
                  frame={(profile?.avatar_frame || 'default') as FrameId}
                  size={80}
                  customSrc={profile?.custom_avatar}
                  animate
                />
              </div>
              {/* <LevelBadge lecturesCompleted={completed} size="sm" /> */}
              <button
                onClick={() => setShowEdit(true)}
                className="font-pixel cursor-pointer"
                style={{
                  fontSize: '0.58rem', lineHeight: 1.8, padding: '4px 10px',
                  background: 'rgba(239,159,39,0.1)',
                  color: '#EF9F27',
                  borderTop:    '2px solid #f5c065',
                  borderLeft:   '2px solid #f5c065',
                  borderBottom: '2px solid #7a4d00',
                  borderRight:  '2px solid #7a4d00',
                  borderRadius: 0,
                }}
              >
                <span className="flex items-center gap-1"><PixelIcon name="pencil" size={9} color="currentColor" />Изменить</span>
              </button>
            </div>

            {/* CENTER: Info */}
            <div className="flex-1 p-4 min-w-0">
              {profile?.status_quote && (
                <p className="font-sans text-sm italic mb-3" style={{ color: 'rgba(232,232,208,0.6)', borderLeft: '2px solid rgba(239,159,39,0.3)', paddingLeft: 10 }}>
                  "{profile.status_quote}"
                </p>
              )}

              <div className="flex flex-wrap gap-x-5 gap-y-1 mb-3 text-xs font-sans">
                <span style={{ color: (profile?.streak || 0) > 0 ? '#EF9F27' : 'rgba(232,232,208,0.3)' }}>
                  {(profile?.streak || 0) > 0
                    ? <span style={{ fontSize: '0.9rem' }}>🔥</span>
                    : <PixelIcon name="snail" size={13} color="currentColor" />
                  }
                  {' '}
                  <span style={{ color: 'rgba(232,232,208,0.6)' }}>
                    {(profile?.streak || 0) > 0
                      ? `${profile?.streak} дн. подряд`
                      : 'Стрик не идёт'}
                  </span>
                </span>
                {profile?.created_at && (
                  <span style={{ color: 'rgba(232,232,208,0.55)' }}>
                    В гильдии с {parseServerDate(profile.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </span>
                )}
              </div>

              {/* Metric mini-cards */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Пройдено',  value: completed,                        color: '#1D9E75' },
                  { label: 'Точность',  value: `${metrics?.averageScore || 0}%`,  color: '#EF9F27' },
                  ...(premiumPoints ? [{ label: 'Премиальные баллы', value: premiumPoints.premium_points, color: '#7F77DD' }] : []),
                ].map((m, i) => (
                  <div key={i} className="rpg-panel-dark p-2 text-center">
                    <p className="text-pixel/60 font-sans" style={{ fontSize: '0.55rem', lineHeight: 1.4 }}>{m.label}</p>
                    <p className="font-pixel" style={{ color: m.color, fontSize: '0.65rem', lineHeight: 1.8 }}>{m.value}</p>
                  </div>
                ))}
              </div>

              {/* ВИТРИНА скрыта
              {(profile?.showcase_badges?.length ?? 0) > 0 && (
                <div className="flex items-center gap-2 mt-3">
                  <span className="text-pixel/55 font-pixel" style={{ fontSize: '0.58rem' }}>ВИТРИНА:</span>
                </div>
              )}
              */}
            </div>

            {/* RIGHT: Task counts panel */}
            <div className="shrink-0 p-4" style={{ width: 180, borderLeft: '2px solid rgba(42,31,79,0.5)' }}>
              <p className="font-pixel mb-3" style={{ fontSize: '0.6rem', color: 'rgba(127,119,221,0.7)', lineHeight: 1.8, letterSpacing: '0.05em' }}>
                <span className="flex items-center gap-1.5"><PixelIcon name="clipboard" size={11} color="currentColor" />ЗАДАЧИ</span>
              </p>
              {taskCounts.length > 0 ? (
                <div className="space-y-3">
                  {taskCounts.map(t => (
                    <div key={t.task_type}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-pixel" style={{ fontSize: '0.58rem', color: t.color, lineHeight: 1.8 }}>
                          {t.name.toUpperCase()}
                        </span>
                        <span className="font-pixel" style={{ fontSize: '0.55rem', color: t.count > 0 ? t.color : 'rgba(232,232,208,0.2)', lineHeight: 1.8 }}>
                          {t.count}
                        </span>
                      </div>
                      <div style={{ height: 4, background: 'rgba(232,232,208,0.06)', borderRadius: 2 }}>
                        {t.count > 0 && (
                          <div style={{
                            height: 4,
                            background: t.color,
                            borderRadius: 2,
                            width: `${Math.min(100, (t.count / Math.max(...taskCounts.map(x => x.count), 1)) * 100)}%`,
                          }} />
                        )}
                      </div>
                    </div>
                  ))}
                  <p className="text-pixel/55 text-xs font-sans mt-2" style={{ fontSize: '0.65rem' }}>
                    всего: {taskCounts.reduce((s, t) => s + t.count, 0)}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {['Прелендинг', 'Оффер', 'Вайт'].map(name => (
                    <div key={name}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-pixel" style={{ fontSize: '0.58rem', color: 'rgba(232,232,208,0.55)', lineHeight: 1.8 }}>
                          {name.toUpperCase()}
                        </span>
                        <span className="font-pixel" style={{ fontSize: '0.55rem', color: 'rgba(232,232,208,0.55)', lineHeight: 1.8 }}>0</span>
                      </div>
                      <div style={{ height: 4, background: 'rgba(232,232,208,0.04)', borderRadius: 2 }} />
                    </div>
                  ))}
                  <p className="text-pixel/55 text-xs font-sans mt-1" style={{ fontSize: '0.62rem' }}>
                    нет данных
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Info box */}
          {profile?.info_box && (
            <>
              <div className="rpg-divider" />
              <div className="px-5 py-3">
                <p className="text-xs font-sans leading-relaxed" style={{ color: 'rgba(232,232,208,0.6)', borderLeft: '2px solid rgba(29,158,117,0.25)', paddingLeft: 10 }}>
                  {profile.info_box}
                </p>
              </div>
            </>
          )}
        </RpgPanel>

        {/* ── JOKE OF THE DAY (hidden) ──
        <RpgPanel variant="dark" className="p-4 mb-5 flex items-start gap-3">
          <PixelIcon name={todayJoke.icon as IconName} size={22} color="#1D9E75" style={{ flexShrink: 0 }} />
          <div>
            <p className="font-pixel mb-1" style={{ color: 'rgba(29,158,117,0.6)', fontSize: '0.6rem', lineHeight: 1.8 }}>ФАКТ ДНЯ</p>
            <p className="text-pixel/60 text-xs font-sans leading-relaxed">{todayJoke.text}</p>
          </div>
        </RpgPanel>
        */}

        {/* ══════════════════════════════════════════════════════════
            TAB BAR  (HoMM-style beveled buttons)
        ══════════════════════════════════════════════════════════ */}
        <div className="flex flex-wrap gap-1 mb-5" style={{ borderBottom: '2px solid rgba(0,0,0,0.5)', paddingBottom: '2px' }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rpg-tab ${tab === t.id ? 'rpg-tab-active' : ''}`}
            >
              <span className="flex items-center gap-1.5">
                <PixelIcon name={t.icon} size={11} color="currentColor" />
                {t.label}
              </span>
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════════════
            FAVORITES
        ══════════════════════════════════════════════════════════ */}
        {tab === 'favorites' && (
          <div className="space-y-3">
            {profile?.favLecture ? (
              <RpgPanel className="p-4 flex items-center gap-4">
                <PixelIcon name="star" size={22} color="#EF9F27" style={{ flexShrink: 0 }} />
                <div className="flex-1 min-w-0">
                  <p className="font-pixel mb-1" style={{ fontSize: '0.6rem', color: '#EF9F27', lineHeight: 1.8 }}>ЛЮБИМАЯ ЛЕКЦИЯ</p>
                  <p className="text-pixel font-sans font-semibold text-sm">{profile.favLecture.title}</p>
                  <p className="text-pixel/60 text-xs font-sans">
                    {profile.favLecture.skill_area}
                    {profile.favLecture.score != null && <> · <span style={{ color: '#1D9E75' }}>{Math.round(profile.favLecture.score)}%</span></>}
                  </p>
                </div>
                <button
                  onClick={() => navigate(`/lecture/${profile.favLecture!.id}/quiz`)}
                  className="btn-amber text-xs px-3 py-2 cursor-pointer shrink-0"
                >Перечитать →</button>
              </RpgPanel>
            ) : (
              <RpgPanel variant="dark" className="text-center py-10">
                <PixelIcon name="star" size={28} color="rgba(232,232,208,0.08)" />
                <p className="text-pixel/55 text-xs font-sans mt-3">Выбери любимую лекцию в редакторе профиля</p>
              </RpgPanel>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════
            NOTES
        ══════════════════════════════════════════════════════════ */}
        {tab === 'notes' && (
          <RpgPanel variant="dark" className="text-center py-16">
            <PixelIcon name="memo" size={32} color="rgba(232,232,208,0.08)" />
            <p className="font-pixel mt-4" style={{ color: 'rgba(232,232,208,0.55)', fontSize: '0.65rem', lineHeight: 1.8 }}>ЗАМЕТКИ</p>
            <p className="text-pixel/55 text-xs font-sans mt-2">Здесь будут твои заметки с курсов</p>
          </RpgPanel>
        )}

        {/* ══════════════════════════════════════════════════════════
            BTN3
        ══════════════════════════════════════════════════════════ */}
        {tab === 'btn3' && (
          <RpgPanel variant="dark" className="text-center py-16">
            <p className="text-pixel/55 text-xs font-sans">Раздел в разработке</p>
          </RpgPanel>
        )}

        {/* ══════════════════════════════════════════════════════════
            BTN4
        ══════════════════════════════════════════════════════════ */}
        {tab === 'btn4' && (
          <RpgPanel variant="dark" className="text-center py-16">
            <p className="text-pixel/55 text-xs font-sans">Раздел в разработке</p>
          </RpgPanel>
        )}


      </div>
    </div>
  );
}
