import PixelFrogSprite from './PixelFrogSprite';
import { ACCENT } from '../utils/theme';

// Replaced the old FrogLoader (crawling pixel-snail + "уже ползу..."
// jokes, then a later pass using FrogIcon's smooth vector silhouette) with
// PixelFrogSprite — an actual chunky pixel-art frog in the site's own
// palette, matching the "cute and a little unhinged" reference mood the
// owner asked for. Blinks on its own timer (PixelFrogSprite's default
// auto-blink), hops via the existing frog-loader-hop keyframe, and puffs
// its throat like it's mid-croak via a small pulsing circle behind it.
const FROG_PHRASES = [
  'квак-квак, гружусь...',
  'разгоняюсь для прыжка...',
  'лягушка тоже не сразу допрыгала',
  'скоро... наверное...',
  'прыжок за прыжком',
  'главное — мягко приземлиться',
  'жизнь слишком коротка, чтобы не квакать',
  'ловлю последний баг языком...',
  'сижу на кувшинке, жду ответ сервера...',
  'надуваю щёки перед прыжком',
  'какой же я прыгучий...',
  'ща ща ща...',
  'быстреееееее',
  'не хочу чета прыгать',
];

interface FrogLoaderProps {
  phrase?: string;
}

export default function FrogLoader({ phrase }: FrogLoaderProps) {
  const text = phrase ?? FROG_PHRASES[Math.floor(Math.random() * FROG_PHRASES.length)];

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

export { FROG_PHRASES };