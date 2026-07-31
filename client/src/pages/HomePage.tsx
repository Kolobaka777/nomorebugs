import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navigation from '../components/Navigation';
import BugSprite from '../components/BugSprite';
import PixelIcon from '../components/PixelIcon';
import { statsApi, testerApi, leadApi } from '../api';
import { GlobalStats, TestHistoryItem, TeamMember, ActivityItem } from '../types';
import { timeAgo } from '../utils/date';
import { showApiError } from '../utils/toast';

interface HomePageProps {
  user: any;
  onLogout: () => void;
}

const ACTION_LABELS: Record<string, string> = {
  passed_lecture: 'прошёл(а) лекцию',
  failed_lecture: 'не прошёл(а) лекцию',
  login: 'вошёл(ла) в систему',
  completed_baseline: 'заполнил(а) анкету',
};

export default function HomePage({ user, onLogout }: HomePageProps) {
  const navigate = useNavigate();
  const isTester = user.role === 'tester';
  const [stats, setStats] = useState<GlobalStats>({ courses: 10, testers: 4, bugsCaught: 0 });
  const [loading, setLoading] = useState(true);

  // Tester-facing
  const [metrics, setMetrics] = useState<{ lecturesCompleted: number; averageScore: number; skillGrowth: string } | null>(null);
  const [history, setHistory] = useState<TestHistoryItem[]>([]);

  // Lead/admin-facing
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);

  useEffect(() => {
    statsApi.getGlobal().then(r => setStats(r.data)).catch((err: any) => showApiError(err, 'Не удалось загрузить статистику площадки'));

    if (isTester) {
      Promise.all([testerApi.getMetrics(), testerApi.getHistory()])
        .then(([m, h]) => { setMetrics(m.data); setHistory(h.data.slice(0, 5)); })
        // Was silent — a failure here left the widgets at their empty
        // default, indistinguishable from "you haven't done anything yet".
        .catch((err: any) => showApiError(err, 'Не удалось загрузить твои данные'))
        .finally(() => setLoading(false));
    } else {
      Promise.all([leadApi.getTeam(), leadApi.getActivity()])
        .then(([t, a]) => { setTeam(t.data); setActivity(a.data.rows.slice(0, 6)); })
        .catch((err: any) => showApiError(err, 'Не удалось загрузить данные команды'))
        .finally(() => setLoading(false));
    }
  }, [isTester]);

  const needsCheckIn = team.filter(t => t.needsCheckIn);

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
        <section className="max-w-7xl mx-auto px-6 pt-16 pb-10 text-center">
          <div className="flex justify-center gap-6 mb-6">
            <div className="opacity-60 hover:opacity-100 transition-opacity">
              <BugSprite size={40} color="teal" />
            </div>
            <div className="opacity-60 hover:opacity-100 transition-opacity">
              <BugSprite size={40} color="amber" />
            </div>
          </div>

          <h1
            className="font-pixel text-primary mb-3"
            style={{ fontSize: 'clamp(1rem, 4vw, 1.6rem)', lineHeight: 1.8, textShadow: '4px 4px 0 rgba(29,158,117,0.2)' }}
          >
            Привет, {user.name.split(' ')[0]}!
          </h1>
          <p className="text-pixel/60 font-sans text-sm" style={{ fontStyle: 'italic' }}>
            "come in as a bug, leave as a feature"
          </p>
        </section>

        <div className="max-w-5xl mx-auto px-6 pb-16 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ===== LEFT: personalized panel ===== */}
          <div className="lg:col-span-2 space-y-6">
            {isTester ? (
              <>
                {/* Tester quick stats */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'лекций пройдено', value: metrics ? `${metrics.lecturesCompleted}/10` : '—', color: '#1D9E75' },
                    { label: 'средний балл', value: metrics ? `${metrics.averageScore}%` : '—', color: '#7F77DD' },
                    { label: 'рост навыков', value: metrics ? `+${metrics.skillGrowth}` : '—', color: '#EF9F27' },
                  ].map(s => (
                    <div key={s.label} className="p-4 text-center rounded" style={{ background: '#1a1a2e', border: '2px solid rgba(29,158,117,0.12)' }}>
                      <p className="font-pixel mb-1" style={{ color: s.color, fontSize: '0.9rem', lineHeight: 1.6 }}>{s.value}</p>
                      <p className="text-pixel/55 text-xs font-sans">{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* Recent activity */}
                <div>
                  <p className="font-pixel mb-3" style={{ color: 'rgba(232,232,208,0.55)', fontSize: '0.6rem', lineHeight: 1.8 }}>ПОСЛЕДНИЕ РЕЗУЛЬТАТЫ</p>
                  {!loading && history.length === 0 && (
                    <div className="p-6 text-center rounded" style={{ background: '#1a1a2e', border: '1px dashed rgba(232,232,208,0.1)' }}>
                      <p className="text-pixel/55 text-sm font-sans mb-3">Ты ещё не прошёл(а) ни одной лекции</p>
                      <button onClick={() => navigate('/zhukademia')} className="btn-primary text-xs px-4 py-2">Начать первую лекцию →</button>
                    </div>
                  )}
                  <div className="space-y-2">
                    {history.map(h => (
                      <div key={h.id} className="px-4 py-3 flex items-center gap-4 rounded" style={{ background: '#1a1a2e', border: '1px solid rgba(29,158,117,0.08)' }}>
                        <span style={{ color: h.score >= 60 ? '#1D9E75' : '#e05252', fontSize: '0.9rem' }}>{h.score >= 60 ? '✓' : '✗'}</span>
                        <p className="flex-1 text-pixel text-sm font-sans">{h.lecture_title}</p>
                        <span className="text-xs font-sans" style={{ color: h.score >= 60 ? '#1D9E75' : '#e05252' }}>{h.score}%</span>
                        <span className="text-pixel/45 text-xs font-sans shrink-0">{timeAgo(h.completed_at)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Lead/admin quick stats */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'человек в команде', value: team.length || '—', color: '#1D9E75' },
                    { label: 'средний балл', value: team.length ? `${Math.round(team.reduce((s, t) => s + t.avgScore, 0) / team.length)}%` : '—', color: '#7F77DD' },
                    { label: 'нужен чек-ин', value: needsCheckIn.length, color: needsCheckIn.length ? '#e05252' : '#EF9F27' },
                  ].map(s => (
                    <div key={s.label} className="p-4 text-center rounded" style={{ background: '#1a1a2e', border: '2px solid rgba(29,158,117,0.12)' }}>
                      <p className="font-pixel mb-1" style={{ color: s.color, fontSize: '0.9rem', lineHeight: 1.6 }}>{s.value}</p>
                      <p className="text-pixel/55 text-xs font-sans">{s.label}</p>
                    </div>
                  ))}
                </div>

                {needsCheckIn.length > 0 && (
                  <div className="p-4 rounded" style={{ background: 'rgba(224,82,82,0.06)', border: '1px solid rgba(224,82,82,0.25)' }}>
                    <p className="text-xs font-sans font-semibold mb-2" style={{ color: '#e05252' }}>⚠ Давно не активны:</p>
                    <div className="flex flex-wrap gap-2">
                      {needsCheckIn.map(t => (
                        <span key={t.id} className="text-xs font-sans px-2 py-1 rounded" style={{ background: 'rgba(224,82,82,0.12)', color: 'rgba(232,232,208,0.75)' }}>
                          {t.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Team activity feed */}
                <div>
                  <p className="font-pixel mb-3" style={{ color: 'rgba(232,232,208,0.55)', fontSize: '0.6rem', lineHeight: 1.8 }}>ЛЕНТА АКТИВНОСТИ</p>
                  {!loading && activity.length === 0 && (
                    <p className="text-pixel/55 text-sm font-sans text-center py-6">Пока пусто</p>
                  )}
                  <div className="space-y-2">
                    {activity.map(a => (
                      <div key={a.id} className="px-4 py-3 flex items-center gap-3 rounded" style={{ background: '#1a1a2e', border: '1px solid rgba(29,158,117,0.08)' }}>
                        <div className="shrink-0 w-1.5 h-1.5 rounded-full" style={{ background: 'rgba(29,158,117,0.4)' }} />
                        <p className="flex-1 text-xs font-sans" style={{ color: 'rgba(232,232,208,0.7)' }}>
                          <span className="font-semibold text-pixel">{a.name}</span>{' '}
                          {ACTION_LABELS[a.action] || a.action}
                          {a.lecture_title && <span className="text-pixel/55"> · {a.lecture_title}</span>}
                        </p>
                        <span className="text-pixel/45 text-xs font-sans shrink-0">{timeAgo(a.created_at)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* ===== RIGHT: quick links + site stats ===== */}
          <div className="space-y-6">
            <div>
              <p className="font-pixel mb-3" style={{ color: 'rgba(232,232,208,0.55)', fontSize: '0.6rem', lineHeight: 1.8 }}>БЫСТРЫЕ ССЫЛКИ</p>
              <div className="space-y-2">
                {[
                  { label: isTester ? 'Продолжить курсы' : 'Каталог курсов', icon: 'graduation' as const, to: '/zhukademia' },
                  { label: 'Чеклисты', icon: 'check' as const, to: '/checklists' },
                  { label: isTester ? 'Моя нора' : 'Команда (Улей)', icon: isTester ? 'user' as const : 'clipboard' as const, to: isTester ? '/cabinet' : '/dashboard' },
                  { label: 'Багодельня', icon: 'books' as const, to: '/bagodelnya' },
                ].map(link => (
                  <button
                    key={link.to}
                    onClick={() => navigate(link.to)}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded text-left cursor-pointer transition-colors"
                    style={{ background: '#1a1a2e', border: '1px solid rgba(29,158,117,0.08)' }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(29,158,117,0.3)')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(29,158,117,0.08)')}
                  >
                    <PixelIcon name={link.icon} size={14} color="#1D9E75" />
                    <span className="text-pixel text-sm font-sans flex-1">{link.label}</span>
                    <span className="text-pixel/40 text-xs">→</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="font-pixel mb-3" style={{ color: 'rgba(232,232,208,0.55)', fontSize: '0.6rem', lineHeight: 1.8 }}>СТАТИСТИКА ПЛОЩАДКИ</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { icon: 'books' as const, label: 'Курсов', value: stats.courses, color: '#1D9E75' },
                  { icon: 'bug' as const, label: 'Тестеров', value: stats.testers, color: '#7F77DD' },
                  { icon: 'clipboard' as const, label: 'Багов', value: stats.bugsCaught, color: '#EF9F27' },
                ].map(item => (
                  <div key={item.label} className="p-3 text-center rounded" style={{ background: '#1a1a2e', border: '1px solid rgba(29,158,117,0.1)' }}>
                    <PixelIcon name={item.icon} size={16} color={item.color} style={{ margin: '0 auto 6px' }} />
                    <p className="font-pixel mb-0.5" style={{ color: item.color, fontSize: '0.75rem', lineHeight: 1.6 }}>{item.value}</p>
                    <p className="text-pixel/50 text-xs font-sans">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
