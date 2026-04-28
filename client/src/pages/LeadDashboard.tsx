import { useEffect, useState } from 'react';
import { leadApi } from '../api';
import { TeamMember, SKillChart, ActivityItem } from '../types';

interface LeadDashboardProps {
  user: any;
  onLogout: () => void;
}

export default function LeadDashboard({ user, onLogout }: LeadDashboardProps) {
  const [tab, setTab] = useState<'team' | 'before-after'>('team');
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
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-screen">Загрузка...</div>;
  }

  const avgProgress = Math.round(
    team.reduce((acc, m) => acc + (m.lecturesCompleted / 10) * 100, 0) / team.length
  );

  const avgScore = Math.round(team.reduce((acc, m) => acc + m.avgScore, 0) / team.length);

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Header */}
      <header className="bg-white border-gray-200 border-b">
        <div className="flex justify-between items-center mx-auto px-6 py-4 max-w-7xl">
          <h1 className="font-bold text-gray-900 text-2xl">QA Learning Hub - Ведущий</h1>
          <div className="flex items-center gap-4">
            <div className="flex justify-center items-center bg-primary rounded-full w-10 h-10 font-bold text-white">
              {user.avatar_initials}
            </div>
            <div>
              <p className="font-medium text-gray-900 text-sm">{user.name}</p>
              <p className="text-gray-500 text-xs">{user.email}</p>
            </div>
            <button
              onClick={onLogout}
              className="text-sm btn-secondary"
            >
              Выход
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="mx-auto px-6 py-8 max-w-7xl">
        {/* Summary Cards */}
        <div className="gap-4 grid grid-cols-1 md:grid-cols-3 mb-8">
          <div className="card">
            <p className="text-gray-600 text-sm">Средний прогресс</p>
            <p className="font-bold text-primary text-3xl">{avgProgress}%</p>
          </div>
          <div className="card">
            <p className="text-gray-600 text-sm">Средняя оценка</p>
            <p className="font-bold text-primary text-3xl">{avgScore}%</p>
          </div>
          <div className="card">
            <p className="text-gray-600 text-sm">Количество тестирующих</p>
            <p className="font-bold text-primary text-3xl">{team.length}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 mb-6">
          <button
            onClick={() => setTab('team')}
            className={`px-6 py-2 rounded-lg font-semibold transition ${
              tab === 'team'
                ? 'bg-primary text-white'
                : 'bg-white text-gray-900 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            Команда
          </button>
          <button
            onClick={() => setTab('before-after')}
            className={`px-6 py-2 rounded-lg font-semibold transition ${
              tab === 'before-after'
                ? 'bg-primary text-white'
                : 'bg-white text-gray-900 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            До/После
          </button>
        </div>

        {/* Team Tab */}
        {tab === 'team' && (
          <div className="card">
            <h2 className="mb-6 font-bold text-gray-900 text-2xl">Прогресс команды</h2>
            <div className="space-y-4">
              {team.map(member => (
                <div key={member.id} className="p-4 border border-gray-200 rounded-lg">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <p className="font-semibold text-gray-900">{member.name}</p>
                      <p className="text-gray-600 text-sm">
                        Лекций: {member.lecturesCompleted}/10 | Средняя оценка: {member.avgScore}%
                      </p>
                    </div>
                    <p className="font-semibold text-primary text-sm">
                      Рост: +{member.skillGrowth}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-300 rounded-full h-3">
                      <div
                        className="bg-primary rounded-full h-3 transition-all"
                        style={{ width: `${(member.lecturesCompleted / 10) * 100}%` }}
                      />
                    </div>
                    <span className="min-w-12 font-semibold text-gray-900 text-sm">
                      {Math.round((member.lecturesCompleted / 10) * 100)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Before/After Tab */}
        {tab === 'before-after' && (
          <div className="card">
            <h2 className="mb-6 font-bold text-gray-900 text-2xl">Прогресс навыков</h2>
            <div className="space-y-6">
              {skillChart.map(skill => (
                <div key={skill.skill}>
                  <p className="mb-3 font-semibold text-gray-900">{skill.skill}</p>
                  <div className="flex items-center gap-4 mb-2">
                    <div className="flex items-center gap-2">
                      <div className="flex justify-center items-center bg-gray-200 rounded-full w-32 h-8">
                        <span className="font-semibold text-gray-900 text-xs">{skill.before}/5</span>
                      </div>
                      <span className="text-gray-600 text-xs">До</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex justify-center items-center bg-primary rounded-full w-32 h-8 font-semibold text-white text-xs">
                        {skill.after}/5
                      </div>
                      <span className="text-gray-600 text-xs">После</span>
                    </div>
                    <div className={`text-sm font-bold ${skill.delta > 0 ? 'text-green-600' : 'text-gray-600'}`}>
                      {skill.delta > 0 ? '+' : ''}{skill.delta}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Activity Feed */}
        <div className="mt-8 card">
          <h2 className="mb-6 font-bold text-gray-900 text-2xl">Последняя активность</h2>
          <div className="space-y-3">
            {activity.map(item => (
              <div key={item.id} className="p-3 border border-gray-200 rounded">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-gray-900">{item.name}</p>
                    <p className="text-gray-600 text-sm">
                      {item.action === 'passed_lecture' ? 'Прошла лекцию' : item.action}
                      {item.lecture_title ? `: "${item.lecture_title}"` : ''}
                    </p>
                  </div>
                  <p className="text-gray-500 text-xs">
                    {new Date(item.created_at).toLocaleString('ru-RU')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
