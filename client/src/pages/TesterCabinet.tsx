import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { testerApi } from '../api';
import { Lecture } from '../types';

interface TesterCabinetProps {
  user: any;
  onLogout: () => void;
}

export default function TesterCabinet({ user, onLogout }: TesterCabinetProps) {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<any>(null);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [metricsRes, lecturesRes] = await Promise.all([
        testerApi.getMetrics(),
        testerApi.getLectures(),
      ]);
      setMetrics(metricsRes.data);
      setLectures(lecturesRes.data);
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLectureClick = (lecture: Lecture) => {
    if (lecture.status === 'active') {
      navigate(`/lecture/${lecture.id}/quiz`);
    }
  };

  const getStatusColor = (status: string) => {
    return status === 'passed' ? 'text-green-600' : status === 'active' ? 'text-primary' : 'text-gray-400';
  };

  const getStatusBg = (status: string) => {
    return status === 'passed' ? 'bg-green-100' : status === 'active' ? 'bg-primary/10' : 'bg-gray-100';
  };

  if (loading) {
    return <div className="flex justify-center items-center h-screen">Загрузка...</div>;
  }

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Header */}
      <header className="bg-white border-gray-200 border-b">
        <div className="flex justify-between items-center mx-auto px-6 py-4 max-w-6xl">
          <h1 className="font-bold text-gray-900 text-2xl">QA Learning Hub</h1>
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
      <div className="mx-auto px-6 py-8 max-w-6xl">
        {/* Metrics */}
        <div className="gap-4 grid grid-cols-1 md:grid-cols-4 mb-8">
          <div className="card">
            <p className="text-gray-600 text-sm">Лекций завершено</p>
            <p className="font-bold text-primary text-3xl">{metrics?.lecturesCompleted || 0}</p>
          </div>
          <div className="card">
            <p className="text-gray-600 text-sm">Средняя оценка</p>
            <p className="font-bold text-primary text-3xl">{metrics?.averageScore || 0}%</p>
          </div>
          <div className="card">
            <p className="text-gray-600 text-sm">Рост навыков</p>
            <p className="font-bold text-primary text-3xl">
              {metrics?.skillGrowth ? `+${metrics.skillGrowth}` : '0'}
            </p>
          </div>
          <div className="card">
            <p className="text-gray-600 text-sm">Недель осталось</p>
            <p className="font-bold text-primary text-3xl">{metrics?.weeksRemaining || 0}</p>
          </div>
        </div>

        {/* Lectures */}
        <div className="card">
          <h2 className="mb-6 font-bold text-gray-900 text-2xl">Лекции</h2>
          <div className="space-y-4">
            {lectures.map((lecture, idx) => (
              <div
                key={lecture.id}
                onClick={() => handleLectureClick(lecture)}
                className={`p-4 border rounded-lg transition ${
                  lecture.status === 'active' ? 'cursor-pointer hover:bg-primary/5 border-primary' : 'border-gray-200'
                } ${getStatusBg(lecture.status)}`}
              >
                <div className="flex justify-between items-center mb-2">
                  <div>
                    <p className="font-semibold text-gray-900">
                      {idx + 1}. {lecture.title}
                    </p>
                    <p className="text-gray-600 text-sm">{lecture.skill_area}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(lecture.status)} ${getStatusBg(lecture.status)}`}>
                    {lecture.status === 'passed' ? 'Пройдена' : lecture.status === 'active' ? 'Активная' : 'Заблокирована'}
                  </span>
                </div>
                {lecture.status !== 'locked' && (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-300 rounded-full h-2">
                      <div
                        className="bg-primary rounded-full h-2 transition-all"
                        style={{ width: lecture.passed ? `${lecture.score || 0}%` : '0%' }}
                      />
                    </div>
                    <span className="min-w-12 font-semibold text-gray-900 text-sm">
                      {lecture.passed ? `${lecture.score}%` : 'N/A'}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
