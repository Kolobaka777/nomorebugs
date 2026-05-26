import { useEffect, useState } from 'react';
import { Achievement } from '../types';

/** Pixel diamond ornament for HoMM-style corners */
function PixelDiamond({ flip }: { flip?: 'x' | 'y' | 'both' }) {
  const c = '#EF9F27';
  const l = '#fff5a0';
  const sx = flip === 'x' || flip === 'both' ? -1 : 1;
  const sy = flip === 'y' || flip === 'both' ? -1 : 1;
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 9 9"
      style={{ imageRendering: 'pixelated', transform: `scale(${sx}, ${sy})`, display: 'block' }}
    >
      <rect x="0" y="0" width="2" height="2" fill={c} />
      <rect x="7" y="0" width="2" height="2" fill={c} />
      <rect x="0" y="7" width="2" height="2" fill={c} />
      <rect x="7" y="7" width="2" height="2" fill={c} />
      <rect x="3" y="1" width="3" height="2" fill={c} />
      <rect x="1" y="3" width="2" height="3" fill={c} />
      <rect x="3" y="3" width="3" height="3" fill={l} />
      <rect x="6" y="3" width="2" height="3" fill={c} />
      <rect x="3" y="6" width="3" height="2" fill={c} />
    </svg>
  );
}

function PixelStar() {
  return (
    <svg width="10" height="10" viewBox="0 0 5 5" style={{ imageRendering: 'pixelated' }}>
      <rect x="2" y="0" width="1" height="1" fill="#EF9F27" />
      <rect x="0" y="2" width="1" height="1" fill="#EF9F27" />
      <rect x="2" y="2" width="1" height="1" fill="#fff5a0" />
      <rect x="4" y="2" width="1" height="1" fill="#EF9F27" />
      <rect x="2" y="4" width="1" height="1" fill="#EF9F27" />
    </svg>
  );
}

interface AchievementPopupProps {
  achievement: Achievement | null;
  onDismiss: () => void;
}

export default function AchievementPopup({ achievement, onDismiss }: AchievementPopupProps) {
  const [xpVisible, setXpVisible] = useState(false);

  useEffect(() => {
    if (achievement) {
      setXpVisible(false);
      const t1 = setTimeout(() => setXpVisible(true), 700);
      const t2 = setTimeout(() => setTimeout(onDismiss, 500), 3700);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [achievement]);

  if (!achievement) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center pb-10 pointer-events-none">
      <div
        className="pointer-events-auto relative"
        style={{
          animation: 'homm-in 3.7s ease-in-out forwards',
          minWidth: '340px',
          maxWidth: '500px',
          background: 'linear-gradient(180deg, #201806 0%, #1c1c2e 25%, #1a1a2e 100%)',
          boxShadow: [
            '0 0 0 3px #EF9F27',
            '0 0 0 5px #1a1000',
            '0 0 0 7px #c47e15',
            '0 0 0 9px #0f0f1a',
            '0 0 28px rgba(239,159,39,0.4)',
            '0 0 70px rgba(239,159,39,0.15)',
          ].join(', '),
        }}
      >
        {/* Corner ornaments */}
        <div style={{ position: 'absolute', top: '-5px', left: '-5px' }}><PixelDiamond /></div>
        <div style={{ position: 'absolute', top: '-5px', right: '-5px' }}><PixelDiamond flip="x" /></div>
        <div style={{ position: 'absolute', bottom: '-5px', left: '-5px' }}><PixelDiamond flip="y" /></div>
        <div style={{ position: 'absolute', bottom: '-5px', right: '-5px' }}><PixelDiamond flip="both" /></div>

        {/* Header banner */}
        <div
          style={{
            background: 'linear-gradient(90deg, #0f0f1a 0%, #2d1c04 25%, #3e2806 50%, #2d1c04 75%, #0f0f1a 100%)',
            borderBottom: '3px solid #EF9F27',
            padding: '10px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
          }}
        >
          <PixelStar />
          <p
            className="font-pixel gold-shimmer"
            style={{ fontSize: '8px', letterSpacing: '0.1em', lineHeight: 1.8 }}
          >
            ACHIEVEMENT UNLOCKED
          </p>
          <PixelStar />
        </div>

        {/* Content */}
        <div style={{ padding: '16px 20px 14px' }}>
          <div className="flex items-center gap-5">
            {/* Icon medallion */}
            <div
              style={{
                width: '72px',
                height: '72px',
                flexShrink: 0,
                background: 'linear-gradient(135deg, #2d1c04 0%, #1a1a2e 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '2.6rem',
                boxShadow: [
                  '0 0 0 2px #EF9F27',
                  '0 0 0 4px #0f0f1a',
                  '0 0 0 6px #c47e15',
                  'inset 0 0 16px rgba(0,0,0,0.6)',
                ].join(', '),
              }}
            >
              {achievement.icon}
            </div>

            {/* Text */}
            <div style={{ flex: 1 }}>
              <p
                className="font-pixel text-pixel"
                style={{ fontSize: '9px', lineHeight: 2, marginBottom: '6px' }}
              >
                {achievement.name}
              </p>
              <p
                style={{
                  color: 'rgba(232,232,208,0.65)',
                  fontSize: '12px',
                  lineHeight: 1.6,
                  fontFamily: 'Inter, sans-serif',
                }}
              >
                {achievement.description}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            borderTop: '3px solid #EF9F27',
            background: 'linear-gradient(90deg, #0f0f1a 0%, #2d1c04 50%, #0f0f1a 100%)',
            padding: '8px 24px',
            textAlign: 'center',
          }}
        >
          <p
            className="font-pixel gold-shimmer"
            style={{
              fontSize: '7px',
              letterSpacing: '0.15em',
              lineHeight: 1.8,
              opacity: xpVisible ? 1 : 0,
              transform: xpVisible ? 'translateY(0)' : 'translateY(8px)',
              transition: 'opacity 0.35s ease-out, transform 0.35s ease-out',
            }}
          >
            ✦ QUEST COMPLETED ✦
          </p>
        </div>
      </div>
    </div>
  );
}
