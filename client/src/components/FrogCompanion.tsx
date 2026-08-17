import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PixelFrogKnightSprite from './PixelFrogKnightSprite';
import { BADGE_META } from '../utils/badges';
import { ACHIEVEMENT_EARNED_EVENT } from '../utils/achievements';
import { ACCENT, CARD_BG, TEXT_PRIMARY, CARD_SHADOW_TALL } from '../utils/theme';

// Replaces the old AmbientSnail (crawled a fixed 120s loop along the header
// border, purely decorative). The user asked for something more alive:
// this mascot sits in the corner, hops on its own every so often, and
// occasionally pops up a speech bubble with a short tip or bit of
// encouragement, unprompted, like an old-school desktop assistant but
// considerably less annoying about it. All motion is skipped for
// prefers-reduced-motion (renders a static frog, no bubbles).
//
// It is also the site's designated "helper", and now says so with more than
// a tooltip: it's a real button that opens «Помощь», and hovering it winds
// the mascot up — sword swinging, crocodile galloping (see
// PixelFrogKnightSprite + the .frog-knight-* rules in index.css).
//
// Two behaviours were dropped when that landed. The click-to-flick-the-
// tongue bug catch went because the click now navigates, and its anchor
// pointed at the frog's eye instead of its mouth. The lean-toward-the-cursor
// tilt went because it rotated the whole scene: a crocodile tipping over to
// follow the mouse is not a thing, and the sprite has plenty of life without
// it.
const TIPS = [
  'Совет: избранные курсы и лекции удобно смотреть на своей странице — там же и заметки к урокам.',
  'В Багодельне можно предложить свой пример бага — лид посмотрит и опубликует.',
  'Стрик считается по твоему дню, не по серверному времени — не переживай про полночь.',
  'Если что-то непонятно — жми на меня, там ответы на частые вопросы.',
  'Можно загрузить свою аватарку и сделать её доступной всем в общей галерее.',
  'Идея или что-то бесит — пиши на доске предложений, лид правда читает.',
  'Пароль лучше сменить, если он временный — иначе будет всё время напоминать.',
  'Держишь стрик? Так и продолжай, я слежу 👀',
  'Пройденные курсы можно переслушать в любой момент — они никуда не денутся.',
];

export default function FrogCompanion() {
  const navigate = useNavigate();
  const [hopping, setHopping] = useState(false);
  const [charging, setCharging] = useState(false);
  const [bubble, setBubble] = useState<string | null>(null);
  const reducedMotion = useRef(
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  // Occasional idle hop, purely for life — random 8-16s gap, self-scheduling.
  useEffect(() => {
    if (reducedMotion.current) return;
    let timer: ReturnType<typeof setTimeout>;
    let hopEndTimer: ReturnType<typeof setTimeout>;
    function scheduleHop() {
      timer = setTimeout(() => {
        setHopping(true);
        hopEndTimer = setTimeout(() => setHopping(false), 600);
        scheduleHop();
      }, 8000 + Math.random() * 8000);
    }
    scheduleHop();
    return () => { clearTimeout(timer); clearTimeout(hopEndTimer); };
  }, []);

  // Occasional unprompted tip in a speech bubble — much rarer than the hop
  // (a helper that pipes up every 10 seconds is a menace, not a mascot),
  // shown for a few seconds then cleared.
  useEffect(() => {
    if (reducedMotion.current) return;
    let timer: ReturnType<typeof setTimeout>;
    let hideTimer: ReturnType<typeof setTimeout>;
    function scheduleTip() {
      timer = setTimeout(() => {
        setBubble(prev => prev || TIPS[Math.floor(Math.random() * TIPS.length)]);
        hideTimer = setTimeout(() => setBubble(null), 6000);
        scheduleTip();
      }, 45000 + Math.random() * 30000);
    }
    scheduleTip();
    return () => { clearTimeout(timer); clearTimeout(hideTimer); };
  }, []);

  // Real praise, not just a scheduled tip — fires the moment a route
  // reports a newly-earned achievement (see utils/achievements.ts). Jumps
  // the queue over any pending random tip and adds a hop for emphasis.
  useEffect(() => {
    function onEarned(e: Event) {
      const badgeIds = (e as CustomEvent<string[]>).detail || [];
      const names = badgeIds.map(id => BADGE_META[id]?.name).filter(Boolean);
      if (!names.length) return;
      const text = names.length === 1
        ? `Ого, новая ачивка: «${names[0]}»! Красава 🎉`
        : `Сразу несколько ачивок: ${names.map(n => `«${n}»`).join(', ')}! 🎉`;
      setBubble(text);
      if (!reducedMotion.current) {
        setHopping(true);
        setTimeout(() => setHopping(false), 600);
      }
      setTimeout(() => setBubble(prev => (prev === text ? null : prev)), 7000);
    }
    window.addEventListener(ACHIEVEMENT_EARNED_EVENT, onEarned);
    return () => window.removeEventListener(ACHIEVEMENT_EARNED_EVENT, onEarned);
  }, []);

  return (
    <div
      className="fixed z-40 pointer-events-none select-none hidden sm:block"
      style={{ bottom: 54, right: 24 }}
    >
      <div>
        {bubble && (
          <div
            className="frog-companion-bubble"
            aria-hidden="true"
            style={{
              position: 'absolute', bottom: '108%', right: -8, width: 208,
              background: CARD_BG, border: `1px solid ${ACCENT}`, borderRadius: 10,
              boxShadow: CARD_SHADOW_TALL, padding: '10px 12px', pointerEvents: 'none',
            }}
          >
            <p className="font-geist" style={{ fontSize: 13, lineHeight: 1.5, color: TEXT_PRIMARY }}>{bubble}</p>
            {/* Little speech-bubble tail pointing down at the frog. */}
            <div
              style={{
                position: 'absolute', bottom: -7, right: 20, width: 12, height: 12,
                background: CARD_BG, borderRight: `1px solid ${ACCENT}`, borderBottom: `1px solid ${ACCENT}`,
                transform: 'rotate(45deg)',
              }}
            />
          </div>
        )}
        <button
          type="button"
          onClick={() => { setBubble(null); navigate('/help'); }}
          // Focus mirrors hover so the wind-up isn't mouse-only — the button
          // is reachable by keyboard and should react the same way there.
          onMouseEnter={() => setCharging(true)}
          onMouseLeave={() => setCharging(false)}
          onFocus={() => setCharging(true)}
          onBlur={() => setCharging(false)}
          className={hopping ? 'frog-companion-hop' : 'frog-companion-idle'}
          style={{ pointerEvents: 'auto', cursor: 'pointer', display: 'block', background: 'none', border: 'none', padding: 0 }}
          aria-label="Открыть раздел «Помощь»"
          title="Помощь"
        >
          <PixelFrogKnightSprite size={72} charging={charging} />
        </button>
      </div>
    </div>
  );
}
