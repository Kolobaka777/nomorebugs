const SNAIL_PHRASES = [
  'уже ползу...',
  'улитка тоже не сразу доползла',
  'держи меня, я почти там',
  'скоро... наверное...',
  'шаг за шагом',
  'главное — не торопиться',
  'жизнь слишком коротка для быстрых улиток',
];

interface SnailLoaderProps {
  phrase?: string;
}

export default function SnailLoader({ phrase }: SnailLoaderProps) {
  const text = phrase ?? SNAIL_PHRASES[Math.floor(Math.random() * SNAIL_PHRASES.length)];

  return (
    <div className="flex flex-col items-center justify-center gap-5 py-16">
      {/* Snail body walk animation */}
      <div style={{ animation: 'snail-loader-walk 0.45s steps(2) infinite' }}>
        <svg
          width="64"
          height="44"
          viewBox="0 0 64 44"
          style={{ imageRendering: 'pixelated', display: 'block' }}
        >
          {/* Slime trail */}
          <rect x="0"  y="38" width="12" height="2" fill="rgba(29,158,117,0.3)" />
          <rect x="0"  y="40" width="7"  height="2" fill="rgba(29,158,117,0.15)" />
          {/* Foot */}
          <rect x="10" y="34" width="30" height="8"  fill="#0f7a5a" />
          {/* Body */}
          <rect x="10" y="22" width="30" height="14" fill="#1D9E75" />
          {/* Head */}
          <rect x="36" y="14" width="18" height="20" fill="#1D9E75" />
          {/* Smile */}
          <rect x="44" y="28" width="8"  height="2"  fill="#0f7a5a" />
          <rect x="42" y="30" width="2"  height="2"  fill="#0f7a5a" />
          <rect x="52" y="30" width="2"  height="2"  fill="#0f7a5a" />
          {/* Eye */}
          <rect x="46" y="18" width="6"  height="6"  fill="#0f0f1a" />
          <rect x="47" y="19" width="3"  height="3"  fill="#e8e8d0" />
          <rect x="49" y="19" width="1"  height="1"  fill="#0f0f1a" />
          {/* Left antenna */}
          <rect x="38" y="6"  width="4"  height="12" fill="#1D9E75" />
          <rect x="36" y="4"  width="8"  height="4"  fill="#e8e8d0" />
          {/* Right antenna */}
          <rect x="48" y="4"  width="4"  height="12" fill="#1D9E75" />
          <rect x="46" y="2"  width="8"  height="4"  fill="#e8e8d0" />
          {/* Shell */}
          <rect x="12" y="10" width="24" height="14" fill="#EF9F27" />
          <rect x="18" y="6"  width="14" height="4"  fill="#EF9F27" />
          <rect x="22" y="4"  width="6"  height="2"  fill="#EF9F27" />
          {/* Shell spiral */}
          <rect x="18" y="16" width="6"  height="4"  fill="#c47e15" />
          <rect x="14" y="18" width="2"  height="2"  fill="#c47e15" />
          <rect x="26" y="12" width="4"  height="2"  fill="#c47e15" />
          <rect x="30" y="16" width="2"  height="2"  fill="#c47e15" />
          {/* Shell highlight */}
          <rect x="22" y="10" width="4"  height="2"  fill="#f5c060" />
          <rect x="26" y="12" width="2"  height="2"  fill="#f5c060" />
        </svg>
      </div>

      {/* Pixel bounce dots */}
      <div className="flex gap-2">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            style={{
              width: '5px',
              height: '5px',
              background: '#1D9E75',
              imageRendering: 'pixelated',
              animation: `snail-dot-hop 0.6s steps(2) infinite ${i * 0.15}s`,
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

export { SNAIL_PHRASES };
