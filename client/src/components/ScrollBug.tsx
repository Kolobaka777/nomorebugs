import { useEffect, useRef, useState } from 'react';
import BugSprite from './BugSprite';

/** Bug that walks along the bottom scroll-progress track. */
export default function ScrollBug() {
  const [pct, setPct] = useState(0);
  const [walking, setWalking] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onScroll = () => {
      const dh = document.documentElement.scrollHeight - window.innerHeight;
      setPct(dh > 0 ? Math.min(window.scrollY / dh, 1) : 0);
      setWalking(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setWalking(false), 350);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 pointer-events-none hidden sm:block"
      style={{ height: '34px' }}
    >
      {/* Track */}
      <div
        className="absolute"
        style={{ bottom: '6px', left: 0, right: 0, height: '2px', background: 'rgba(102, 252, 241,0.1)' }}
      />
      {/* Progress fill */}
      <div
        className="absolute"
        style={{
          bottom: '6px',
          left: 0,
          height: '2px',
          width: `${pct * 100}%`,
          background: 'rgba(102, 252, 241,0.4)',
          transition: 'width 0.12s linear',
        }}
      />
      {/* Bug */}
      <div
        className="absolute"
        style={{
          bottom: '5px',
          left: `clamp(0px, calc(${pct * 100}% - 13px), calc(100% - 26px))`,
          transition: walking ? 'left 0.12s linear' : 'left 0.4s ease-out',
        }}
      >
        <BugSprite size={26} color="teal" walking={walking} />
      </div>
    </div>
  );
}
