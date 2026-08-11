import { HOVER } from '../utils/theme';

// Decorative background wordmark from the mockup — a giant "BAGANET"
// spelled one letter per line, pinned to the right edge, sitting *behind*
// every page's own PAGE_GRADIENT background (see App.tsx: this renders
// first, the routed page content wraps in a z-index:1 layer above it) so
// it's almost fully concealed and only shows as a faint texture where a
// page's own background is more transparent (the gradient's bottom, per
// theme.ts's PAGE_GRADIENT going from opaque #0B0C10 to 90%-opaque
// #1F2833). Fixed positioning + pointer-events:none — it never scrolls,
// never intercepts clicks, and never affects layout/scroll width.
//
// Letters run edge-to-edge (top:0/bottom:0 + justify-content:space-between)
// rather than being centered as a block — a centered block left visible
// gaps above the first and below the last letter, which read as unwanted
// padding; spanning the full viewport height is what the mockup shows.
const LETTERS = 'BAGANET'.split('');

export default function BgWatermark() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        userSelect: 'none',
        zIndex: 0,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          right: '-0.35em',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {LETTERS.map((ch, i) => (
          <span
            key={i}
            style={{
              fontFamily: 'Montserrat, sans-serif',
              fontWeight: 800,
              fontSize: 'clamp(40px, 8vw, 110px)',
              lineHeight: 0.86,
              color: `${HOVER}4D`, // HOVER (#8AFFF5) at 30% opacity
            }}
          >
            {ch}
          </span>
        ))}
      </div>
    </div>
  );
}
