import { useEffect, useState } from 'react';
import Navigation from '../components/Navigation';
import SnailLoader from '../components/SnailLoader';
import { leadApi } from '../api';
import { TeamMember, SKillChart, ActivityItem, getLevel } from '../types';

interface UleyPageProps {
  user: any;
  onLogout: () => void;
}

type Tab = 'team' | 'before-after' | 'activity';

const ACTION_LABELS: Record<string, string> = {
  passed_lecture: '✓ прошла лекцию',
  failed_lecture: '✗ не прошла лекцию',
  login: '→ вошла в систему',
  completed_baseline: '📝 заполнила анкету',
};

export default function UleyPage({ user, onLogout }: UleyPageProps) {
  const [tab, setTab] = useState<Tab>('team');
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [skillChart, setSkillChart] = useState<SKillChart[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [teamRes, chartRes, activityRes] = await Promise.all([
        leadApi.getTeam(),
        leadApi.getBeforeAfter(),
        leadApi.getActivity(),
      ]);
      setTeam(teamRes.data);
      setSkillChart(chartRes.data);
      setActivity(activityRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: '#0f0f1a' }}>
        <Navigation user={user} onLogout={onLogout} />
        <SnailLoader />
      </div>
    );
  }

  const avgProgress = team.length
    ? Math.round(team.reduce((acc, m) => acc + (m.lecturesCompleted / 10) * 100, 0) / team.length)
    : 0;
  const avgScore = team.length
    ? Math.round(team.reduce((acc, m) => acc + m.avgScore, 0) / team.length)
    : 0;
  const snailCount = team.filter(m => m.isSnail).length;

  const TABS: { id: Tab; label: string }[] = [
    { id: 'team', label: '🐝 Команда' },
    { id: 'before-after', label: '📊 До/После' },
    { id: 'activity', label: '🐛 Жучиная нора' },
  ];

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
            👑🐝 Улей
          </h1>
          <p className="text-pixel/50 text-sm font-sans">Дашборд тимлида · {team.length} жуков в улье</p>
        </div>

        {/* ===== METRIC CARDS ===== */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Средний прогресс', value: `${avgProgress}%`, color: '#1D9E75' },
            { label: 'Средний балл', value: `${avgScore}%`, color: '#EF9F27' },
            { label: 'Жуков в улье', value: team.length, color: '#7F77DD' },
            {
              label: 'Улиточный темп 🐌',
              value: snailCount,
              color: snailCount > 0 ? '#e05252' : '#1D9E75',
            },
          ].map((m, idx) => (
            <div
              key={idx}
              className="p-4 rounded"
              style={{
                background: '#1a1a2e',
                boxShadow: `2px 0 0 0 ${m.color}40, -2px 0 0 0 ${m.color}40, 0 2px 0 0 ${m.color}40, 0 -2px 0 0 ${m.color}40`,
              }}
            >
              <p className="text-pixel/50 text-xs font-sans mb-2">{m.label}</p>
              <p className="font-pixel" style={{ color: m.color, fontSize: '1.1rem', lineHeight: 1.6 }}>
                {m.value}
              </p>
            </div>
          ))}
        </div>

        {/* ===== SNAIL ALERT ===== */}
        {snailCount > 0 && (
          <div
            className="mb-6 p-4 rounded flex items-start gap-3"
            style={{
              background: 'rgba(224,82,82,0.08)',
              boxShadow: '2px 0 0 0 #e05252, -2px 0 0 0 #e05252, 0 2px 0 0 #e05252, 0 -2px 0 0 #e05252',
            }}
          >
            <span style={{ fontSize: '1.5rem' }}>🐌</span>
            <div>
              <p className="font-pixel text-xs" style={{ color: '#e05252', lineHeight: 1.8 }}>
                Улиточный темп!
              </p>
              <p className="text-pixel/60 text-sm font-sans mt-1">
                {team.filter(m => m.isSnail).map(m => m.name).join(', ')} —{' '}
                {snailCount === 1 ? 'нет активности 7+ дней' : 'нет активности 7+ дней у нескольких жуков'}
              </p>
            </div>
          </div>
        )}

        {/* ===== TABS ===== */}
        <div
          className="flex gap-0 mb-6 rounded overflow-hidden"
          style={{ border: '2px solid rgba(29,158,117,0.2)' }}
        >
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex-1 py-3 text-xs font-sans font-medium transition-all cursor-pointer"
              style={{
                background: tab === t.id ? '#1D9E75' : 'transparent',
                color: tab === t.id ? '#0f0f1a' : 'rgba(232,232,208,0.5)',
                borderRight: '1px solid rgba(29,158,117,0.2)',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ===== TAB: TEAM ===== */}
        {tab === 'team' && (
          <div className="space-y-4">
            {team.map(member => {
              const lvl = getLevel(member.lecturesCompleted);
              const progPct = Math.round((member.lecturesCompleted / 10) * 100);
              return (
                <div
                  key={member.id}
                  className="p-5 rounded"
                  style={{
                    background: '#1a1a2e',
                    boxShadow: member.isSnail
                      ? '2px 0 0 0 #e05252, -2px 0 0 0 #e05252, 0 2px 0 0 #e05252, 0 -2px 0 0 #e05252'
                      : '2px 0 0 0 #1D9E75, -2px 0 0 0 #1D9E75, 0 2px 0 0 #1D9E75, 0 -2px 0 0 #1D9E75',
                  }}
                >
                  <div className="flex items-start justify-between gap-4 mb-4">
                    {/* Avatar + name */}
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded flex items-center justify-center font-pixel text-game text-xs shrink-0"
                        style={{ background: '#1D9E75' }}
                      >
                        {member.avatar_initials}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-pixel font-sans font-semibold text-sm">{member.name}</p>
                          {member.isSnail && (
                            <span
                              className="text-xs"
                              title="Улиточный темп — нет активности 7+ дней"
                            >
                              🐌
                            </span>
                          )}
                        </div>
                        <p className="text-pixel/40 text-xs font-sans">
                          {lvl.emoji} {lvl.name}
                        </p>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="text-right shrink-0">
                      <p className="text-primary text-sm font-sans font-semibold">
                        {member.avgScore}%
                      </p>
                      <p className="text-pixel/40 text-xs font-sans">средний балл</p>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="flex items-center gap-3">
                    <div className="xp-bar-track flex-1">
                      <div className="xp-bar-fill" style={{ width: `${progPct}%` }} />
                    </div>
                    <span className="text-pixel/60 text-xs font-sans min-w-[80px] text-right">
                      {member.lecturesCompleted}/10 лекций
                    </span>
                  </div>

                  {/* Skill growth */}
                  <div className="flex items-center justify-between mt-3 pt-3"
                    style={{ borderTop: '1px solid rgba(232,232,208,0.05)' }}
                  >
                    <p className="text-pixel/30 text-xs font-sans">
                      {member.daysInactive < 999
                        ? `Активность: ${member.daysInactive === 0 ? 'сегодня' : `${member.daysInactive} дн назад`}`
                        : 'Активность: —'}
                    </p>
                    <p className="text-primary text-xs font-sans font-semibold">
                      рост: +{member.skillGrowth}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ===== TAB: BEFORE/AFTER ===== */}
        {tab === 'before-after' && (
          <div className="space-y-5">
            <p className="text-pixel/40 text-xs font-sans">
              Сравнение средних навыков команды до и после обучения
            </p>
            {skillChart.map(skill => (
              <div key={skill.skill} className="card">
                <div className="flex justify-between items-center mb-4">
                  <p className="text-pixel font-sans font-semibold text-sm">{skill.skill}</p>
                  <span
                    className="text-xs font-sans font-bold px-2 py-1 rounded"
                    style={{
                      color: skill.delta > 0 ? '#1D9E75' : 'rgba(232,232,208,0.4)',
                      background: skill.delta > 0 ? 'rgba(29,158,117,0.15)' : 'transparent',
                    }}
                  >
                    {skill.delta > 0 ? `+${skill.delta}` : skill.delta === 0 ? '—' : skill.delta}
                  </span>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="text-pixel/40 text-xs font-sans w-12 shrink-0">ДО</span>
                    <div className="xp-bar-track-amber flex-1">
                      <div
                        className="xp-bar-fill-amber"
                        style={{ width: `${(skill.before / 5) * 100}%` }}
                      />
                    </div>
                    <span className="text-amber text-xs font-sans w-10 text-right">{skill.before}/5</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-pixel/40 text-xs font-sans w-12 shrink-0">ПОСЛЕ</span>
                    <div className="xp-bar-track flex-1">
                      <div
                        className="xp-bar-fill"
                        style={{ width: `${(skill.after / 5) * 100}%` }}
                      />
                    </div>
                    <span className="text-primary text-xs font-sans w-10 text-right">{skill.after}/5</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ===== TAB: ACTIVITY FEED ===== */}
        {tab === 'activity' && (
          <div>
            <div className="flex items-center gap-3 mb-6">
              <h2
                className="font-pixel text-pixel/60"
                style={{ fontSize: '0.6rem', lineHeight: 1.8 }}
              >
                🐛 Жучиная нора
              </h2>
              <span className="text-pixel/30 text-xs font-sans">последние 20 событий</span>
            </div>
            <div className="space-y-2">
              {activity.length === 0 ? (
                <div className="card text-center py-8">
                  <p className="text-pixel/40 text-sm font-sans">Нет активности</p>
                </div>
              ) : (
                activity.map(item => (
                  <div
                    key={item.id}
                    className="p-3 rounded flex items-start justify-between gap-4"
                    style={{
                      background: '#1a1a2e',
                      borderLeft: `3px solid ${
                        item.action === 'passed_lecture' ? '#1D9E75' :
                        item.action === 'failed_lecture' ? '#e05252' :
                        '#EF9F27'
                      }`,
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-pixel font-sans font-semibold text-sm">{item.name}</p>
                      <p className="text-pixel/50 text-xs font-sans">
                        {ACTION_LABELS[item.action] || item.action}
                        {item.lecture_title ? `: "${item.lecture_title}"` : ''}
                      </p>
                    </div>
                    <p className="text-pixel/30 text-xs font-sans shrink-0">
                      {new Date(item.created_at).toLocaleString('ru-RU', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
