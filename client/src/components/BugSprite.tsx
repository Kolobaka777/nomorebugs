// Pixel art bug sprite (16x16 beetle) with optional walking animation
interface BugSpriteProps {
  size?: number;
  color?: 'teal' | 'amber' | 'red' | 'cyan';
  walking?: boolean;
  direction?: 'right' | 'left';
}

export default function BugSprite({
  size = 32,
  color = 'teal',
  walking = false,
  direction = 'right',
}: BugSpriteProps) {
  const mainColor = color === 'teal' ? '#66FCF1' : color === 'amber' ? '#EF9F27' : color === 'cyan' ? '#66FCF1' : '#e05252';
  const darkColor = color === 'teal' ? '#45A29E' : color === 'amber' ? '#c47e15' : color === 'cyan' ? '#2a9e96' : '#a83232';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      className={walking ? 'bug-running' : ''}
      style={{
        imageRendering: 'pixelated',
        transform: direction === 'left' ? 'scaleX(-1)' : undefined,
      }}
    >
      {/* Body */}
      <rect x="4" y="4" width="8" height="10" fill={mainColor} />
      {/* Head */}
      <rect x="5" y="2" width="6" height="4" fill={darkColor} />
      {/* Eyes */}
      <rect x="5" y="2" width="2" height="2" fill="#C5C6C7" />
      <rect x="9" y="2" width="2" height="2" fill="#C5C6C7" />
      <rect x="6" y="2" width="1" height="1" fill="#0B0C10" />
      <rect x="10" y="2" width="1" height="1" fill="#0B0C10" />
      {/* Spots */}
      <rect x="5" y="6" width="2" height="2" fill={darkColor} />
      <rect x="9" y="6" width="2" height="2" fill={darkColor} />
      <rect x="5" y="10" width="2" height="2" fill={darkColor} />
      <rect x="9" y="10" width="2" height="2" fill={darkColor} />
      {/* Center line */}
      <rect x="7" y="4" width="2" height="10" fill={darkColor} />
      {/* Antennae */}
      <rect x="4" y="1" width="1" height="3" fill={darkColor} />
      <rect x="11" y="1" width="1" height="3" fill={darkColor} />
      {/* Left legs — alternate A/B phases */}
      <rect className={walking ? 'bug-leg-a' : ''} x="2"  y="6"  width="2" height="1" fill={darkColor} />
      <rect className={walking ? 'bug-leg-b' : ''} x="2"  y="9"  width="2" height="1" fill={darkColor} />
      <rect className={walking ? 'bug-leg-a' : ''} x="2"  y="12" width="2" height="1" fill={darkColor} />
      {/* Right legs — opposite phase */}
      <rect className={walking ? 'bug-leg-b' : ''} x="12" y="6"  width="2" height="1" fill={darkColor} />
      <rect className={walking ? 'bug-leg-a' : ''} x="12" y="9"  width="2" height="1" fill={darkColor} />
      <rect className={walking ? 'bug-leg-b' : ''} x="12" y="12" width="2" height="1" fill={darkColor} />
    </svg>
  );
}
