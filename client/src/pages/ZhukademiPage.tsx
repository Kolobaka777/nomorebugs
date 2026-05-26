import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navigation from '../components/Navigation';
import BugSprite from '../components/BugSprite';
import SnailLoader from '../components/SnailLoader';
import { testerApi } from '../api';
import { Lecture, DIFFICULTY_LABELS } from '../types';

interface ZhukademiPageProps {
  user: any;
  onLogout: () => void;
}

const SKILL_COLORS: Record<string, string> = {
  HTML: '#1D9E75',
  CSS: '#7F77DD',
  DevTools: '#EF9F27',
  Browser: '#EF9F27',
  Responsive: '#7F77DD',
  Network: '#1D9E75',
  JavaScript: '#EF9F27',
  Bug: '#1D9E75',
  Advanced: '#e05252',
};

function getSkillColor(area: string): string {
  for (const key of Object.keys(SKILL_COLORS)) {
    if (area.includes(key)) return SKILL_COLORS[key];
  }
  return '#e8e8d0';
}

function getDifficulty(orderNum: number): string {
  if (orderNum <= 3) return '🐛 Личинка';
  if (orderNum <= 7) return '🐞 Жук';
  return '👑 Матёрый';
}

// Topic tags from skill_area
function getTopicTag(area: string): string {
  if (area.includes('HTML')) return 'HTML';
  if (area.includes('CSS')) return 'CSS';
  if (area.includes('DevTools')) return 'DevTools';
  if (area.includes('Console')) return 'Console';
  if (area.includes('Bug')) return 'Bug Reports';
  if (area.includes('JavaScript')) return 'JS';
  if (area.includes('Network')) return 'Network';
  return 'AIO';
}

// Pixel art cover art — simple SVG based on index
function CourseCover({ idx, color }: { idx: number; color: string }) {
  const patterns = [
    // HTML tags
    () => (
      <g>
        <rect x="8" y="10" width="16" height="12" fill={`${color}30`} />
        <rect x="10" y="12" width="12" height="2" fill={color} />
        <rect x="10" y="16" width="8" height="2" fill={color} />
        <rect x="28" y="10" width="16" height="12" fill={`${color}30`} />
        <rect x="30" y="12" width="12" height="2" fill={color} />
        <rect x="30" y="16" width="8" height="2" fill={color} />
        <text x="24" y="22" textAnchor="middle" fill={color} fontSize="6" fontFamily="monospace">{'< >'}</text>
      </g>
    ),
    // CSS brackets
    () => (
      <g>
        <rect x="16" y="8" width="20" height="16" fill={`${color}20`} />
        <rect x="18" y="10" width="4" height="12" fill={color} />
        <rect x="34" y="10" width="4" height="12" fill={color} />
        <rect x="22" y="14" width="12" height="2" fill={color} />
        <rect x="22" y="18" width="8" height="2" fill={color} />
      </g>
    ),
    // Magnifier (DevTools)
    () => (
      <g>
        <rect x="16" y="8" width="16" height="16" fill="none" stroke={color} strokeWidth="2" />
        <rect x="12" y="8" width="4" height="16" fill={`${color}30`} />
        <rect x="32" y="8" width="4" height="16" fill={`${color}30`} />
        <rect x="12" y="4" width="28" height="4" fill={`${color}30`} />
        <rect x="12" y="24" width="28" height="4" fill={`${color}30`} />
        <rect x="20" y="14" width="12" height="2" fill={color} />
        <rect x="22" y="12" width="8" height="2" fill={color} />
        <rect x="22" y="16" width="8" height="2" fill={color} />
      </g>
    ),
  ];

  const PatternFn = patterns[idx % patterns.length];

  return (
    <svg width="100%" height="80" viewBox="0 0 52 32" style={{ imageRendering: 'pixelated' }}>
      <rect width="52" height="32" fill={`${color}08`} />
      <PatternFn />
    </svg>
  );
}

export default function ZhukademiPage({ user, onLogout }: ZhukademiPageProps) {
  const navigate = useNavigate();
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    if (user.role === 'tester') {
      testerApi.getLectures()
        .then(r => setLectures(r.data))
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: '#0f0f1a' }}>
        <Navigation user={user} onLogout={onLogout} />
        <SnailLoader />
      </div>
    );
  }

  const filters = ['all', 'Личинка', 'Жук', 'Матёрый'];
  const filtered = filter === 'all'
    ? lectures
    : lectures.filter(l => getDifficulty(l.order_num).includes(filter));

  // Team completion count (hardcoded simulation for now — leads can't see individual lecture data)
  const teamCompleted = [3, 4, 2, 1, 4, 3, 2, 1, 1, 0];

  return (
    <div className="min-h-screen" style={{ background: '#0f0f1a' }}>
      <Navigation user={user} onLogout={onLogout} />

      <div className="max-w-7xl mx-auto px-6 py-8 fade-in">
        {/* ===== HEADER ===== */}
        <div className="mb-8">
          <h1
            className="font-pixel text-primary mb-2"
            style={{ fontSize: '0.8rem', lineHeight: 1.8 }}
          >
            🎓 Жукадemia
          </h1>
          <p className="text-pixel/50 text-sm font-sans">
            Каталог курсов · {lectures.length > 0 ? lectures.length : 10} модулей
          </p>
        </div>

        {/* ===== FILTER TABS ===== */}
        <div className="flex gap-2 mb-8 flex-wrap">
          {filters.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-4 py-1.5 text-xs font-sans font-medium rounded transition-all cursor-pointer"
              style={{
                background: filter === f ? '#1D9E75' : '#1a1a2e',
                color: filter === f ? '#0f0f1a' : 'rgba(232,232,208,0.6)',
                boxShadow: filter === f
                  ? '2px 0 0 0 #1D9E75, -2px 0 0 0 #1D9E75, 0 2px 0 0 #1D9E75, 0 -2px 0 0 #1D9E75'
                  : '2px 0 0 0 rgba(232,232,208,0.1), -2px 0 0 0 rgba(232,232,208,0.1), 0 2px 0 0 rgba(232,232,208,0.1), 0 -2px 0 0 rgba(232,232,208,0.1)',
              }}
            >
              {f === 'all' ? 'Все' : f}
            </button>
          ))}
        </div>

        {/* ===== COURSE GRID ===== */}
        {lectures.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filtered.map((lecture, idx) => {
              const color = getSkillColor(lecture.skill_area);
              const difficulty = getDifficulty(lecture.order_num);
              const tag = getTopicTag(lecture.skill_area);
              const isPassed = lecture.status === 'passed';
              const isActive = lecture.status === 'active';
              const isLocked = lecture.status === 'locked';
              const teamCount = teamCompleted[idx] || 0;

              return (
                <div
                  key={lecture.id}
                  onClick={() => isActive && navigate(`/lecture/${lecture.id}/quiz`)}
                  className={`rounded overflow-hidden transition-all ${isActive ? 'cursor-pointer hover:-translate-y-1' : ''}`}
                  style={{
                    background: '#1a1a2e',
                    boxShadow: isPassed
                      ? `2px 0 0 0 ${color}, -2px 0 0 0 ${color}, 0 2px 0 0 ${color}, 0 -2px 0 0 ${color}`
                      : isActive
                      ? `2px 0 0 0 #EF9F27, -2px 0 0 0 #EF9F27, 0 2px 0 0 #EF9F27, 0 -2px 0 0 #EF9F27`
                      : `2px 0 0 0 rgba(232,232,208,0.1), -2px 0 0 0 rgba(232,232,208,0.1), 0 2px 0 0 rgba(232,232,208,0.1), 0 -2px 0 0 rgba(232,232,208,0.1)`,
                    opacity: isLocked ? 0.55 : 1,
                  }}
                >
                  {/* Cover */}
                  <div className="relative">
                    <CourseCover idx={idx} color={color} />
                    {isLocked && (
                      <div
                        className="absolute inset-0 flex items-center justify-center"
                        style={{ background: 'rgba(15,15,26,0.6)' }}
                      >
                        <span style={{ fontSize: '1.5rem' }}>🔒</span>
                      </div>
                    )}
                    {isPassed && (
                      <div
                        className="absolute top-2 right-2 text-xs font-sans font-bold px-2 py-0.5 rounded"
                        style={{ background: color, color: '#0f0f1a' }}
                      >
                        ✓
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="p-4">
                    {/* Tags */}
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span
                        className="text-xs font-sans font-semibold px-2 py-0.5 rounded"
                        style={{ background: `${color}20`, color }}
                      >
                        {tag}
                      </span>
                      <span className="text-pixel/40 text-xs font-sans">{difficulty}</span>
                    </div>

                    {/* Title */}
                    <h3 className="text-pixel font-sans font-semibold text-sm leading-snug mb-3">
                      {lecture.title}
                    </h3>

                    {/* Progress bar (if started) */}
                    {isPassed && (
                      <div className="mb-3">
                        <div className="xp-bar-track" style={{ height: '6px' }}>
                          <div
                            className="xp-bar-fill"
                            style={{ width: `${lecture.score || 0}%`, height: '6px' }}
                          />
                        </div>
                        <p className="text-pixel/40 text-xs font-sans mt-1">{lecture.score}%</p>
                      </div>
                    )}

                    {/* Footer */}
                    <div
                      className="flex items-center justify-between pt-3"
                      style={{ borderTop: '1px solid rgba(232,232,208,0.06)' }}
                    >
                      <span className="text-pixel/30 text-xs font-sans">
                        👥 {teamCount}/{4} прошли
                      </span>
                      <div>
                        {isPassed && <span className="badge-passed">сдан</span>}
                        {isActive && <span className="badge-active">→ начать</span>}
                        {isLocked && <span className="badge-locked">закрыт</span>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Lead / no data view */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {[
              { title: 'HTML Basics & Structure', area: 'HTML', order: 1 },
              { title: 'CSS Fundamentals & Layouts', area: 'CSS', order: 2 },
              { title: 'Introduction to DevTools', area: 'DevTools', order: 3 },
              { title: 'Browser Console & Errors', area: 'Browser', order: 4 },
              { title: 'Responsive Design Testing', area: 'Responsive', order: 5 },
              { title: 'CSS Debugging & Inspection', area: 'CSS', order: 6 },
              { title: 'Network Tab & Performance', area: 'Network', order: 7 },
              { title: 'JavaScript Basics for QA', area: 'JavaScript', order: 8 },
              { title: 'Bug Reporting & Documentation', area: 'Bug', order: 9 },
              { title: 'Advanced Testing Scenarios', area: 'Advanced', order: 10 },
            ].map((l, idx) => {
              const color = getSkillColor(l.area);
              return (
                <div
                  key={idx}
                  className="rounded overflow-hidden"
                  style={{
                    background: '#1a1a2e',
                    boxShadow: `2px 0 0 0 ${color}40, -2px 0 0 0 ${color}40, 0 2px 0 0 ${color}40, 0 -2px 0 0 ${color}40`,
                  }}
                >
                  <CourseCover idx={idx} color={color} />
                  <div className="p-4">
                    <span
                      className="text-xs font-sans font-semibold px-2 py-0.5 rounded mb-2 inline-block"
                      style={{ background: `${color}20`, color }}
                    >
                      {getTopicTag(l.area)}
                    </span>
                    <h3 className="text-pixel font-sans font-semibold text-sm leading-snug mb-2">{l.title}</h3>
                    <p className="text-pixel/40 text-xs font-sans">{getDifficulty(l.order)} · 5 вопросов</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
