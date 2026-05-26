/** Pixel snail that ping-pongs along the bottom border of the header. Purely decorative. */
export default function AmbientSnail() {
  return (
    <div
      className="fixed z-[49] pointer-events-none hidden sm:block"
      style={{
        top: '50px',
        left: 0,
        animation: 'snail-header-crawl 120s linear infinite',
        willChange: 'transform',
      }}
      aria-hidden="true"
    >
      {/* Flips facing direction and hangs upside-down from the header border.
          steps(1, end) snaps the scaleX instantly at the halfway point. */}
      <div style={{ animation: 'snail-header-face 120s steps(1, end) infinite' }}>
        <div style={{ animation: 'snail-body-bob 0.55s steps(2) infinite' }}>
          <svg
            width="72"
            height="48"
            viewBox="0 0 72 48"
            style={{ imageRendering: 'pixelated', display: 'block' }}
          >
            {/* Slime trail */}
            <rect x="0"  y="42" width="10" height="2" fill="rgba(29,158,117,0.25)" />
            <rect x="0"  y="44" width="6"  height="2" fill="rgba(29,158,117,0.12)" />
            {/* Foot underside */}
            <rect x="8"  y="38" width="38" height="6"  fill="#0f7a5a" />
            {/* Body */}
            <rect x="8"  y="26" width="38" height="14" fill="#1D9E75" />
            {/* Head */}
            <rect x="42" y="18" width="20" height="20" fill="#1D9E75" />
            {/* Smile */}
            <rect x="52" y="30" width="8"  height="2"  fill="#0f7a5a" />
            <rect x="50" y="32" width="2"  height="2"  fill="#0f7a5a" />
            <rect x="60" y="32" width="2"  height="2"  fill="#0f7a5a" />
            {/* Eye */}
            <rect x="54" y="20" width="6"  height="6"  fill="#0f0f1a" />
            <rect x="55" y="21" width="3"  height="3"  fill="#e8e8d0" />
            <rect x="57" y="21" width="1"  height="1"  fill="#0f0f1a" />
            {/* Left antenna */}
            <rect x="44" y="10" width="4"  height="12" fill="#1D9E75" />
            <rect x="42" y="8"  width="8"  height="4"  fill="#e8e8d0" />
            {/* Right antenna */}
            <rect x="54" y="6"  width="4"  height="14" fill="#1D9E75" />
            <rect x="52" y="4"  width="8"  height="4"  fill="#e8e8d0" />
            {/* Shell */}
            <rect x="10" y="12" width="32" height="18" fill="#EF9F27" />
            <rect x="16" y="8"  width="20" height="4"  fill="#EF9F27" />
            <rect x="20" y="6"  width="12" height="2"  fill="#EF9F27" />
            {/* Shell spiral */}
            <rect x="20" y="16" width="8"  height="8"  fill="#c47e15" />
            <rect x="14" y="20" width="4"  height="4"  fill="#c47e15" />
            <rect x="30" y="12" width="8"  height="6"  fill="#c47e15" />
            <rect x="12" y="14" width="2"  height="2"  fill="#c47e15" />
            <rect x="36" y="20" width="4"  height="4"  fill="#c47e15" />
            {/* Shell highlight */}
            <rect x="24" y="12" width="6"  height="2"  fill="#f5c060" />
            <rect x="30" y="14" width="2"  height="2"  fill="#f5c060" />
          </svg>
        </div>
      </div>
    </div>
  );
}
