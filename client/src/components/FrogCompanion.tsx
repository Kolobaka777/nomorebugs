import { useEffect, useRef, useState } from 'react';
import PixelFrogSprite from './PixelFrogSprite';
import { BADGE_META } from '../utils/badges';
import { ACHIEVEMENT_EARNED_EVENT } from '../utils/achievements';
import { ACCENT, BADGE_NOTIFY, CARD_BG, TEXT_PRIMARY, CARD_SHADOW_TALL } from '../utils/theme';

// Replaces the old AmbientSnail (crawled a fixed 120s loop along the header
// border, purely decorative). The user asked for something more alive:
// this mascot sits in the corner, leans toward the cursor (the cheapest
// "watching you" cue available on a solid-silhouette sprite), hops on its
// own every so often, and on click flicks its tongue out to snag a passing
// bug emoji — a small nod to the app's whole "QA testers catch bugs"
// premise. Now also the site's designated "helper" — the same chunky
// pixel sprite the loading screens use (PixelFrogSprite, swapped in for
// the old smooth FrogIcon so every frog in the app reads as one
// character), and it occasionally pops up a speech bubble with a short
// tip or bit of encouragement, unprompted, like an old-school desktop
// assistant but considerably less annoying about it. All motion is
// skipped for prefers-reduced-motion (renders a static frog, no bubbles).
const TIPS = [
  'Совет: избранные курсы и лекции удобно смотреть на своей странице — там же и заметки к урокам.',
  'В Багодельне можно предложить свой пример бага — лид посмотрит и опубликует.',
  'Стрик считается по твоему дню, не по серверному времени — не переживай про полночь.',
  'Если что-то непонятно — загляни в «Помощь», там ответы на частые вопросы.',
  'Можно загрузить свою аватарку и сделать её доступной всем в общей галерее.',
  'Идея или что-то бесит — пиши на доске предложений, лид правда читает.',
  'Пароль лучше сменить, если он временный — иначе будет всё время напоминать.',
  'Держишь стрик? Так и продолжай, я слежу 👀',
  'Пройденные курсы можно переслушать в любой момент — они никуда не денутся.',
];

export default function FrogCompanion() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [leanDeg, setLeanDeg] = useState(0);
  const [hopping, setHopping] = useState(false);
  const [catching, setCatching] = useState(false);
  const [bubble, setBubble] = useState<string | null>(null);
  const catchingRef = useRef(false);
  const reducedMotion = useRef(
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  // Lean toward the cursor — rAF-throttled so it doesn't spam re-renders.
  useEffect(() => {
    if (reducedMotion.current) return;
    let ticking = false;
    function onMove(e: MouseEvent) {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const el = wrapRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const dx = e.clientX - (rect.left + rect.width / 2);
        setLeanDeg(Math.max(-15, Math.min(15, (dx / 220) * 15)));
      });
    }
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

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
  // shown for a few seconds then cleared. Doesn't fire while a bug-catch
  // animation is already playing, so the two never visually collide.
  useEffect(() => {
    if (reducedMotion.current) return;
    let timer: ReturnType<typeof setTimeout>;
    let hideTimer: ReturnType<typeof setTimeout>;
    function scheduleTip() {
      timer = setTimeout(() => {
        setBubble(prev => (prev || catchingRef.current ? prev : TIPS[Math.floor(Math.random() * TIPS.length)]));
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
      aria-hidden="true"
    >
      <div ref={wrapRef} style={{ transform: `rotate(${leanDeg}deg)`, transition: 'transform 0.3s ease-out' }}>
        {bubble && (
          <div
            className="frog-companion-bubble"
            style={{
              position: 'absolute', bottom: '112%', right: -8, width: 208,
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
        <div
          onClick={() => { setCatching(prev => prev || true); catchingRef.current = true; setBubble(null); }}
          className={hopping ? 'frog-companion-hop' : 'frog-companion-idle'}
          style={{ pointerEvents: 'auto', cursor: 'pointer', position: 'relative', width: 56, height: 56 }}
          title="Поймать жука 🐸"
        >
          <PixelFrogSprite size={56} />
          {catching && (
            <>
              <div
                className="frog-companion-tongue"
                style={{ position: 'absolute', left: '58%', bottom: '68%', width: 5, background: BADGE_NOTIFY, borderRadius: 3 }}
              />
              <span
                className="frog-companion-bug"
                onAnimationEnd={() => { setCatching(false); catchingRef.current = false; }}
                style={{ position: 'absolute', left: '48%', bottom: '128%', fontSize: 16, display: 'inline-block' }}
              >
                🐛
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
