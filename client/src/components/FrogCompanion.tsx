import { useEffect, useRef, useState } from 'react';
import FrogIcon from './FrogIcon';
import { ACCENT, BADGE_NOTIFY } from '../utils/theme';

// Replaces the old AmbientSnail (crawled a fixed 120s loop along the header
// border, purely decorative). The user asked for something more alive:
// this mascot sits in the corner, leans toward the cursor (the cheapest
// "watching you" cue available on a solid-silhouette sprite — FrogIcon has
// no separate eye layer to actually track with), hops on its own every so
// often, and on click flicks its tongue out to snag a passing bug emoji —
// a small nod to the app's whole "QA testers catch bugs" premise. All
// motion is skipped for prefers-reduced-motion (renders a static frog).
export default function FrogCompanion() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [leanDeg, setLeanDeg] = useState(0);
  const [hopping, setHopping] = useState(false);
  const [catching, setCatching] = useState(false);
  const reducedMotion = useRef(
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
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

  return (
    <div
      className="fixed z-40 pointer-events-none select-none hidden sm:block"
      style={{ bottom: 54, right: 24 }}
      aria-hidden="true"
    >
      <div ref={wrapRef} style={{ transform: `rotate(${leanDeg}deg)`, transition: 'transform 0.3s ease-out' }}>
        <div
          onClick={() => setCatching(prev => prev || true)}
          className={hopping ? 'frog-companion-hop' : 'frog-companion-idle'}
          style={{ pointerEvents: 'auto', cursor: 'pointer', position: 'relative', width: 52, height: 58 }}
          title="Поймать жука 🐸"
        >
          <FrogIcon size={52} color={ACCENT} />
          {catching && (
            <>
              <div
                className="frog-companion-tongue"
                style={{ position: 'absolute', left: '58%', bottom: '68%', width: 5, background: BADGE_NOTIFY, borderRadius: 3 }}
              />
              <span
                className="frog-companion-bug"
                onAnimationEnd={() => setCatching(false)}
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
