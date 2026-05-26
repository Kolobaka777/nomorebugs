import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navigation from '../components/Navigation';
import BugSprite from '../components/BugSprite';
import { statsApi, testerApi } from '../api';
import { GlobalStats, Lecture } from '../types';

interface HomePageProps {
  user: any;
  onLogout: () => void;
}

const FEATURED_COURSE_INDICES = [0, 1, 2];

const SKILL_COLORS: Record<string, string> = {
  'HTML': '#1D9E75',
  'CSS': '#7F77DD',
  'DevTools': '#EF9F27',
  'Browser': '#EF9F27',
  'Responsive': '#7F77DD',
  'Network': '#1D9E75',
  'JavaScript': '#EF9F27',
  'Bug': '#1D9E75',
  'Advanced': '#e05252',
};

function getSkillColor(skillArea: string): string {
  for (const key of Object.keys(SKILL_COLORS)) {
    if (skillArea.includes(key)) return SKILL_COLORS[key];
  }
  return '#e8e8d0';
}

export default function HomePage({ user, onLogout }: HomePageProps) {
  const navigate = useNavigate();
  const [stats, setStats] = useState<GlobalStats>({ courses: 10, testers: 4, bugsCaught: 0 });
  const [lectures, setLectures] = useState<Lecture[]>([]);

  useEffect(() => {
    statsApi.getGlobal().then(r => setStats(r.data)).catch(() => {});
    if (user.role === 'tester') {
      testerApi.getLectures().then(r => setLectures(r.data)).catch(() => {});
    }
  }, []);

  const featuredLectures = lectures.slice(0, 3);

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
            "come in as a bug. leave as a feature."
          </p>
          <p
            className="font-pixel text-pixel/20 text-xs mb-12"
            style={{ lineHeight: 1.8 }}
          >
            de[bug] starts here
          </p>

          {/* CTA buttons */}
          <div className="flex justify-center gap-4 flex-wrap">
            <button
              onClick={() => navigate(user.role === 'tester' ? '/cabinet' : '/dashboard')}
              className="btn-amber"
              style={{ fontSize: '14px', padding: '12px 28px' }}
            >
              Моя нора →
            </button>
            <button
              onClick={() => navigate('/zhukademia')}
              className="btn-primary"
              style={{ fontSize: '14px', padding: '12px 28px' }}
            >
              Жукадemia
            </button>
          </div>
        </section>

        {/* ===== STATS BAR ===== */}
        <section className="max-w-7xl mx-auto px-6 mb-16">
          <div
            className="rounded p-6 grid grid-cols-1 sm:grid-cols-3 gap-6 text-center"
            style={{
              background: '#1a1a2e',
              boxShadow: '2px 0 0 0 #1D9E75, -2px 0 0 0 #1D9E75, 0 2px 0 0 #1D9E75, 0 -2px 0 0 #1D9E75',
            }}
          >
            <div>
              <p className="font-pixel text-primary text-2xl mb-2" style={{ lineHeight: 1.6 }}>
                {stats.courses}
              </p>
              <p className="text-pixel/50 text-sm font-sans">курсов</p>
            </div>
            <div style={{ borderLeft: '2px solid rgba(29,158,117,0.2)', borderRight: '2px solid rgba(29,158,117,0.2)' }}>
              <p className="font-pixel text-amber text-2xl mb-2" style={{ lineHeight: 1.6 }}>
                {stats.testers}
              </p>
              <p className="text-pixel/50 text-sm font-sans">тестировщиков</p>
            </div>
            <div>
              <p className="font-pixel text-purple text-2xl mb-2" style={{ lineHeight: 1.6 }}>
                {stats.bugsCaught}
              </p>
              <p className="text-pixel/50 text-sm font-sans">багов поймано</p>
            </div>
          </div>
        </section>

        {/* ===== FEATURED COURSES ===== */}
        <section className="max-w-7xl mx-auto px-6 mb-16">
          <h2
            className="font-pixel text-pixel mb-8 text-center"
            style={{ fontSize: '0.7rem', lineHeight: 1.8 }}
          >
            🐞 ПОПУЛЯРНЫЕ КУРСЫ
          </h2>

          {featuredLectures.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {featuredLectures.map((lecture, idx) => {
                const color = getSkillColor(lecture.skill_area);
                return (
                  <div
                    key={lecture.id}
                    className="p-5 rounded cursor-pointer transition-transform hover:-translate-y-1"
                    style={{
                      background: '#1a1a2e',
                      boxShadow: `2px 0 0 0 ${color}, -2px 0 0 0 ${color}, 0 2px 0 0 ${color}, 0 -2px 0 0 ${color}`,
                    }}
                    onClick={() => navigate('/zhukademia')}
                  >
                    {/* Cover art */}
                    <div
                      className="w-full h-24 rounded mb-4 flex items-center justify-center"
                      style={{ background: `${color}15` }}
                    >
                      <BugSprite size={48} color={idx % 3 === 0 ? 'teal' : idx % 3 === 1 ? 'amber' : 'teal'} />
                    </div>

                    {/* Tag */}
                    <span
                      className="text-xs font-sans font-semibold px-2 py-0.5 rounded mb-2 inline-block"
                      style={{ background: `${color}20`, color }}
                    >
                      {lecture.skill_area}
                    </span>

                    <h3 className="text-pixel font-sans font-semibold text-sm mb-2 leading-snug">
                      {lecture.title}
                    </h3>

                    {/* Difficulty */}
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-pixel/40 text-xs font-sans">
                        {idx < 2 ? '🐛 Личинка' : '🫘 Куколка'}
                      </span>
                      {lecture.status === 'passed' && (
                        <span className="badge-passed">сдан ✓</span>
                      )}
                      {lecture.status === 'active' && (
                        <span className="badge-active">активна</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {['HTML & Структура', 'CSS Основы', 'DevTools'].map((title, idx) => (
                <div
                  key={idx}
                  className="p-5 rounded cursor-pointer transition-transform hover:-translate-y-1"
                  style={{
                    background: '#1a1a2e',
                    boxShadow: `2px 0 0 0 ${idx === 1 ? '#7F77DD' : '#1D9E75'}, -2px 0 0 0 ${idx === 1 ? '#7F77DD' : '#1D9E75'}, 0 2px 0 0 ${idx === 1 ? '#7F77DD' : '#1D9E75'}, 0 -2px 0 0 ${idx === 1 ? '#7F77DD' : '#1D9E75'}`,
                  }}
                  onClick={() => navigate('/zhukademia')}
                >
                  <div
                    className="w-full h-24 rounded mb-4 flex items-center justify-center"
                    style={{ background: 'rgba(29,158,117,0.08)' }}
                  >
                    <BugSprite size={48} color={idx % 2 === 0 ? 'teal' : 'amber'} />
                  </div>
                  <h3 className="text-pixel font-sans font-semibold text-sm mb-2">{title}</h3>
                  <p className="text-pixel/40 text-xs font-sans">🐛 Личинка · 5 лекций</p>
                </div>
              ))}
            </div>
          )}

          <div className="text-center mt-8">
            <button
              onClick={() => navigate('/zhukademia')}
              className="btn-secondary"
            >
              Все курсы →
            </button>
          </div>
        </section>

        {/* ===== SECTIONS GRID ===== */}
        <section className="max-w-7xl mx-auto px-6 mb-20">
          <h2
            className="font-pixel text-pixel mb-8 text-center"
            style={{ fontSize: '0.7rem', lineHeight: 1.8 }}
          >
            🗺️ РАЗДЕЛЫ
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: '🎓', name: 'Жукадemia', desc: 'Каталог курсов по QA', path: '/zhukademia', color: '#1D9E75' },
              { icon: '📖', name: 'Багодельня', desc: 'Шаблоны, словарь, чеклисты', path: '/bagodelnya', color: '#7F77DD' },
              { icon: '🗺️', name: 'Жуководство', desc: 'Дерево навыков QA', path: '/zhukovodstvo', color: '#EF9F27' },
              {
                icon: user.role === 'lead' ? '🐝' : '🐞',
                name: user.role === 'lead' ? 'Улей' : 'Моя нора',
                desc: user.role === 'lead' ? 'Команда и прогресс' : 'Личный кабинет',
                path: user.role === 'lead' ? '/dashboard' : '/cabinet',
                color: '#EF9F27',
              },
            ].map(item => (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className="p-5 rounded text-left transition-all hover:-translate-y-1 hover:scale-[1.02] cursor-pointer"
                style={{
                  background: '#1a1a2e',
                  boxShadow: `2px 0 0 0 ${item.color}, -2px 0 0 0 ${item.color}, 0 2px 0 0 ${item.color}, 0 -2px 0 0 ${item.color}`,
                }}
              >
                <span style={{ fontSize: '2rem' }}>{item.icon}</span>
                <p
                  className="font-pixel mt-3 mb-2"
                  style={{ color: item.color, fontSize: '0.55rem', lineHeight: 1.8 }}
                >
                  {item.name}
                </p>
                <p className="text-pixel/50 text-xs font-sans">{item.desc}</p>
              </button>
            ))}
          </div>
        </section>

        {/* ===== FOOTER SLOGAN ===== */}
        <footer className="text-center pb-12">
          <p
            className="font-pixel text-pixel/10 text-xs"
            style={{ lineHeight: 1.8 }}
          >
            de[bug] starts here
          </p>
        </footer>
      </div>
    </div>
  );
}
