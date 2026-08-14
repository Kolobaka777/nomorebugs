import FrogIcon from './FrogIcon';
import { ACCENT } from '../utils/theme';

// Replaces the old FrogLoader (crawling pixel-snail + "уже ползу..."
// jokes) now that the site's mascot is a frog, not a snail/bug — reuses
// the same real FrogIcon silhouette as FrogCompanion.tsx instead of a new
// pixel sprite, so every frog drawn in the app is the same shape.
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
      <div className="frog-loader-hop">
        <FrogIcon size={48} color={ACCENT} />
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