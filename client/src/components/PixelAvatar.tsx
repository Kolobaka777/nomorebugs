/**
 * Avatar registry — real cross-stitch frog images (client/src/assets/
 * images/frogN.png, supplied by the user for the profile redesign)
 * replace the old procedural bug-SVG set as of 2026-08-14. The original 8
 * bug sprites are kept below as LEGACY_BUG_AVATARS purely so any account
 * still holding an old avatar_id ('bug1'..'bug8') keeps rendering something
 * recognizable instead of a blank tile — they're no longer offered in any
 * picker UI.
 * Also exports the AvatarFrame wrapper and avatar/frame metadata.
 *
 * Shipped as .webp, not the original .png — these are photographic
 * cross-stitch photos (not flat pixel art), so lossless PNG was a poor fit:
 * re-encoding at quality 88 cut ~350KB combined down to ~60KB with no
 * visible difference at the 40-132px sizes they're actually rendered at
 * (see PixelAvatar's `size` prop usages). Perf-optimization pass, 2026-08-14.
 */
import frog1 from '../assets/images/frog1.webp';
import frog2 from '../assets/images/frog2.webp';
import frog3 from '../assets/images/frog3.webp';
import frog4 from '../assets/images/frog4.webp';
import frog5 from '../assets/images/frog5.webp';
import frog6 from '../assets/images/frog6.webp';
import frog7 from '../assets/images/frog7.webp';
import frog8 from '../assets/images/frog8.webp';
import frog9 from '../assets/images/frog9.webp';

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  blk: '#1F2833', dblk: '#0B0C10',
  red: '#cc3333', dred: '#881111',
  grn: '#66FCF1', dgrn: '#45A29E',
  amb: '#EF9F27', damb: '#c47e15',
  pur: '#7F77DD', dpur: '#4a44aa',
  cre: '#C5C6C7', dgry: '#3a3a5e',
  wht: '#ffffff', ylw: '#f5e060',
  brn: '#8b5e3c', dbrn: '#5c3a1e',
  sky: '#4cc9f0', ora: '#f06030',
  lim: '#86efac', pin: '#f472b6',
};

type R = [number, number, number, number, string]; // [x, y, w, h, color]

function Sprite({ rects }: { rects: R[] }) {
  return (
    <>
      {rects.map(([x, y, w, h, c], i) => (
        <rect key={i} x={x} y={y} width={w} height={h} fill={c} />
      ))}
    </>
  );
}

// ── Bug 1: Ladybug ────────────────────────────────────────────────────────────
const LADYBUG: R[] = [
  // Antennae
  [24,0,4,8,C.blk],[36,0,4,8,C.blk],[20,4,8,4,C.blk],[36,4,8,4,C.blk],
  // Head
  [20,8,24,20,C.blk],
  // Eyes
  [22,12,8,8,C.cre],[34,12,8,8,C.cre],
  [24,14,4,4,C.blk],[36,14,4,4,C.blk],
  // Body (red)
  [12,28,40,28,C.red],[8,32,48,20,C.red],
  // Body darkening on edges
  [8,32,4,20,C.dred],[52,32,4,20,C.dred],
  // Center divider
  [30,28,4,28,C.blk],
  // Spots (left wing)
  [14,32,8,8,C.dred],[14,44,8,8,C.dred],
  // Spots (right wing)
  [42,32,8,8,C.dred],[42,44,8,8,C.dred],
  // Legs
  [2,36,14,4,C.blk],[48,36,14,4,C.blk],
  [2,44,12,4,C.blk],[50,44,12,4,C.blk],
  [4,52,10,4,C.blk],[50,52,10,4,C.blk],
];

// ── Bug 2: Green Beetle ───────────────────────────────────────────────────────
const BEETLE: R[] = [
  // Shell (top dark layer)
  [16,0,32,8,C.dgrn],
  // Head
  [16,4,32,16,C.dgrn],
  // Eyes
  [18,8,8,8,C.amb],[38,8,8,8,C.amb],
  [20,10,4,4,C.blk],[40,10,4,4,C.blk],
  // Mandibles
  [12,12,8,4,C.dgrn],[44,12,8,4,C.dgrn],
  [8,14,8,4,C.dgrn],[48,14,8,4,C.dgrn],
  // Thorax
  [12,20,40,12,C.grn],
  // Wing case (elytra)
  [8,28,48,28,C.grn],
  [8,28,4,28,C.dgrn],[52,28,4,28,C.dgrn],
  // Wing divider line
  [30,28,4,28,C.dgrn],
  // Shine on wings
  [12,32,8,4,C.lim],[44,32,8,4,C.lim],
  // Legs
  [2,32,10,4,C.dgrn],[52,32,10,4,C.dgrn],
  [2,40,10,4,C.dgrn],[52,40,10,4,C.dgrn],
  [4,50,10,4,C.dgrn],[50,50,10,4,C.dgrn],
];

// ── Bug 3: Spider ─────────────────────────────────────────────────────────────
const SPIDER: R[] = [
  // Legs (spread out) - drawn first so body is on top
  [0,20,16,4,C.blk],[48,20,16,4,C.blk],
  [0,16,12,4,C.blk],[52,16,12,4,C.blk],
  [0,28,16,4,C.blk],[48,28,16,4,C.blk],
  [0,36,16,4,C.blk],[48,36,16,4,C.blk],
  [2,44,14,4,C.blk],[48,44,14,4,C.blk],
  [4,50,10,4,C.blk],[50,50,10,4,C.blk],
  [6,56,8,4,C.blk],[50,56,8,4,C.blk],
  [8,60,6,4,C.blk],[50,60,6,4,C.blk],
  // Abdomen (large dark oval)
  [12,32,40,24,C.dgry],
  [8,36,48,16,C.dgry],
  // Abdomen pattern
  [20,36,8,4,C.pur],[36,36,8,4,C.pur],
  [20,44,8,4,C.pur],[36,44,8,4,C.pur],
  // Cephalothorax (head+thorax)
  [16,12,32,24,C.blk],
  // Eyes (8 eyes!)
  [18,14,4,4,C.red],[24,14,4,4,C.red],[30,14,4,4,C.red],[36,14,4,4,C.red],
  [20,20,4,4,C.cre],[26,20,4,4,C.cre],[30,20,4,4,C.cre],[36,20,4,4,C.cre],
  // Fangs
  [20,32,4,4,C.cre],[40,32,4,4,C.cre],
];

// ── Bug 4: Ant ────────────────────────────────────────────────────────────────
const ANT: R[] = [
  // Antennae
  [26,0,4,16,C.dbrn],[34,0,4,16,C.dbrn],
  [16,4,14,4,C.dbrn],[34,4,14,4,C.dbrn],
  // Head
  [18,12,28,20,C.brn],
  // Eyes
  [20,16,8,8,C.blk],[36,16,8,8,C.blk],
  [22,18,4,4,C.ylw],[38,18,4,4,C.ylw],
  // Mandibles
  [14,24,8,4,C.dbrn],[42,24,8,4,C.dbrn],
  // Neck/waist (petiole) - thin
  [26,32,12,8,C.dbrn],
  // Thorax
  [16,36,32,16,C.brn],
  // Legs (3 pairs)
  [4,38,16,4,C.dbrn],[44,38,16,4,C.dbrn],
  [4,44,16,4,C.dbrn],[44,44,16,4,C.dbrn],
  [6,50,14,4,C.dbrn],[44,50,14,4,C.dbrn],
  // Abdomen (oval)
  [16,52,32,12,C.brn],[20,60,24,4,C.brn],
  // Abdomen shine
  [22,54,8,4,C.cre],
];

// ── Bug 5: Firefly ────────────────────────────────────────────────────────────
const FIREFLY: R[] = [
  // Wings (translucent look)
  [4,16,20,16,C.sky],[40,16,20,16,C.sky],
  [4,20,20,8,C.wht],[40,20,20,8,C.wht],
  // Head
  [22,4,20,16,C.dgrn],
  // Eyes
  [24,8,6,6,C.cre],[34,8,6,6,C.cre],
  [26,10,2,2,C.blk],[36,10,2,2,C.blk],
  // Antennae
  [26,0,4,8,C.dgrn],[34,0,4,8,C.dgrn],
  // Thorax
  [18,20,28,12,C.dgrn],
  // Abdomen (regular segments)
  [20,32,24,8,C.dgrn],
  // GLOWING ABDOMEN (amber/yellow)
  [18,40,28,16,C.ylw],
  [16,44,32,8,C.amb],
  // Glow core
  [22,44,20,8,C.wht],
  // Legs
  [4,28,18,4,C.dgrn],[42,28,18,4,C.dgrn],
  [6,36,14,4,C.dgrn],[44,36,14,4,C.dgrn],
  [8,48,12,4,C.dgrn],[44,48,12,4,C.dgrn],
];

// ── Bug 6: Caterpillar ────────────────────────────────────────────────────────
const CATERPILLAR: R[] = [
  // Head segment
  [4,24,20,20,C.lim],
  [6,24,16,20,C.grn],
  // Eyes
  [8,28,6,6,C.cre],[14,28,6,6,C.cre],
  [10,30,2,2,C.blk],[16,30,2,2,C.blk],
  // Smile
  [10,36,2,2,C.dgrn],[14,36,2,2,C.dgrn],[12,38,4,2,C.dgrn],
  // Antennae
  [8,12,4,16,C.grn],[14,8,4,16,C.grn],
  [6,10,6,4,C.grn],[14,4,6,4,C.grn],
  // Body segments (3)
  [20,28,16,16,C.grn],[22,28,12,16,C.lim],
  [32,26,16,18,C.grn],[34,26,12,18,C.lim],
  [44,28,16,16,C.grn],[46,28,12,16,C.lim],
  // Segment feet/bumps on top
  [22,24,8,4,C.lim],[34,22,8,4,C.lim],[46,24,8,4,C.lim],
  // Tiny legs
  [20,44,4,8,C.grn],[28,44,4,8,C.grn],
  [32,44,4,8,C.grn],[40,44,4,8,C.grn],
  [44,44,4,8,C.grn],[52,44,4,8,C.grn],
];

// ── Bug 7: Snail ──────────────────────────────────────────────────────────────
const SNAIL_AVA: R[] = [
  // Shell (amber spiral)
  [8,16,36,28,C.amb],
  [14,10,24,8,C.amb],[18,6,16,6,C.amb],
  // Shell spiral
  [18,22,12,12,C.damb],[12,26,6,6,C.damb],[30,18,10,8,C.damb],
  [10,20,4,4,C.damb],[36,28,6,6,C.damb],
  // Shell highlight
  [26,16,8,4,C.ylw],[34,20,4,4,C.ylw],
  // Body (teal)
  [4,36,56,16,C.grn],
  [4,44,56,8,C.grn],
  // Head
  [36,20,24,24,C.grn],
  // Eye
  [42,24,10,10,C.dblk],
  [44,26,6,6,C.cre],[46,27,2,2,C.dblk],
  // Smile
  [44,34,6,2,C.dgrn],[42,36,2,2,C.dgrn],[50,36,2,2,C.dgrn],
  // Left antenna
  [40,10,4,14,C.grn],[38,8,8,4,C.cre],
  // Right antenna
  [50,6,4,16,C.grn],[48,4,8,4,C.cre],
  // Foot underside
  [4,52,56,8,C.dgrn],
  // Slime trail
  [0,56,8,4,'rgba(102, 252, 241,0.4)'],[0,60,4,4,'rgba(102, 252, 241,0.2)'],
];

// ── Bug 8: Mystery Hood ───────────────────────────────────────────────────────
const MYSTERY: R[] = [
  // Hood (dark flowing shape)
  [16,0,32,8,C.dpur],
  [12,4,40,8,C.dpur],
  [8,8,48,12,C.dpur],
  [8,16,48,36,C.dblk],
  [4,20,56,32,C.dblk],
  // Robe body
  [4,48,56,16,C.dblk],[8,60,48,4,C.dblk],
  // Shadow of face
  [12,18,40,20,C.blk],
  // Glowing red eyes (two)
  [18,24,10,8,C.red],[36,24,10,8,C.red],
  [20,26,6,4,C.ora],[38,26,6,4,C.ora],
  [22,27,2,2,C.wht],[40,27,2,2,C.wht],
  // Question mark
  [28,36,8,4,C.pur],[36,36,4,4,C.pur],
  [36,40,4,4,C.pur],[32,44,4,4,C.pur],
  [32,52,4,4,C.pur],
  // Hood shadow
  [8,8,4,40,C.dblk],[52,8,4,40,C.dblk],
];

// ── Avatar registry — frog set (real images) ───────────────────────────────────
export const AVATAR_LIST = [
  { id: 'frog1', name: 'Кваки',        img: frog1 },
  { id: 'frog2', name: 'Синька',       img: frog2 },
  { id: 'frog3', name: 'Апельсинка',   img: frog3 },
  { id: 'frog4', name: 'Уголёк',       img: frog4 },
  { id: 'frog5', name: 'Бублик',       img: frog5 },
  { id: 'frog6', name: 'Валентинка',   img: frog6 },
  { id: 'frog7', name: 'Красноглазка', img: frog7 },
  { id: 'frog8', name: 'Пушок',        img: frog8 },
  { id: 'frog9', name: 'Детектив',     img: frog9 },
] as const;

// Old procedural bug sprites — no longer selectable, kept only so an
// existing avatar_id from before the frog reskin still renders (see file
// header comment). Not exported from AVATAR_LIST on purpose.
const LEGACY_BUG_AVATARS = [
  { id: 'bug1', name: 'Божья коровка', rects: LADYBUG },
  { id: 'bug2', name: 'Зелёный жук',   rects: BEETLE },
  { id: 'bug3', name: 'Паук',          rects: SPIDER },
  { id: 'bug4', name: 'Муравей',       rects: ANT },
  { id: 'bug5', name: 'Светлячок',     rects: FIREFLY },
  { id: 'bug6', name: 'Гусеница',      rects: CATERPILLAR },
  { id: 'bug7', name: 'Улитка 🐌',     rects: SNAIL_AVA },
  { id: 'bug8', name: '???',           rects: MYSTERY },
] as const;

export type AvatarId = (typeof AVATAR_LIST)[number]['id'] | (typeof LEGACY_BUG_AVATARS)[number]['id'] | 'custom';

// ── Frame registry ────────────────────────────────────────────────────────────
export type FrameId = 'default' | 'gold' | 'rainbow' | 'glitch' | 'crown' | 'code' | 'crimescene';

export const FRAME_LIST: { id: FrameId; name: string; unlock: string }[] = [
  { id: 'default',    name: 'Базовая',     unlock: 'Доступна всегда' },
  { id: 'gold',       name: 'Золотая',     unlock: 'Скрафти любой значок' },
  { id: 'rainbow',    name: 'Радуга',      unlock: 'Значок CSS' },
  { id: 'glitch',     name: 'Глитч',       unlock: 'Значок DevTools' },
  { id: 'code',       name: 'Код',         unlock: 'Значок HTML' },
  { id: 'crimescene', name: 'Место преступления', unlock: 'Значок Bug Reports' },
  { id: 'crown',      name: 'Корона',      unlock: 'Скрафти все значки' },
];

// ── Background registry ───────────────────────────────────────────────────────
export type BgId = 'default' | 'forest' | 'console' | 'hive' | 'amber';

export const BG_LIST: { id: BgId; name: string; unlock: string; style: React.CSSProperties }[] = [
  {
    id: 'default', name: 'Подземелье', unlock: 'Базовый',
    style: { background: '#1F2833' },
  },
  {
    id: 'forest', name: 'Тёмный лес', unlock: 'Базовый',
    style: {
      background: 'linear-gradient(160deg, #0d1a0d 0%, #1a2e1a 40%, #0f1a2e 100%)',
    },
  },
  {
    id: 'console', name: 'Консоль', unlock: 'Базовый',
    style: {
      background: '#0d0d14',
      backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 23px, rgba(102, 252, 241,0.04) 23px, rgba(102, 252, 241,0.04) 24px)',
    },
  },
  {
    id: 'hive', name: 'Пчелиный улей', unlock: 'Скрафти любой значок',
    style: {
      background: 'radial-gradient(ellipse at center, #1a180a 0%, #0B0C10 70%)',
    },
  },
  {
    id: 'amber', name: 'Янтарь', unlock: 'Скрафти все значки',
    style: {
      background: 'radial-gradient(ellipse at 40% 30%, rgba(239,159,39,0.15) 0%, #0B0C10 60%)',
    },
  },
];

// ── PixelAvatar Component ─────────────────────────────────────────────────────
interface PixelAvatarProps {
  id: AvatarId;
  frame?: FrameId;
  size?: number;
  customSrc?: string | null; // base64 or URL for custom upload
  animate?: boolean;
  // Renders just the frame on a plain empty square, no avatar image at all —
  // used by the shop/editor's frame gallery, which (per the reference
  // design) previews the border style on its own rather than wrapped around
  // a specific avatar.
  empty?: boolean;
}

export default function PixelAvatar({
  id,
  frame = 'default',
  size = 64,
  customSrc,
  animate = false,
  empty = false,
}: PixelAvatarProps) {
  const avatar = !empty ? AVATAR_LIST.find(a => a.id === id) : undefined;
  const legacyBug = !empty && !avatar ? LEGACY_BUG_AVATARS.find(a => a.id === id) : undefined;

  return (
    <div className="relative inline-block" style={{ width: size, height: size, flexShrink: 0 }}>
      {/* Frame wrapper */}
      <div
        className={`
          absolute inset-0 z-10 pointer-events-none
          ${frame === 'gold'        ? 'frame-gold'        : ''}
          ${frame === 'rainbow'     ? 'frame-rainbow'     : ''}
          ${frame === 'glitch'      ? 'frame-glitch'      : ''}
          ${frame === 'code'        ? 'frame-code'        : ''}
          ${frame === 'crimescene'  ? 'frame-crimescene'  : ''}
          ${frame === 'default'     ? 'frame-default'     : ''}
        `}
        style={frame === 'crown' ? {
          outline: '3px solid #EF9F27',
          outlineOffset: '2px',
          animation: 'epic-badge-pulse 2s ease-in-out infinite',
        } : undefined}
      />

      {/* Crown overlay */}
      {frame === 'crown' && (
        <svg
          className="absolute pointer-events-none z-20"
          style={{ top: -size * 0.2, left: size * 0.2, width: size * 0.6, animation: 'snail-bob 1s ease-in-out infinite' }}
          viewBox="0 0 24 16"
        >
          <rect x="0"  y="12" width="24" height="4" fill="#EF9F27" />
          <rect x="2"  y="8"  width="4"  height="8" fill="#EF9F27" />
          <rect x="10" y="4"  width="4"  height="12" fill="#EF9F27" />
          <rect x="18" y="8"  width="4"  height="8"  fill="#EF9F27" />
          <rect x="4"  y="6"  width="4"  height="4"  fill="#f5c060" />
          <rect x="12" y="2"  width="4"  height="4"  fill="#f5c060" />
          <rect x="20" y="6"  width="4"  height="4"  fill="#f5c060" />
        </svg>
      )}

      {/* Avatar content */}
      {empty ? (
        <div style={{ width: size, height: size, background: 'rgba(197, 198, 199,0.04)' }} />
      ) : customSrc ? (
        <img
          src={customSrc}
          alt="avatar"
          style={{ width: size, height: size, objectFit: 'cover', imageRendering: 'pixelated' }}
        />
      ) : avatar ? (
        <img
          src={avatar.img}
          alt={avatar.name}
          style={{ width: size, height: size, objectFit: 'cover', imageRendering: 'pixelated', display: 'block' }}
        />
      ) : (
        <svg
          width={size}
          height={size}
          viewBox="0 0 64 64"
          style={{ imageRendering: 'pixelated', display: 'block' }}
        >
          {/* Dark bg */}
          <rect x="0" y="0" width="64" height="64" fill="#0B0C10" />
          {legacyBug && <Sprite rects={legacyBug.rects} />}
          {/* Firefly glow overlay */}
          {id === 'bug5' && animate && (
            <rect x="16" y="40" width="32" height="16" fill="rgba(245,224,96,0.3)"
              style={{ animation: 'pixel-pulse 1.2s ease-in-out infinite' }} />
          )}
        </svg>
      )}
    </div>
  );
}
