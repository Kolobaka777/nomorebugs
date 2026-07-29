import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navigation from '../components/Navigation';
import BugSprite from '../components/BugSprite';
import PixelIcon from '../components/PixelIcon';
import { statsApi } from '../api';
import { GlobalStats } from '../types';

interface HomePageProps {
  user: any;
  onLogout: () => void;
}

export default function HomePage({ user, onLogout }: HomePageProps) {
  const navigate = useNavigate();
  const [stats, setStats] = useState<GlobalStats>({ courses: 10, testers: 4, bugsCaught: 0 });

  useEffect(() => {
    statsApi.getGlobal().then(r => setStats(r.data)).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen" style={{ background: '#0f0f1a' }}>
      <Navigation user={user} onLogout={onLogout} />

      {/* Background grid */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: 'linear-gradient(#1D9E75 1px, transparent 1px), linear-gradient(90deg, #1D9E75 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      <div className="relative z-10">
        {/* ===== HERO SECTION ===== */}
        <section className="max-w-7xl mx-auto px-6 py-20 text-center">
          <div className="flex justify-center gap-6 mb-8">
            <div className="opacity-60 hover:opacity-100 transition-opacity">
              <BugSprite size={48} color="teal" />
            </div>
            <div className="opacity-80">
              {/* Bug in graduation cap - SVG */}
              <svg width="64" height="72" viewBox="0 0 64 72" style={{ imageRendering: 'pixelated' }}>
                {/* Cap */}
                <rect x="16" y="2"  width="32" height="4"  fill="#EF9F27" />
                <rect x="24" y="6"  width="16" height="4"  fill="#EF9F27" />
                <rect x="28" y="10" width="8"  height="4"  fill="#EF9F27" />
                <rect x="44" y="6"  width="4"  height="8"  fill="#EF9F27" />
                <rect x="48" y="12" width="4"  height="2"  fill="#EF9F27" />
                {/* Bug body */}
                <rect x="20" y="18" width="24" height="28" fill="#1D9E75" />
                {/* Bug head */}
                <rect x="22" y="12" width="20" height="10" fill="#0f7a5a" />
                {/* Eyes */}
                <rect x="22" y="12" width="6"  height="6"  fill="#e8e8d0" />
                <rect x="36" y="12" width="6"  height="6"  fill="#e8e8d0" />
                <rect x="24" y="14" width="3"  height="3"  fill="#0f0f1a" />
                <rect x="38" y="14" width="3"  height="3"  fill="#0f0f1a" />
                {/* Spots */}
                <rect x="22" y="20" width="6"  height="6"  fill="#0f7a5a" />
                <rect x="36" y="20" width="6"  height="6"  fill="#0f7a5a" />
                <rect x="22" y="32" width="6"  height="6"  fill="#0f7a5a" />
                <rect x="36" y="32" width="6"  height="6"  fill="#0f7a5a" />
                {/* Center line */}
                <rect x="30" y="18" width="4"  height="28" fill="#0f7a5a" />
                {/* Antennae */}
                <rect x="20" y="6"  width="2"  height="8"  fill="#0f7a5a" />
                <rect x="42" y="6"  width="2"  height="8"  fill="#0f7a5a" />
                {/* Legs */}
                <rect x="10" y="24" width="10" height="2"  fill="#0f7a5a" />
                <rect x="44" y="24" width="10" height="2"  fill="#0f7a5a" />
                <rect x="10" y="32" width="10" height="2"  fill="#0f7a5a" />
                <rect x="44" y="32" width="10" height="2"  fill="#0f7a5a" />
                <rect x="10" y="40" width="10" height="2"  fill="#0f7a5a" />
                <rect x="44" y="40" width="10" height="2"  fill="#0f7a5a" />
              </svg>
            </div>
            <div className="opacity-60 hover:opacity-100 transition-opacity">
              <BugSprite size={48} color="amber" />
            </div>
          </div>

          <h1
            className="font-pixel text-primary mb-6"
            style={{ fontSize: 'clamp(1rem, 4vw, 2rem)', lineHeight: 1.8, textShadow: '4px 4px 0 rgba(29,158,117,0.2)' }}
          >
            baga-net
          </h1>
          <p
            className="text-pixel/60 font-sans text-lg mb-4"
            style={{ fontStyle: 'italic' }}
          >
            "здесь мог бы быть ваш анекдот....."
          </p>
          <p
            className="font-pixel text-pixel/55 text-xs mb-12"
            style={{ lineHeight: 1.8 }}
          >
            здесь тоже...
          </p>
        </section>

        {/* ===== STATS SECTION ===== */}
        <section className="max-w-4xl mx-auto px-6 pb-16">
          <div className="grid grid-cols-3 gap-4">
            {[
              { icon: 'books'     as const, label: 'Курсов',         value: stats.courses,    color: '#1D9E75' },
              { icon: 'bug'       as const, label: 'Тестировщиков',  value: stats.testers,    color: '#7F77DD' },
              { icon: 'clipboard' as const, label: 'Багов поймано',  value: stats.bugsCaught, color: '#EF9F27' },
            ].map(item => (
              <div
                key={item.label}
                className="p-5 text-center"
                style={{
                  background: '#1a1a2e',
                  border: '2px solid rgba(29,158,117,0.12)',
                  boxShadow: `0 0 0 1px ${item.color}10 inset`,
                }}
              >
                <PixelIcon name={item.icon} size={20} color={item.color} style={{ margin: '0 auto 10px' }} />
                <p className="font-pixel mb-1" style={{ color: item.color, fontSize: '1rem', lineHeight: 1.6 }}>
                  {item.value}
                </p>
                <p className="font-pixel" style={{ color: 'rgba(232,232,208,0.55)', fontSize: '0.42rem', lineHeight: 1.8 }}>
                  {item.label}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ===== BOARD SECTION ===== */}
        <section className="max-w-4xl mx-auto px-6 pb-20">
          <div className="flex items-center gap-2 mb-4 px-1">
            <PixelIcon name="antenna" size={12} color="rgba(232,232,208,0.2)" />
            <span className="font-pixel" style={{ color: 'rgba(232,232,208,0.55)', fontSize: '0.42rem', lineHeight: 1.8 }}>
              ДОСКА
            </span>
          </div>
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div
                key={i}
                className="px-4 py-3 flex items-center gap-4"
                style={{
                  background: '#1a1a2e',
                  border: '1px solid rgba(29,158,117,0.08)',
                }}
              >
                <div
                  className="shrink-0 w-1.5 h-1.5"
                  style={{ background: 'rgba(232,232,208,0.12)' }}
                />
                <p
                  className="font-sans text-xs"
                  style={{ color: 'rgba(232,232,208,0.55)' }}
                >
                  здесь появится объявление {i}
                </p>
              </div>
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}
