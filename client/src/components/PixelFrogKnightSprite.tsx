import { useEffect, useRef, useState } from 'react';
import { PAGE_BG, ACCENT, SECONDARY, TEXT_PRIMARY, TEXT_MUTED, BADGE_NOTIFY } from '../utils/theme';

// The helper mascot: the site's pixel frog, sword up, riding a crocodile —
// the owner's reference doodle redrawn in our own chunky-pixel/accent-teal
// language rather than its original ink-line style.
//
// Kept separate from PixelFrogSprite.tsx (the plain frog) on purpose: that
// one is still the right character for loading screens and the onboarding
// tour, where a mounted knight would be noise. Only FrogCompanion — the
// thing you actually click — gets the full scene.
//
// Authored as ASCII grids instead of PixelAvatar/PixelFrogSprite's raw
// [x,y,w,h,color] arrays: at three overlapping figures the coordinate form
// stops being editable by hand, while a grid you can literally see the frog
// in stays that way. gridToRects run-length-encodes each row into the same
// rects those components hand-write, once at module load.
//
// The three parts are separate <g> layers because each animates on its own
// axis — see index.css: the mount rocks, the rider bounces out of phase with
// it (that counter-phase is what reads as "riding"), and the sword swings
// about its own hilt. Draw order is croc → frog → sword, so the blade passes
// in front of the frog the way it does in the reference.

type Grid = { x: number; y: number; rows: string[] };

const CELL = 4;

const PALETTE: Record<string, string> = {
  K: PAGE_BG,          // outline / inner separation — reads as "no pixel" on the app's own background
  T: ACCENT,           // frog body
  D: SECONDARY,        // frog shade
  L: '#86EFAC',        // frog belly (PixelAvatar.tsx's "lim")
  W: '#DCFAF8',        // eye white, cool-toned to match the palette
  P: PAGE_BG,          // pupil
  C: '#3D8B87',        // crocodile body — same teal family, dark enough that the frog reads on top of it
  c: '#26605D',        // crocodile underside/limbs
  E: '#DCFAF8',        // crocodile teeth
  S: TEXT_PRIMARY,     // blade
  H: TEXT_MUTED,       // blade shade
  G: BADGE_NOTIFY,     // hilt
  g: '#B8741A',        // hilt shade / grip
  f: TEXT_MUTED,       // live fly body
  w: 'rgba(220, 250, 248, 0.5)', // fly wings — translucent so they read as wings, not blocks
  z: '#5C5D60',        // dead fly body, drained of the live one's contrast
  j: TEXT_MUTED,       // dead fly legs
};

function gridToRects({ x: ox, y: oy, rows }: Grid): [number, number, number, number, string][] {
  const out: [number, number, number, number, string][] = [];
  rows.forEach((row, ry) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch === '.') { x++; continue; }
      let n = 1;
      while (row[x + n] === ch) n++;
      out.push([(ox + x) * CELL, (oy + ry) * CELL, n * CELL, CELL, ch]);
      x += n;
    }
  });
  return out;
}

const CROC: Grid = {
  x: 0, y: 19, rows: [
    '....C.C............C....',
    '...CPCPCCCCCCCCCCCCCC...',
    '..CCCCCCCCCCCCCCCCCCCC..',
    'CCCCCCCCCCCCCCCCCCCCCC..',
    'KEKEKEKEKCCCCCCCCCCCCCC.',
    '.ccccccccccccccccccccc..',
    '....cc.......ccc...ccc..',
    '...ccc.......ccc........',
  ],
};

// Only the two eye rows differ between frames — same trick PixelFrogSprite
// uses, so a blink costs one array swap rather than a second full drawing.
const FROG_EYES_OPEN = ['KTWWTTWWTK', 'KTWPTTPWTK'];
const FROG_EYES_SHUT = ['KTTTTTTTTK', 'KTKKTTKKTK'];

const frogGrid = (shut: boolean): Grid => ({
  x: 9, y: 8, rows: [
    '..KK..KK..',
    '.KTTKKTTK.',
    ...(shut ? FROG_EYES_SHUT : FROG_EYES_OPEN),
    'KTTTTTTTTK',
    'TTTKKKKTT.',
    'TTTTTTTTTT',
    'TTTTLLTTTT',
    'TTTLLLLTTT',
    '.TTLLLLTT.',
    '.TDDDDDDT.',
    '.DDDDDDDD.',
    '.TT....TT.', // feet, straddling the croc's back
  ],
});

// The two T cells flanking the grip are the frog's fists. They live in the
// sword grid rather than the frog's so they travel with the blade when it
// swings — an arm drawn on the frog would visibly let go of the hilt.
const SWORD: Grid = {
  x: 9, y: 3, rows: [
    '.S..',
    '.SH.',
    '.SH.',
    '.SH.',
    '.SH.',
    '.SH.',
    '.SH.',
    '.SH.',
    '.SH.',
    'GGGG',
    'TggT',
    'TggT',
    '.GG.',
  ],
};

// The flies the knight is actually fighting. Both grids sit at the same
// cell origin so the pair shares one bounding box, which is what lets the
// slot rotate about the fly's own centre (transform-origin: 50% 50%) — and
// that centre, (36, 22) in viewBox units, is a point the blade sweeps
// through on its way forward, so the hit lands on the fly rather than near
// it. Move one and the CSS timing in index.css stops meaning anything.
const FLY_ALIVE: Grid = { x: 7, y: 4, rows: ['.ff.', 'wffw', '.ff.'] };
// Drawn the right way up on purpose: the slot tumbles to 180° as it falls,
// so these legs end up in the air, which is the only pose that reads as
// "dead bug" without a single extra pixel of explanation.
const FLY_DEAD: Grid = { x: 7, y: 4, rows: ['.zz.', '.zz.', 'j..j'] };

// Three is what the swing period allows: each fly's loop is three swings
// long (fly in, get hit, fall and lie there), so three staggered slots put
// exactly one fly in the blade's path per swing, with no gaps and no swarm.
// The stagger itself is pure CSS (animation-delay per slot, in index.css) —
// a JS interval would drift out of phase with the sword within seconds.
// Each slot is nudged off the shared path so the three don't retrace one
// identical line. The nudges are mostly vertical for a geometric reason: the
// fly parks at about −11° on the sword's arc, and from the hilt that
// direction is nearly straight up, so moving a fly up or down slides it
// along the blade and it still gets hit at the same instant. Moving one
// sideways swings its angle instead — a few units left or right is worth
// several degrees, which is enough to put it outside the swing's forward
// limit and have the blade miss it entirely. Hence ±4 vertical, ±3
// horizontal, and no more.
const FLY_SLOTS = [{ dx: 0, dy: 0 }, { dx: -3, dy: 4 }, { dx: 3, dy: -4 }];

const CROC_RECTS = gridToRects(CROC);
const FLY_ALIVE_RECTS = gridToRects(FLY_ALIVE);
const FLY_DEAD_RECTS = gridToRects(FLY_DEAD);
const SWORD_RECTS = gridToRects(SWORD);
const FROG_RECTS = { open: gridToRects(frogGrid(false)), shut: gridToRects(frogGrid(true)) };

const VIEW_W = 24 * CELL;
const VIEW_H = 27 * CELL;

const draw = (rects: [number, number, number, number, string][]) =>
  rects.map(([x, y, w, h, c], i) => <rect key={i} x={x} y={y} width={w} height={h} fill={PALETTE[c]} />);

interface Props {
  size?: number;
  className?: string;
  /** Sword swing + gallop — driven by hover on the companion, not by the sprite itself. */
  charging?: boolean;
  /** Controlled blink state — omit to let the sprite blink on its own timer. */
  blinking?: boolean;
}

export default function PixelFrogKnightSprite({ size = 72, className, charging, blinking }: Props) {
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

  const shut = blinking !== undefined ? blinking : autoBlink;

  return (
    <svg
      width={size}
      height={(size * VIEW_H) / VIEW_W}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      shapeRendering="crispEdges"
      className={`frog-knight${charging ? ' frog-knight-charging' : ''}${className ? ` ${className}` : ''}`}
      aria-hidden="true"
    >
      <g className="frog-knight-mount">{draw(CROC_RECTS)}</g>
      <g className="frog-knight-rider">
        {draw(shut ? FROG_RECTS.shut : FROG_RECTS.open)}
        <g className="frog-knight-sword">{draw(SWORD_RECTS)}</g>
      </g>
      {/* Flies exist only while the knight is swinging — they're the reason
          he's swinging. Outside the rider group so they keep their own path
          instead of inheriting his bounce, and last in draw order so a
          corpse lands in front of the mount rather than inside it. Mounting
          and unmounting them with `charging` also restarts every slot from
          the same instant the sword animation restarts, which is what keeps
          the two in phase. */}
      {charging && !reducedMotion.current && (
        <g className="frog-knight-flies">
          {FLY_SLOTS.map((slot, i) => (
            <g key={i} transform={`translate(${slot.dx} ${slot.dy})`}>
              <g className="frog-knight-fly">
                <g className="frog-knight-fly-alive">{draw(FLY_ALIVE_RECTS)}</g>
                <g className="frog-knight-fly-dead">{draw(FLY_DEAD_RECTS)}</g>
              </g>
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}
