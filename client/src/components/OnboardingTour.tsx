import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Icon from './Icon';
import PixelFrogKnightSprite from './PixelFrogKnightSprite';
import { FrogLine, loadFrogLines, tourStepsFor } from '../utils/frogLines';
import { ACCENT, CARD_BG, CARD_SHADOW_TALL, TEXT_PRIMARY, TEXT_MUTED, TRACK_WIDE, PAGE_BG } from '../utils/theme';

// First-run walkthrough. Three things changed from the original:
//
// 1. The steps come from the database (frog_lines, kind 'tour') instead of
//    three hardcoded arrays, so a lead can reword or add one without a
//    deploy — Багодельня → «Лягух».
// 2. It's the mascot talking. The frog stands next to a speech bubble and an
//    arrow runs from the bubble to whatever it's describing, rather than a
//    detached tooltip with a small frog icon in its corner.
// 3. The spotlight is a real spotlight now. There used to be a full-screen
//    dark div *and* a ring with a huge spread shadow; the div covered the
//    highlighted element too, so the one thing the step was about was dimmed
//    along with everything else. The overlay is transparent now and does
//    nothing but swallow clicks — all the dimming comes from the ring's
//    shadow, which by construction leaves its own interior unpainted.
//
// A step whose target isn't on the page for this role auto-skips. That
// mattered more when the overlay ate clicks during the gap; it still does,
// since a step pointing at nothing is worse than no step.

// The stored target is the element's data-tour value, so the selector is
// derivable and the two can't drift. The server keeps the allowlist of which
// values are offered in the editor (FROG_LINE_TARGETS in routes/frogLines.js).
const selectorFor = (target: string) => `[data-tour="${target}"]`;

// Being in the DOM is not the same as being on the screen. Navigation renders
// both the desktop link row and the burger menu's copy of it, so on a phone
// every nav target still matches querySelector while sitting behind
// display:none — and a hidden element measures 0x0 at (0, 0), which would put
// the spotlight in the top-left corner with the arrow pointing at nothing.
const onScreen = (target: string | null) => {
  if (!target) return false;
  const box = document.querySelector(selectorFor(target))?.getBoundingClientRect();
  return !!box && box.width > 0 && box.height > 0;
};

const PANEL_WIDTH = 348;
const FROG_SIZE = 60;
const GAP = 18; // between the highlight ring and the panel

interface Props {
  user: any;
}

export default function OnboardingTour({ user }: Props) {
  const storageKey = `onboarding_seen_${user.id}`;
  const [steps, setSteps] = useState<FrogLine[] | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [active, setActive] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [panelH, setPanelH] = useState(150);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (localStorage.getItem(storageKey)) return;
    let cancelled = false;
    // Steps have to be fetched before anything can be measured, and the
    // page needs a beat to mount either way — the original waited 500ms for
    // exactly that reason, so the fetch rides along inside the same wait
    // instead of adding to it.
    const t = setTimeout(() => {
      loadFrogLines().then(() => {
        if (cancelled) return;
        // Steps pointing at something this viewer can't see are dropped up
        // front, not skipped once the tour is running. Skipping mid-run left
        // the counter opening at "2/13" on a desktop, because the first step
        // (the phone-only burger menu) had already burned an index on its way
        // past — and the total counted steps that would never be shown.
        const mine = tourStepsFor(user.role).filter(step => onScreen(step.target));
        if (!mine.length) return; // a team that deleted every step gets no tour
        setSteps(mine);
        setActive(true);
      });
    }, 500);
    return () => { cancelled = true; clearTimeout(t); };
  }, [storageKey, user.role]);

  useEffect(() => {
    if (!active || !steps) return;
    const step = steps[stepIndex];
    if (!step?.target) return;
    const el = document.querySelector(selectorFor(step.target));
    // The list was filtered by onScreen() before the tour started, so this is
    // the narrower case of a target that disappeared afterwards — the window
    // crossing the burger-menu breakpoint mid-tour, a panel closing. Rare, and
    // it does renumber what's left, but a step pointing at nothing is worse.
    const box = el?.getBoundingClientRect();
    if (!el || !box || box.width === 0 || box.height === 0) {
      if (stepIndex < steps.length - 1) setStepIndex(i => i + 1);
      else finish();
      return;
    }
    const updateRect = () => setRect(el.getBoundingClientRect());
    updateRect();
    // Keep the highlight aligned with its target if the user resizes the
    // window or scrolls while this step is showing.
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);
    return () => {
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stepIndex, steps]);

  // Measured rather than assumed: the panel's height depends on how long the
  // step's text is, and both the above/below decision and the arrow's start
  // point need the real number. Guarded against re-setting the same value so
  // measuring can't feed itself.
  useLayoutEffect(() => {
    const h = panelRef.current?.offsetHeight;
    if (h && Math.abs(h - panelH) > 1) setPanelH(h);
  });

  const finish = () => {
    localStorage.setItem(storageKey, 'true');
    setActive(false);
  };

  const next = () => {
    if (steps && stepIndex < steps.length - 1) setStepIndex(i => i + 1);
    else finish();
  };

  if (!active || !steps || !rect) return null;

  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;

  // Below the target when there's room for the panel and its arrow, above
  // otherwise. Nav lives at the top of the page and the mascot at the bottom,
  // so both cases are real, not theoretical.
  const roomBelow = window.innerHeight - rect.bottom;
  const below = roomBelow > panelH + GAP + 24;
  const panelTop = below ? rect.bottom + GAP : Math.max(12, rect.top - GAP - panelH);
  const panelLeft = Math.max(12, Math.min(rect.left - 8, window.innerWidth - PANEL_WIDTH - 12));

  // The arrow runs from the panel's edge to the target's edge, curving so it
  // reads as a drawn pointer rather than a border. Both endpoints are in
  // viewport coordinates, which is what the fixed, full-screen SVG below uses.
  const targetCx = rect.left + rect.width / 2;
  const panelCx = panelLeft + PANEL_WIDTH / 2;
  const fromY = below ? panelTop - 2 : panelTop + panelH + 2;
  const toY = below ? rect.bottom + 6 : rect.top - 6;
  const ctrlX = panelCx + (targetCx - panelCx) * 0.15;
  const ctrlY = (fromY + toY) / 2;

  return (
    <>
      {/* Transparent: this exists only to swallow clicks aimed at the page
          underneath. Every pixel of dimming comes from the ring below. */}
      <div className="fixed inset-0" style={{ zIndex: 200 }} onClick={finish} />

      {/* The spotlight. A 4000px spread shadow paints everything outside this
          box and nothing inside it, so the target keeps its real brightness
          while the rest of the screen goes dark. */}
      <div
        className="fixed pointer-events-none"
        style={{
          top: rect.top - 5,
          left: rect.left - 5,
          width: rect.width + 10,
          height: rect.height + 10,
          border: `2px solid ${ACCENT}`,
          borderRadius: 10,
          boxShadow: `0 0 0 4000px rgba(0,0,0,0.72), 0 0 18px 0 ${ACCENT}90`,
          zIndex: 201,
          transition: 'top 0.25s ease-out, left 0.25s ease-out, width 0.25s ease-out, height 0.25s ease-out',
        }}
      />

      <svg
        className="fixed inset-0 pointer-events-none"
        width="100%"
        height="100%"
        style={{ zIndex: 202 }}
        aria-hidden="true"
      >
        <defs>
          {/* orient="auto" turns the head to follow the curve, so the same
              marker works whether the panel sits above or below. */}
          <marker id="tour-arrowhead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill={ACCENT} />
          </marker>
        </defs>
        <path
          d={`M ${panelCx} ${fromY} Q ${ctrlX} ${ctrlY} ${targetCx} ${toY}`}
          fill="none"
          stroke={ACCENT}
          strokeWidth={2}
          strokeLinecap="round"
          markerEnd="url(#tour-arrowhead)"
        />
      </svg>

      <div
        ref={panelRef}
        role="dialog"
        aria-label={step.title || 'Подсказка'}
        className="fixed flex items-end gap-2"
        style={{ top: panelTop, left: panelLeft, width: PANEL_WIDTH, zIndex: 203 }}
        onClick={e => e.stopPropagation()}
      >
        {/* The mascot itself delivers the line — same character as the one
            living in the corner, so the tour reads as him talking rather
            than as generic product chrome. */}
        <PixelFrogKnightSprite size={FROG_SIZE} className="shrink-0" />
        <div
          className="rounded-lg p-4 relative flex-1"
          style={{ background: CARD_BG, border: `1px solid ${ACCENT}`, boxShadow: CARD_SHADOW_TALL }}
        >
          {/* Speech tail pointing back at the frog. */}
          <div
            style={{
              position: 'absolute', left: -7, bottom: 16, width: 12, height: 12,
              background: CARD_BG, borderLeft: `1px solid ${ACCENT}`, borderBottom: `1px solid ${ACCENT}`,
              transform: 'rotate(45deg)',
            }}
          />
          <p
            className="font-montserrat font-semibold mb-1.5"
            style={{ fontSize: 16, lineHeight: '20px', letterSpacing: TRACK_WIDE, color: TEXT_PRIMARY }}
          >
            {step.title}
          </p>
          <p className="font-geist mb-4" style={{ fontSize: 14, lineHeight: 1.55, color: TEXT_MUTED }}>{step.text}</p>
          <div className="flex items-center justify-between gap-3">
            <button onClick={finish} className="font-geist cursor-pointer shrink-0" style={{ fontSize: 12, color: TEXT_MUTED }}>
              Пропустить
            </button>
            <div className="flex items-center gap-3">
              <span className="font-geist" style={{ fontSize: 12, color: TEXT_MUTED, letterSpacing: TRACK_WIDE }}>
                {stepIndex + 1}/{steps.length}
              </span>
              <button
                onClick={next}
                className="font-geist font-semibold px-3.5 py-1.5 rounded-lg cursor-pointer"
                style={{ fontSize: 13, background: ACCENT, color: PAGE_BG }}
              >
                {isLast ? 'Готово' : (
                  <span className="inline-flex items-center gap-1.5">Далее <Icon name="arrowRight" size={14} color="currentColor" /></span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
