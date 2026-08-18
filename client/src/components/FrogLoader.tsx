import PixelFrogSprite from './PixelFrogSprite';
import { randomFrogLine } from '../utils/frogLines';
import { ACCENT } from '../utils/theme';

// Replaced the old FrogLoader (crawling pixel-snail + "уже ползу..."
// jokes, then a later pass using FrogIcon's smooth vector silhouette) with
// PixelFrogSprite — an actual chunky pixel-art frog in the site's own
// palette, matching the "cute and a little unhinged" reference mood the
// owner asked for. Blinks on its own timer (PixelFrogSprite's default
// auto-blink), hops via the existing frog-loader-hop keyframe, and puffs
// its throat like it's mid-croak via a small pulsing circle behind it.
//
// The phrases used to be a FROG_PHRASES array right here. They're lead-
// editable rows now (Багодельня → «Лягух»); utils/frogLines.ts keeps the
// synchronous read this component needs, since a loader can't wait on a
// fetch before it has something to show.

interface FrogLoaderProps {
  phrase?: string;
}

export default function FrogLoader({ phrase }: FrogLoaderProps) {
  const text = phrase ?? randomFrogLine('loader');

  return (
    <div className="flex flex-col items-center justify-center gap-5 py-16">
      <div className="frog-loader-hop" style={{ position: 'relative' }}>
        {/* Throat puff — a soft glow behind the sprite that pulses like a
            croak mid-inflate, purely decorative, sits behind the sprite. */}
        <div
          className="frog-loader-croak"
          style={{
            position: 'absolute', left: '50%', top: '58%',
            width: 22, height: 22, borderRadius: '9999px',
            background: ACCENT, opacity: 0.25, filter: 'blur(1px)',
            transform: 'translate(-50%, -50%)', zIndex: 0,
          }}
        />
        <PixelFrogSprite size={56} className="relative" />
      </div>

      {/* Pixel bounce dots */}
      <div className="flex gap-2">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            style={{
              width: '5px',
              height: '5px',
              background: ACCENT,
              imageRendering: 'pixelated',
              animation: `loader-dot-hop 0.6s steps(2) infinite ${i * 0.15}s`,
              opacity: 0.7,
            }}
          />
        ))}
      </div>

      <p className="font-pixel text-primary text-xs" style={{ lineHeight: 1.8 }}>
        {text}
      </p>
    </div>
  );
}
