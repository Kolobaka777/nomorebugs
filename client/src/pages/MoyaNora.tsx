import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navigation from '../components/Navigation';
import LevelBadge from '../components/LevelBadge';
import AchievementPopup from '../components/AchievementPopup';
import SnailLoader from '../components/SnailLoader';
import PixelAvatar from '../components/PixelAvatar';
import ProfileEditModal from '../components/ProfileEditModal';
import { testerApi } from '../api';
import {
  Lecture, Achievement, TestHistoryItem, SKillChart,
  FullProfile, getLevel,
} from '../types';
import { BG_LIST, type BgId, type FrameId } from '../components/PixelAvatar';

interface MoyaNoraProps { user: any; onLogout: () => void; }

type Tab = 'courses' | 'diary' | 'cards' | 'trophies' | 'before-after' | 'map' | 'shop';

// ── Daily facts ───────────────────────────────────────────────────────────────
const SNAIL_FACTS = [
  { emoji: '🐌', text: 'Улитка преодолевает 50 метров в час. Баг-репорт без скриншота — примерно так же полезен.' },
  { emoji: '🔍', text: 'Хороший QA — как улитка: медленно, но везде оставляет след. Иногда это называют логами.' },
  { emoji: '🐌', text: 'Улитка спросила черепаху: «Ты куда так быстро?» — «К новому спринту готовлюсь».' },
  { emoji: '💡', text: 'Почему улитки — лучшие тестировщики? Они медленно, но находят каждую трещину.' },
  { emoji: '🐌', text: 'Улитка — единственное существо, которое носит с собой полный бэкап среды.' },
  { emoji: '🐞', text: 'Тестировщик нашёл баг в баге. Разработчик сказал, что это рекурсия.' },
  { emoji: '🐌', text: 'Улитка возит дом на спине. QA-инженер — тест-кейсы в голове. Оба никогда без инструментов.' },
  { emoji: '🐛', text: '"Это не баг, это фича!" — "Это баг с хорошим PR-менеджером" — отвечает QA.' },
  { emoji: '🐌', text: 'Улитка без домика — беженец. Тест без assert — притворство.' },
  { emoji: '💭', text: 'Фул-стэк-улитка: медленная, но с раковиной.' },
  { emoji: '🐌', text: 'Спидраны в QA запрещены. Улитки знают почему.' },
  { emoji: '🔧', text: 'Баг-репорт без шагов воспроизведения — как карта без территории.' },
];

// ── Rarity ───────────────────────────────────────────────────────────────────
const RARITY_COLORS = { common: '#1D9E75', rare: '#7F77DD', epic: '#EF9F27' };
const RARITY_LABEL  = { common: '',       rare: 'RARE',    epic: 'EPIC'   };

// ── Badge metadata ────────────────────────────────────────────────────────────
const BADGE_META: Record<string, { name: string; icon: string; color: string }> = {
  'HTML structure':     { name: 'HTML-жук',        icon: '🌐', color: '#1D9E75' },
  'CSS reading':        { name: 'CSS-жук',         icon: '🎨', color: '#7F77DD' },
  'DevTools':           { name: 'DevTools-жук',    icon: '🔍', color: '#EF9F27' },
  'Console errors':     { name: 'Консольный жук',  icon: '▶',  color: '#e05252' },
  'Bug report quality': { name: 'Жук-репортёр',    icon: '🐛', color: '#EF9F27' },
};

// ── Shop catalog (mirrors server SHOP_CATALOG) ────────────────────────────────
const SHOP_CATALOG = [
  { id: 'frame_gold',    type: 'frame' as const, label: 'Золотая рамка',  icon: '✦', cost: 200, desc: 'Позолоченный контур портрета' },
  { id: 'frame_rainbow', type: 'frame' as const, label: 'Рамка-радуга',   icon: '🌈', cost: 350, desc: 'Цветной анимированный контур' },
  { id: 'frame_glitch',  type: 'frame' as const, label: 'Глитч-рамка',   icon: '💾', cost: 300, desc: 'Цифровой сбой у твоей аватарки' },
  { id: 'bg_hive',       type: 'bg'    as const, label: 'Фон «Улей»',    icon: '🐝', cost: 150, desc: 'Тёплый янтарно-медовый фон' },
  { id: 'bg_amber',      type: 'bg'    as const, label: 'Фон «Янтарь»',  icon: '🍯', cost: 250, desc: 'Янтарное свечение мудрого жука' },
];

// ── Before/After summary ──────────────────────────────────────────────────────
function getGrowthSummary(skills: SKillChart[], completed: number) {
  if (!skills.length || skills.every(s => s.before === 0))
    return { text: 'Пройди базовый опрос, чтобы увидеть прогресс 🐌', color: 'rgba(232,232,208,0.4)' };
  const avg = skills.reduce((s, r) => s + r.delta, 0) / skills.length;
  const pos = skills.filter(r => r.delta > 0).length;
  if (avg <= 0 && completed === 0)
    return { text: 'Ты только начинаешь путь — впереди все открытия 🌱', color: 'rgba(232,232,208,0.5)' };
  if (avg <= 0)
    return { text: `${completed} курс${completed === 1 ? '' : 'а'} пройдено — база становится крепче 🐛`, color: '#7F77DD' };
  if (avg < 1)
    return { text: `${pos} из ${skills.length} навыков уже подросли. Ты движешься! 📈`, color: '#1D9E75' };
  if (avg < 2)
    return { text: `Средний рост +${avg.toFixed(1)} пункта — это реально заметно 🏆`, color: '#1D9E75' };
  return { text: `+${avg.toFixed(1)} пункта в среднем — ты точно не улитка 🚀`, color: '#EF9F27' };
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
    <div className={`${cls} ${className}`} style={style} onClick={onClick}>
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
      <span className="font-pixel shrink-0" style={{ fontSize: '0.42rem', color, width: 58, lineHeight: 2 }}>{label}</span>
      <div className="stat-bar-track flex-1" style={{ borderLeft: `2px solid ${color}30` }}>
        <div className="stat-bar-fill" style={{ width: `${(value / max) * 100}%`, background: color }} />
      </div>
      <span className="font-pixel shrink-0" style={{ fontSize: '0.42rem', color, width: 22, textAlign: 'right', lineHeight: 2 }}>
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
          {isPassed ? '✓' : isActive ? `${index}` : '🔒'}
        </span>
        {!isLocked && <span style={{ fontSize: '0.38rem', color: isPassed ? '#0f0f1a' : '#EF9F27', fontFamily: 'Press Start 2P', lineHeight: 1.6, opacity: 0.7 }}>#{index}</span>}
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
  const [tab, setTab] = useState<Tab>('courses');

  const [metrics, setMetrics]           = useState<any>(null);
  const [lectures, setLectures]         = useState<Lecture[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [history, setHistory]           = useState<TestHistoryItem[]>([]);
  const [beforeAfter, setBeforeAfter]   = useState<SKillChart[]>([]);
  const [profile, setProfile]           = useState<FullProfile | null>(null);
  const [loading, setLoading]           = useState(true);
  const [newAchievement, setNewAchievement] = useState<Achievement | null>(null);
  const [showEdit, setShowEdit]         = useState(false);
  const [crafting, setCrafting]         = useState<string | null>(null);
  const [craftSuccess, setCraftSuccess] = useState<string | null>(null);
  const [buying, setBuying]             = useState<string | null>(null);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try {
      const [metricsRes, lecturesRes, achievementsRes, historyRes, baRes, profileRes] = await Promise.all([
        testerApi.getMetrics(),
        testerApi.getLectures(),
        testerApi.getAchievements(),
        testerApi.getHistory(),
        testerApi.getBeforeAfter(),
        testerApi.getProfileFull(),
      ]);
      setMetrics(metricsRes.data);
      setLectures(lecturesRes.data);
      setHistory(historyRes.data);
      setBeforeAfter(baRes.data);
      setProfile(profileRes.data);

      const earnedNow = achievementsRes.data as Achievement[];
      setAchievements(earnedNow);
      const saved = JSON.parse(localStorage.getItem('earned_achievements') || '[]') as string[];
      const fresh = earnedNow.filter(a => a.earned && !saved.includes(a.id));
      if (fresh.length > 0) {
        setNewAchievement(fresh[0]);
        localStorage.setItem('earned_achievements', JSON.stringify(earnedNow.filter(a => a.earned).map(a => a.id)));
      }
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

  const rarestAch = achievements
    .filter(a => a.earned)
    .sort((a, b) => {
      const order = { secret: 0, epic: 1, rare: 2, common: 3 };
      return (order[a.rarity || 'common'] ?? 3) - (order[b.rarity || 'common'] ?? 3);
    })[0];

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

  const TABS: { id: Tab; label: string }[] = [
    { id: 'courses',      label: '📚 Курсы' },
    { id: 'diary',        label: '📓 Дневник' },
    { id: 'cards',        label: '🃏 Карточки' },
    { id: 'trophies',     label: '🎒 Трофеи' },
    { id: 'before-after', label: '📊 До/После' },
    { id: 'map',          label: '🗺 Карта' },
    { id: 'shop',         label: '🛒 Магазин' },
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
      <AchievementPopup achievement={newAchievement} onDismiss={() => setNewAchievement(null)} />

      {showEdit && (
        <ProfileEditModal
          profile={profile ?? defaultProfile}
          achievements={achievements}
          passedLectures={passedLectures}
          unlockedFrames={unlockedFrames}
          unlockedBgs={unlockedBgs}
          onSave={patch => setProfile(p => p ? { ...p, ...patch } : p)}
          onClose={() => setShowEdit(false)}
        />
      )}

      <div className="max-w-5xl mx-auto px-4 py-6 fade-in">

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
                <span className="text-pixel/40 text-xs font-sans">· {profile.specialization}</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="coin-chip">
                <span className="coin-spin">🪙</span>
                <span>{coins}</span>
              </div>
              {!profile?.is_public && <span className="text-pixel/30 text-xs font-sans">🔒</span>}
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
              <LevelBadge lecturesCompleted={completed} size="sm" />
              <button
                onClick={() => setShowEdit(true)}
                className="font-pixel cursor-pointer"
                style={{
                  fontSize: '0.38rem', lineHeight: 1.8, padding: '4px 10px',
                  background: 'rgba(239,159,39,0.08)',
                  border: '2px solid rgba(239,159,39,0.3)',
                  color: 'rgba(239,159,39,0.7)',
                  transition: 'all 0.12s',
                }}
                onMouseEnter={e => { (e.target as HTMLElement).style.borderColor = '#EF9F27'; (e.target as HTMLElement).style.color = '#EF9F27'; }}
                onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = 'rgba(239,159,39,0.3)'; (e.target as HTMLElement).style.color = 'rgba(239,159,39,0.7)'; }}
              >
                ✏ Изменить
              </button>
            </div>

            {/* CENTER: Info */}
            <div className="flex-1 p-4 min-w-0">
              {profile?.status_quote && (
                <p className="font-sans text-sm italic mb-3" style={{ color: 'rgba(232,232,208,0.5)', borderLeft: '2px solid rgba(239,159,39,0.3)', paddingLeft: 10 }}>
                  "{profile.status_quote}"
                </p>
              )}

              <div className="flex flex-wrap gap-x-5 gap-y-1 mb-3 text-xs font-sans">
                <span style={{ color: (profile?.streak || 0) > 0 ? '#EF9F27' : 'rgba(232,232,208,0.3)' }}>
                  {(profile?.streak || 0) > 0 ? '🔥' : '🐌'}
                  {' '}
                  <span style={{ color: 'rgba(232,232,208,0.6)' }}>
                    {(profile?.streak || 0) > 0
                      ? `${profile?.streak} дн. подряд`
                      : 'Стрик не идёт'}
                  </span>
                </span>
                {profile?.created_at && (
                  <span style={{ color: 'rgba(232,232,208,0.3)' }}>
                    В гильдии с {new Date(profile.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </span>
                )}
              </div>

              {/* Metric mini-cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { label: 'Пройдено',   value: completed,                        color: '#1D9E75' },
                  { label: 'Ср. балл',   value: `${metrics?.averageScore || 0}%`,  color: '#EF9F27' },
                  { label: 'Рост',       value: `+${metrics?.skillGrowth || 0}`,   color: '#7F77DD' },
                  { label: 'До финала',  value: `${metrics?.weeksRemaining || 0}н`, color: '#e8e8d0' },
                ].map((m, i) => (
                  <div key={i} className="rpg-panel-dark p-2 text-center">
                    <p className="text-pixel/40 font-sans" style={{ fontSize: '0.55rem', lineHeight: 1.4 }}>{m.label}</p>
                    <p className="font-pixel" style={{ color: m.color, fontSize: '0.65rem', lineHeight: 1.8 }}>{m.value}</p>
                  </div>
                ))}
              </div>

              {/* Showcase badges */}
              {(profile?.showcase_badges?.length ?? 0) > 0 && (
                <div className="flex items-center gap-2 mt-3">
                  <span className="text-pixel/30 font-pixel" style={{ fontSize: '0.38rem' }}>ВИТРИНА:</span>
                  {profile!.showcase_badges.map(id => {
                    const ach = achievements.find(a => a.id === id);
                    if (!ach) return null;
                    return (
                      <div key={id} className="group relative flex items-center gap-1 px-2 py-1"
                        style={{ background: 'rgba(239,159,39,0.07)', border: '1px solid rgba(239,159,39,0.3)' }}>
                        <span style={{ fontSize: '0.9rem' }}>{ach.icon}</span>
                        <div className="pointer-events-none opacity-0 group-hover:opacity-100 absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-xs font-sans z-20 transition-opacity"
                          style={{ background: '#0f0f1a', border: '1px solid rgba(239,159,39,0.4)', whiteSpace: 'nowrap', color: '#EF9F27' }}>
                          {ach.name}
                        </div>
                      </div>
                    );
                  })}
                  {rarestAch && !profile!.showcase_badges.includes(rarestAch.id) && (
                    <div className="flex items-center gap-1 px-2 py-1 gold-shimmer-bg">
                      <span style={{ fontSize: '0.9rem' }}>{rarestAch.icon}</span>
                      <span className="font-pixel" style={{ fontSize: '0.38rem', color: '#EF9F27' }}>РЕД.</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* RIGHT: RPG Stats panel */}
            {profile?.stats && (
              <div className="shrink-0 p-4" style={{ width: 180, borderLeft: '2px solid rgba(42,31,79,0.5)' }}>
                <p className="font-pixel mb-3" style={{ fontSize: '0.42rem', color: 'rgba(127,119,221,0.7)', lineHeight: 1.8, letterSpacing: '0.05em' }}>
                  ⚔ ХАРАКТЕРИСТИКИ
                </p>
                <div className="space-y-2">
                  <StatRow label="🧠 INT"   value={profile.stats.int}     max={10} color="#7F77DD" />
                  <StatRow label="👁 PER"   value={profile.stats.per}     max={10} color="#1D9E75" />
                  <StatRow label="⚡ SPD"   value={profile.stats.spd}     max={10} color="#EF9F27" />
                  <StatRow label="🛡 DEF"   value={profile.stats.def}     max={10} color="#4cc9f0" />
                  <StatRow label="🐛 PWR"   value={profile.stats.bug_pwr} max={20} color="#e05252" />
                </div>
              </div>
            )}
          </div>

          {/* Info box */}
          {profile?.info_box && (
            <>
              <div className="rpg-divider" />
              <div className="px-5 py-3">
                <p className="text-xs font-sans leading-relaxed" style={{ color: 'rgba(232,232,208,0.5)', borderLeft: '2px solid rgba(29,158,117,0.25)', paddingLeft: 10 }}>
                  {profile.info_box}
                </p>
              </div>
            </>
          )}
        </RpgPanel>

        {/* ── FAVOURITE LECTURE ── */}
        {profile?.favLecture && (
          <RpgPanel className="p-4 mb-5 flex items-center gap-4">
            <span style={{ fontSize: '1.5rem', flexShrink: 0 }}>⭐</span>
            <div className="flex-1 min-w-0">
              <p className="font-pixel mb-1" style={{ fontSize: '0.42rem', color: '#EF9F27', lineHeight: 1.8 }}>ЛЮБИМАЯ ЛЕКЦИЯ</p>
              <p className="text-pixel font-sans font-semibold text-sm">{profile.favLecture.title}</p>
              <p className="text-pixel/40 text-xs font-sans">
                {profile.favLecture.skill_area}
                {profile.favLecture.score != null && <> · <span style={{ color: '#1D9E75' }}>{Math.round(profile.favLecture.score)}%</span></>}
              </p>
            </div>
            <button
              onClick={() => navigate(`/lecture/${profile.favLecture!.id}/quiz`)}
              className="btn-amber text-xs px-3 py-2 cursor-pointer shrink-0"
            >Перечитать →</button>
          </RpgPanel>
        )}

        {/* ── JOKE OF THE DAY ── */}
        <RpgPanel variant="dark" className="p-4 mb-5 flex items-start gap-3">
          <span style={{ fontSize: '1.4rem', lineHeight: 1, flexShrink: 0 }}>{todayJoke.emoji}</span>
          <div>
            <p className="font-pixel mb-1" style={{ color: 'rgba(29,158,117,0.6)', fontSize: '0.42rem', lineHeight: 1.8 }}>ФАКТ ДНЯ</p>
            <p className="text-pixel/60 text-xs font-sans leading-relaxed">{todayJoke.text}</p>
          </div>
        </RpgPanel>

        {/* ══════════════════════════════════════════════════════════
            TAB BAR  (HoMM-style beveled buttons)
        ══════════════════════════════════════════════════════════ */}
        <div className="flex flex-wrap gap-0 mb-5" style={{ borderBottom: '3px solid #2a1f4f' }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rpg-tab ${tab === t.id ? 'rpg-tab-active' : ''}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════════════
            COURSES
        ══════════════════════════════════════════════════════════ */}
        {tab === 'courses' && (
          <div className="space-y-3">
            {lectures.map((lecture, idx) => {
              const isActive = lecture.status === 'active';
              const isPassed = lecture.status === 'passed';
              const isLocked = lecture.status === 'locked';
              const bc = isPassed ? '#1D9E75' : isActive ? '#EF9F27' : '#2a1f4f';
              return (
                <RpgPanel
                  key={lecture.id}
                  corners={false}
                  className={`p-4 transition-all ${isActive ? 'cursor-pointer' : ''}`}
                  style={{ borderColor: bc, opacity: isLocked ? 0.5 : 1 }}
                  onClick={() => isActive && navigate(`/lecture/${lecture.id}/quiz`)}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1 min-w-0 mr-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-pixel/30 text-xs font-sans shrink-0">{String(idx + 1).padStart(2, '0')}.</span>
                        <p className="text-pixel font-sans font-semibold text-sm leading-snug">{isLocked ? '🔒 ' : ''}{lecture.title}</p>
                      </div>
                      <p className="text-pixel/40 text-xs font-sans ml-6">{lecture.skill_area}</p>
                    </div>
                    <div className="shrink-0">
                      {isPassed && <span className="badge-passed">сдан ✓</span>}
                      {isActive && <span className="badge-active">активна →</span>}
                      {isLocked && <span className="badge-locked">закрыта</span>}
                    </div>
                  </div>
                  {!isLocked && (
                    <div className="flex items-center gap-3">
                      <div className="xp-bar-track flex-1" style={{ height: 8 }}>
                        <div className="xp-bar-fill" style={{ width: isPassed ? `${lecture.score || 0}%` : '0%', height: 8 }} />
                      </div>
                      <span className="text-pixel/60 text-xs font-sans min-w-[40px] text-right">{isPassed ? `${lecture.score}%` : '—'}</span>
                    </div>
                  )}
                </RpgPanel>
              );
            })}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════
            DIARY
        ══════════════════════════════════════════════════════════ */}
        {tab === 'diary' && (
          <div>
            <div className="rpg-banner mb-4">📓 ИСТОРИЯ ТЕСТОВ</div>
            {history.length === 0 ? (
              <RpgPanel variant="dark" className="text-center py-12">
                <p className="text-pixel/40 text-sm font-sans">Тесты ещё не сданы</p>
              </RpgPanel>
            ) : (
              <div className="space-y-2">
                {history.map(item => (
                  <RpgPanel
                    key={item.id}
                    corners={false}
                    className="p-4 flex items-center justify-between gap-4"
                    style={{ borderColor: item.score >= 60 ? '#1D9E75' : '#e05252' }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-pixel font-sans font-semibold text-sm leading-snug mb-1">{item.lecture_title}</p>
                      <p className="text-pixel/40 text-xs font-sans">{item.skill_area} · {new Date(item.completed_at).toLocaleDateString('ru-RU')}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-pixel text-lg" style={{ color: item.score >= 60 ? '#1D9E75' : '#e05252', lineHeight: 1.6 }}>{Math.round(item.score)}%</p>
                      <p className="text-pixel/30 text-xs font-sans">{item.score >= 60 ? 'сдан' : 'не сдан'}</p>
                    </div>
                  </RpgPanel>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════
            CARDS  (RPG inventory style)
        ══════════════════════════════════════════════════════════ */}
        {tab === 'cards' && (
          <div>
            <div className="rpg-banner mb-4">🃏 ИНВЕНТАРЬ КАРТОЧЕК</div>
            <p className="text-pixel/30 text-xs font-sans mb-5">Карточки выпадают за сданные тесты. Собери все в блоке — скрафти значок жука!</p>

            {/* Block progress */}
            <div className="space-y-3 mb-7">
              {Object.entries(BADGE_META).map(([skillArea, meta]) => {
                const collected = profile?.cards.filter(c => c.skill_area === skillArea).length || 0;
                const total     = lectures.filter(l => l.skill_area === skillArea).length;
                const hasBadge  = profile?.badges.some(b => b.badge_id === skillArea);
                const canCraft  = profile?.craftable?.includes(skillArea) && !hasBadge;
                const pct       = total > 0 ? (collected / total) * 100 : 0;
                return (
                  <RpgPanel
                    key={skillArea}
                    corners={false}
                    className="p-3"
                    style={{ borderColor: hasBadge ? meta.color : '#2a1f4f' }}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-2">
                        <span style={{ fontSize: '1.1rem' }}>{hasBadge ? '✅' : meta.icon}</span>
                        <span className="text-pixel font-sans font-semibold text-sm">{meta.name}</span>
                        {hasBadge && <span className="font-pixel" style={{ fontSize: '0.38rem', color: meta.color, lineHeight: 1.8 }}>ЗНАЧОК</span>}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-pixel/50 text-xs font-sans">{collected}/{total}</span>
                        {canCraft && (
                          <button
                            onClick={() => handleCraft(skillArea)}
                            disabled={crafting === skillArea}
                            className="font-pixel px-3 py-1 cursor-pointer"
                            style={{ fontSize: '0.42rem', lineHeight: 1.8, background: 'rgba(239,159,39,0.12)', border: '2px solid rgba(239,159,39,0.5)', color: '#EF9F27', animation: 'epic-badge-pulse 1.8s ease-in-out infinite' }}
                          >
                            {crafting === skillArea ? '...' : '⚒ КРАФТ'}
                          </button>
                        )}
                        {craftSuccess === skillArea && (
                          <span className="font-pixel text-primary" style={{ fontSize: '0.42rem', lineHeight: 1.8 }}>✓ ГОТОВО!</span>
                        )}
                      </div>
                    </div>
                    <div className="xp-bar-track" style={{ height: 6 }}>
                      <div className="xp-bar-fill" style={{ width: `${pct}%`, height: 6, background: meta.color }} />
                    </div>
                  </RpgPanel>
                );
              })}
            </div>

            {/* Card grid */}
            <div className="rpg-banner mb-3">КАРТОЧКИ В ИНВЕНТАРЕ</div>
            {(profile?.cards.length || 0) === 0 ? (
              <RpgPanel variant="dark" className="text-center py-10">
                <p className="text-pixel/40 text-sm font-sans">Нет карточек — сдай тест чтобы получить первую</p>
              </RpgPanel>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {profile?.cards.map(card => {
                  const meta = BADGE_META[card.skill_area];
                  const slotCls =
                    card.rarity === 'epic'  ? 'inv-slot inv-slot-epic' :
                    card.rarity === 'rare'  ? 'inv-slot inv-slot-rare' :
                                             'inv-slot inv-slot-earned';
                  return (
                    <div key={card.id} className={`${slotCls} p-3 flex flex-col gap-2`} style={{ minHeight: 100 }}>
                      <div className="flex justify-between items-start">
                        <span style={{ fontSize: '1.3rem' }}>{meta?.icon || '🃏'}</span>
                        {card.rarity !== 'common' && (
                          <span className={`font-pixel ${card.rarity === 'epic' ? 'gold-shimmer' : ''}`}
                            style={{ fontSize: '0.36rem', color: RARITY_COLORS[card.rarity as keyof typeof RARITY_COLORS] || '#1D9E75' }}>
                            {RARITY_LABEL[card.rarity as keyof typeof RARITY_LABEL] || ''}
                          </span>
                        )}
                      </div>
                      <p className="text-pixel font-sans text-xs font-semibold leading-snug flex-1">
                        {card.lecture_title || card.skill_area}
                      </p>
                      <div className="flex items-center gap-1">
                        <div style={{ width: 7, height: 7, background: RARITY_COLORS[card.rarity as keyof typeof RARITY_COLORS] || '#1D9E75' }} />
                        <span className="text-pixel/35 font-sans" style={{ fontSize: '0.55rem' }}>
                          {new Date(card.earned_at).toLocaleDateString('ru-RU')}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════
            TROPHIES  (RPG trophy grid)
        ══════════════════════════════════════════════════════════ */}
        {tab === 'trophies' && (
          <div>
            <div className="rpg-banner mb-5">🎒 КОЛЛЕКЦИЯ ТРОФЕЕВ</div>
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
              {achievements.map(ach => {
                const rarity   = ach.rarity || 'common';
                const isSecret = rarity === 'secret';
                const slotCls  =
                  ach.earned && rarity === 'epic'   ? 'inv-slot inv-slot-epic'  :
                  ach.earned && rarity === 'rare'   ? 'inv-slot inv-slot-rare'  :
                  ach.earned                        ? 'inv-slot inv-slot-earned' :
                                                      'inv-slot';
                return (
                  <div
                    key={ach.id}
                    className={`group relative ${slotCls} p-3 flex flex-col items-center gap-2 transition-transform hover:-translate-y-0.5`}
                    style={{ minHeight: 108, opacity: ach.earned ? 1 : 0.4, filter: ach.earned ? 'none' : 'grayscale(1)' }}
                  >
                    {ach.earned && rarity !== 'common' && (
                      <span className={`absolute top-1 right-1 font-pixel leading-none ${rarity === 'epic' ? 'gold-shimmer' : ''}`}
                        style={{ fontSize: '0.33rem', color: rarity === 'rare' ? '#7F77DD' : undefined }}>
                        {rarity === 'secret' ? '🔮' : rarity.toUpperCase()}
                      </span>
                    )}
                    <div className="text-3xl mt-1 leading-none">
                      {ach.earned ? ach.icon : isSecret ? '🔮' : '❓'}
                    </div>
                    <p className="font-pixel text-center leading-relaxed"
                      style={{ color: ach.earned ? rarity === 'epic' ? '#EF9F27' : rarity === 'rare' ? '#7F77DD' : '#e8e8d0' : 'rgba(232,232,208,0.25)', fontSize: '0.4rem' }}>
                      {ach.earned ? ach.name : isSecret ? '???' : '???'}
                    </p>
                    {ach.earned && <span className="text-primary font-sans" style={{ fontSize: '0.6rem' }}>✓</span>}
                    {/* Tooltip */}
                    <div className="pointer-events-none absolute z-30 px-3 py-2 text-xs font-sans opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ background: '#0f0f1a', border: '2px solid #2a1f4f', boxShadow: '0 0 0 1px rgba(239,159,39,0.2)', bottom: '110%', left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap', color: '#e8e8d0', minWidth: 150 }}>
                      <p className="font-semibold mb-0.5">{ach.earned ? ach.name : isSecret ? 'Секретное' : 'Заблокировано'}</p>
                      <p style={{ color: ach.earned ? '#1D9E75' : 'rgba(232,232,208,0.4)' }}>
                        {ach.earned ? '✓ получено' : isSecret ? 'Узнай сам...' : ach.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════
            BEFORE / AFTER
        ══════════════════════════════════════════════════════════ */}
        {tab === 'before-after' && (
          <div>
            <div className="grid grid-cols-2 gap-4 mb-6">
              {[
                { label: 'ТЫ ПРИ ВХОДЕ', emoji: '🥚', sublabel: 'стартовый уровень', color: 'rgba(232,232,208,0.3)', dim: true },
                { label: 'ТЫ СЕЙЧАС',    emoji: level.emoji, sublabel: level.name,  color: '#1D9E75',              dim: false },
              ].map((side, i) => (
                <RpgPanel key={i} corners={false} className="p-5 flex flex-col items-center gap-2" style={{ borderColor: side.color, opacity: side.dim ? 0.6 : 1 }}>
                  <p className="font-pixel" style={{ color: side.color, fontSize: '0.42rem', lineHeight: 1.8 }}>{side.label}</p>
                  <div style={{ fontSize: '2.5rem', lineHeight: 1 }}>{side.emoji}</div>
                  <p className="text-pixel/50 text-xs font-sans">{side.sublabel}</p>
                </RpgPanel>
              ))}
            </div>

            {beforeAfter.length === 0 || beforeAfter.every(s => s.before === 0) ? (
              <RpgPanel variant="dark" className="text-center py-12">
                <p className="text-pixel/40 text-sm font-sans">Нет данных</p>
              </RpgPanel>
            ) : (
              <div className="space-y-4">
                {beforeAfter.map(skill => (
                  <RpgPanel key={skill.skill} corners={false} className="p-4">
                    <div className="flex justify-between items-center mb-3">
                      <p className="text-pixel font-sans font-semibold text-sm">{skill.skill}</p>
                      {skill.delta !== 0 && (
                        <span className="text-xs font-sans font-bold px-2 py-0.5"
                          style={{ color: skill.delta > 0 ? '#1D9E75' : '#e05252', background: skill.delta > 0 ? 'rgba(29,158,117,0.12)' : 'rgba(224,82,82,0.08)', border: `1px solid ${skill.delta > 0 ? '#1D9E75' : '#e05252'}40` }}>
                          {skill.delta > 0 ? `+${skill.delta}` : skill.delta}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                      {[
                        { label: 'при входе', value: skill.before, color: '#EF9F2770' },
                        { label: 'сейчас',    value: skill.after,  color: '#1D9E75' },
                      ].map(side => (
                        <div key={side.label}>
                          <p className="text-pixel/35 text-xs font-sans mb-2">{side.label}</p>
                          <Stars value={side.value} color={side.color} />
                          <p className="text-pixel/30 text-xs font-sans mt-1">{side.value}/5</p>
                        </div>
                      ))}
                    </div>
                  </RpgPanel>
                ))}
              </div>
            )}

            <RpgPanel variant="dark" className="mt-6 p-5 text-center">
              <p className="font-pixel leading-loose" style={{ color: growthSummary.color, fontSize: '0.52rem' }}>{growthSummary.text}</p>
            </RpgPanel>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════
            MAP
        ══════════════════════════════════════════════════════════ */}
        {tab === 'map' && (
          <div>
            <div className="rpg-banner mb-3">🗺 КАРТА ПРОГРЕССА</div>
            <p className="text-pixel/30 text-xs font-sans mb-7">{completed} / {lectures.length} пройдено · наведи на узел чтобы увидеть название</p>
            <RpgPanel variant="dark" className="p-5 overflow-x-auto">
              <div style={{ minWidth: 520 }}>
                <div className="flex items-center gap-0">
                  {row1.map((lec, i) => (
                    <div key={lec.id} className="flex items-center flex-1">
                      <MapNode lecture={lec} index={lec.order_num} />
                      {i < row1.length - 1 && <HLine passed={lec.status === 'passed'} />}
                    </div>
                  ))}
                </div>
                <div className="flex justify-end" style={{ paddingRight: 24 }}>
                  <div style={{ width: 3, height: 28, background: row1LastPass ? 'repeating-linear-gradient(to bottom, #1D9E75 0 6px, transparent 6px 10px)' : 'repeating-linear-gradient(to bottom, rgba(232,232,208,0.1) 0 6px, transparent 6px 10px)' }} />
                </div>
                <div className="flex items-center gap-0">
                  {row2.map((lec, i) => (
                    <div key={lec.id} className="flex items-center flex-1">
                      <MapNode lecture={lec} index={lec.order_num} />
                      {i < row2.length - 1 && <HLine passed={row2[i + 1].status === 'passed'} />}
                    </div>
                  ))}
                </div>
              </div>
            </RpgPanel>
            <div className="flex gap-5 mt-5">
              {[{ color: '#1D9E75', label: 'Пройдено' }, { color: '#EF9F27', label: 'Активна' }, { color: 'rgba(232,232,208,0.2)', label: 'Закрыта' }].map(item => (
                <div key={item.label} className="flex items-center gap-2">
                  <div style={{ width: 12, height: 12, background: item.color, flexShrink: 0 }} />
                  <span className="text-pixel/40 text-xs font-sans">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════
            SHOP  (Магазин жуко-монет)
        ══════════════════════════════════════════════════════════ */}
        {tab === 'shop' && (
          <div>
            <div className="rpg-banner flex items-center justify-between mb-5">
              <span>🛒 МАГАЗИН</span>
              <div className="coin-chip">
                <span className="coin-spin">🪙</span>
                <span>У тебя: {coins}</span>
              </div>
            </div>

            <p className="text-pixel/30 text-xs font-sans mb-6 leading-relaxed">
              Зарабатывай жуко-монеты за сдачу тестов (+10 за прохождение, +8 за ≥75%, +25 за ≥90%)
              и трать их на косметику для профиля!
            </p>

            {/* Frames section */}
            <p className="font-pixel mb-3" style={{ fontSize: '0.48rem', color: 'rgba(232,232,208,0.5)', lineHeight: 1.8 }}>🖼 РАМКИ ДЛЯ ПОРТРЕТА</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-7">
              {SHOP_CATALOG.filter(i => i.type === 'frame').map(item => {
                const owned    = purchased.includes(item.id) || unlockedFrames.includes(item.id.replace('frame_', ''));
                const canAfford = coins >= item.cost;
                return (
                  <div
                    key={item.id}
                    className={`shop-card ${owned ? 'shop-card-owned' : ''} p-4`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <span style={{ fontSize: '1.6rem' }}>{item.icon}</span>
                      {owned
                        ? <span className="font-pixel" style={{ fontSize: '0.38rem', color: '#1D9E75', lineHeight: 1.8 }}>✓ ЕСТЬ</span>
                        : <div className="coin-chip" style={{ fontSize: '0.38rem', padding: '2px 6px' }}>🪙 {item.cost}</div>
                      }
                    </div>
                    <p className="font-pixel mb-1" style={{ fontSize: '0.5rem', color: '#e8e8d0', lineHeight: 1.8 }}>{item.label}</p>
                    <p className="text-pixel/40 text-xs font-sans mb-3">{item.desc}</p>
                    {!owned && (
                      <button
                        onClick={() => handleBuy(item.id)}
                        disabled={!canAfford || buying === item.id}
                        className="font-pixel w-full py-2 cursor-pointer transition-all"
                        style={{
                          fontSize: '0.42rem', lineHeight: 1.8,
                          background: canAfford ? 'rgba(239,159,39,0.1)' : 'rgba(232,232,208,0.04)',
                          border: `2px solid ${canAfford ? 'rgba(239,159,39,0.5)' : 'rgba(232,232,208,0.1)'}`,
                          color: canAfford ? '#EF9F27' : 'rgba(232,232,208,0.2)',
                          cursor: canAfford ? 'pointer' : 'not-allowed',
                        }}
                      >
                        {buying === item.id ? '...' : canAfford ? 'КУПИТЬ' : 'МАЛО МОНЕТ'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Backgrounds section */}
            <p className="font-pixel mb-3" style={{ fontSize: '0.48rem', color: 'rgba(232,232,208,0.5)', lineHeight: 1.8 }}>🌅 ФОНЫ ДЛЯ ПРОФИЛЯ</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
              {SHOP_CATALOG.filter(i => i.type === 'bg').map(item => {
                const owned    = purchased.includes(item.id) || unlockedBgs.includes(item.id.replace('bg_', ''));
                const canAfford = coins >= item.cost;
                return (
                  <div
                    key={item.id}
                    className={`shop-card ${owned ? 'shop-card-owned' : ''} p-4 flex items-start gap-4`}
                  >
                    <span style={{ fontSize: '1.8rem', flexShrink: 0 }}>{item.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-pixel" style={{ fontSize: '0.5rem', color: '#e8e8d0', lineHeight: 1.8 }}>{item.label}</p>
                        {owned
                          ? <span className="font-pixel" style={{ fontSize: '0.38rem', color: '#1D9E75', lineHeight: 1.8 }}>✓ ЕСТЬ</span>
                          : <div className="coin-chip" style={{ fontSize: '0.38rem', padding: '2px 6px' }}>🪙 {item.cost}</div>
                        }
                      </div>
                      <p className="text-pixel/40 text-xs font-sans mb-2">{item.desc}</p>
                      {!owned && (
                        <button
                          onClick={() => handleBuy(item.id)}
                          disabled={!canAfford || buying === item.id}
                          className="font-pixel px-4 py-1 cursor-pointer"
                          style={{
                            fontSize: '0.42rem', lineHeight: 1.8,
                            background: canAfford ? 'rgba(239,159,39,0.1)' : 'rgba(232,232,208,0.04)',
                            border: `2px solid ${canAfford ? 'rgba(239,159,39,0.5)' : 'rgba(232,232,208,0.1)'}`,
                            color: canAfford ? '#EF9F27' : 'rgba(232,232,208,0.2)',
                            cursor: canAfford ? 'pointer' : 'not-allowed',
                          }}
                        >
                          {buying === item.id ? '...' : canAfford ? 'КУПИТЬ' : 'МАЛО МОНЕТ'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <RpgPanel variant="dark" className="p-4 text-center">
              <p className="font-pixel mb-1" style={{ fontSize: '0.45rem', color: 'rgba(239,159,39,0.5)', lineHeight: 1.8 }}>КАК ЗАРАБАТЫВАТЬ 🪙</p>
              <div className="flex flex-wrap justify-center gap-4 mt-2 text-xs font-sans text-pixel/50">
                <span>+10 за прохождение теста</span>
                <span>+8 за балл ≥75%</span>
                <span>+25 за балл ≥90%</span>
                <span>+3 за любой тест</span>
              </div>
            </RpgPanel>
          </div>
        )}

      </div>
    </div>
  );
}
