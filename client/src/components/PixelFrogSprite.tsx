import { useEffect, useRef, useState } from 'react';
import { ACCENT, PAGE_BG } from '../utils/theme';

// The site's actual chunky-pixel mascot — hand-authored as a rect grid
// (same [x,y,w,h,color] technique PixelAvatar.tsx already uses for its
// legacy bug sprites), not a smooth vector silhouette like FrogIcon.tsx.
// Designed at a 19x18-unit grid (viewBox 76x72, 4 units/cell) and
// prototyped as an actual rendered PNG before being turned into rects, so
// the proportions are deliberate, not eyeballed from raw coordinates.
//
// Two frame states (open/closed eyes) swapped on a timer below give a
// believable blink without needing real per-frame art — the closed frame
// is the same silhouette with the eye cells flattened to a lash line.
type R = [number, number, number, number, string];

// Local palette, deliberately in the site's own accent family (ACCENT
// teal) rather than a naturalistic green — this frog is cyan, same as
// every other frog glyph in the app (FrogIcon, GreetingFrogIcon).
const P: Record<string, string> = {
  K: PAGE_BG,        // outline
  T: ACCENT,         // body main
  D: '#45A29E',      // body shade (same tone PixelAvatar.tsx calls "dgrn")
  W: '#DCFAF8',      // eye white, cool-toned to match the palette
  P: PAGE_BG,         // pupil
  L: '#86EFAC',       // belly highlight (PixelAvatar's "lim")
};

const EYES_OPEN: R[] = [
  [24, 8, 12, 4, 'K'], [40, 8, 12, 4, 'K'], [16, 12, 8, 4, 'K'], [24, 12, 12, 4, 'T'], [36, 12, 4, 4, 'K'],
  [40, 12, 12, 4, 'T'], [52, 12, 8, 4, 'K'], [12, 16, 4, 4, 'K'], [16, 16, 4, 4, 'T'], [20, 16, 4, 4, 'W'],
  [24, 16, 28, 4, 'T'], [52, 16, 4, 4, 'W'], [56, 16, 4, 4, 'T'], [60, 16, 4, 4, 'K'], [8, 20, 4, 4, 'K'],
  [12, 20, 4, 4, 'T'], [16, 20, 4, 4, 'W'], [20, 20, 4, 4, 'P'], [24, 20, 4, 4, 'W'], [28, 20, 20, 4, 'T'],
  [48, 20, 4, 4, 'W'], [52, 20, 4, 4, 'P'], [56, 20, 4, 4, 'W'], [60, 20, 4, 4, 'T'], [64, 20, 4, 4, 'K'],
  [8, 24, 4, 4, 'K'], [12, 24, 8, 4, 'T'], [20, 24, 4, 4, 'W'], [24, 24, 28, 4, 'T'], [52, 24, 4, 4, 'W'],
  [56, 24, 8, 4, 'T'], [64, 24, 4, 4, 'K'],
];

const EYES_CLOSED: R[] = [
  [24, 8, 12, 4, 'K'], [40, 8, 12, 4, 'K'], [16, 12, 8, 4, 'K'], [24, 12, 12, 4, 'T'], [36, 12, 4, 4, 'K'],
  [40, 12, 12, 4, 'T'], [52, 12, 8, 4, 'K'], [12, 16, 4, 4, 'K'], [16, 16, 44, 4, 'T'], [60, 16, 4, 4, 'K'],
  [8, 20, 4, 4, 'K'], [12, 20, 4, 4, 'T'], [16, 20, 12, 4, 'K'], [28, 20, 20, 4, 'T'], [48, 20, 12, 4, 'K'],
  [60, 20, 4, 4, 'T'], [64, 20, 4, 4, 'K'], [8, 24, 4, 4, 'K'], [12, 24, 52, 4, 'T'], [64, 24, 4, 4, 'K'],
];

// Shared lower body — identical in both frames (only the eye rows above differ).
const BODY_BASE: R[] = [
  [4, 28, 4, 4, 'K'], [8, 28, 60, 4, 'T'], [68, 28, 4, 4, 'K'],
  [4, 32, 4, 4, 'K'], [8, 32, 60, 4, 'T'], [68, 32, 4, 4, 'K'],
  [4, 36, 4, 4, 'K'], [8, 36, 24, 4, 'T'], [32, 36, 12, 4, 'K'], [44, 36, 24, 4, 'T'], [68, 36, 4, 4, 'K'],
  [4, 40, 4, 4, 'K'], [8, 40, 20, 4, 'T'], [28, 40, 20, 4, 'L'], [48, 40, 20, 4, 'T'], [68, 40, 4, 4, 'K'],
  [4, 44, 4, 4, 'K'], [8, 44, 20, 4, 'T'], [28, 44, 20, 4, 'L'], [48, 44, 20, 4, 'T'], [68, 44, 4, 4, 'K'],
  [4, 48, 4, 4, 'K'], [8, 48, 60, 4, 'D'], [68, 48, 4, 4, 'K'],
  [8, 52, 4, 4, 'K'], [12, 52, 52, 4, 'D'], [64, 52, 4, 4, 'K'],
  [12, 56, 52, 4, 'K'],
  [12, 60, 4, 4, 'K'], [16, 60, 4, 4, 'T'], [20, 60, 4, 4, 'K'], [52, 60, 4, 4, 'K'], [56, 60, 4, 4, 'T'], [60, 60, 4, 4, 'K'],
  [8, 64, 4, 4, 'K'], [12, 64, 12, 4, 'T'], [24, 64, 4, 4, 'K'], [48, 64, 4, 4, 'K'], [52, 64, 12, 4, 'T'], [64, 64, 4, 4, 'K'],
];

const VIEW_W = 76;
const VIEW_H = 72;

interface Props {
  size?: number;
  className?: string;
  /** Controlled blink state — omit to let the sprite blink on its own timer. */
  blinking?: boolean;
}

export default function PixelFrogSprite({ size = 64, className, blinking }: Props) {
  const [autoBlink, setAutoBlink] = useState(false);
  const reducedMotion = useRef(
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  useEffect(() => {
    if (blinking !== undefined || reducedMotion.current) return;
    let timer: ReturnType<typeof setTimeout>;
    let closeTimer: ReturnType<typeof setTimeout>;
    function scheduleBlink() {
      timer = setTimeout(() => {
        setAutoBlink(true);
        closeTimer = setTimeout(() => setAutoBlink(false), 140);
        scheduleBlink();
      }, 2200 + Math.random() * 2600);
    }
    scheduleBlink();
    return () => { clearTimeout(timer); clearTimeout(closeTimer); };
  }, [blinking]);

  const closed = blinking !== undefined ? blinking : autoBlink;
  const rects = [...(closed ? EYES_CLOSED : EYES_OPEN), ...BODY_BASE];

  return (
    <svg
      width={size}
      height={(size * VIEW_H) / VIEW_W}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      shapeRendering="crispEdges"
      className={className}
      aria-hidden="true"
    >
      {rects.map(([x, y, w, h, c], i) => (
        <rect key={i} x={x} y={y} width={w} height={h} fill={P[c]} />
      ))}
    </svg>
  );
}