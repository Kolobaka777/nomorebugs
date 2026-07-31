import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navigation from '../components/Navigation';
import SnailLoader from '../components/SnailLoader';
import PixelIcon from '../components/PixelIcon';
import { API_BASE_URL as API } from '../config';
import { authFetch } from '../auth';
import { parseServerDate } from '../utils/date';

interface Props {
  user: any;
  onLogout: () => void;
}

function isNew(createdAt: string): boolean {
  return Date.now() - parseServerDate(createdAt).getTime() < 7 * 24 * 60 * 60 * 1000;
}

export default function CustomCourseDetailPage({ user, onLogout }: Props) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [course, setCourse] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState('');

  const load = () => {
    setLoading(true);
    setLoadError(false);
    authFetch(`${API}/custom-courses/${id}`)
      .then(r => r.json())
      .then(data => { if (!data.error) setCourse(data); })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: '#0f0f1a' }}>
        <Navigation user={user} onLogout={onLogout} />
        <SnailLoader />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="min-h-screen" style={{ background: '#0f0f1a' }}>
        <Navigation user={user} onLogout={onLogout} />
        <div className="max-w-3xl mx-auto px-6 py-16 text-center">
          <p className="text-pixel/60 font-sans">
            {loadError ? 'Не удалось загрузить курс — проверьте соединение и попробуйте снова.' : 'Курс не найден'}
          </p>
          <div className="flex items-center justify-center gap-4 mt-4">
            {loadError && (
              <button onClick={load} className="text-primary font-sans text-sm hover:underline">
                ↻ Повторить
              </button>
            )}
            <button onClick={() => navigate('/zhukademia')} className="text-primary font-sans text-sm hover:underline">
              ← К каталогу
            </button>
          </div>
        </div>
      </div>
    );
  }

  const color = course.color || '#1D9E75';
  const courseIsNew = isNew(course.created_at);
  // Server truth (custom_lesson_progress), not localStorage — progress must
  // survive a logout/new-device/redeploy, and a local-only flag can't do that.
  const hasProgress = (course.modules || []).some((m: any) => (m.lessons || []).some((l: any) => l.completed));

  const totalLessons = (course.modules || []).reduce((acc: number, m: any) => acc + (m.lessons || []).filter((l: any) => l.type === 'lesson').length, 0);
  const totalTests = (course.modules || []).reduce((acc: number, m: any) => acc + (m.lessons || []).filter((l: any) => l.type === 'quiz').length, 0);

  const togglePublish = async () => {
    setActionError('');
    setPublishing(true);
    try {
      const res = await authFetch(`${API}/custom-courses/${id}/publish`, { method: 'PATCH' });
      if (!res.ok) throw new Error();
      setCourse((c: any) => ({ ...c, is_published: c.is_published ? 0 : 1 }));
    } catch {
      setActionError('Не удалось изменить статус публикации. Попробуйте ещё раз.');
    } finally {
      setPublishing(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Удалить курс? Это действие нельзя отменить.')) return;
    setActionError('');
    setDeleting(true);
    try {
      const res = await authFetch(`${API}/custom-courses/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      navigate('/zhukademia');
    } catch {
      setActionError('Не удалось удалить курс. Попробуйте ещё раз.');
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-screen fade-in" style={{ background: '#0f0f1a' }}>
      <Navigation user={user} onLogout={onLogout} />

      <div className="max-w-4xl mx-auto px-6 pt-16 pb-8">
        {/* Back */}
        <button
          onClick={() => navigate('/zhukademia')}
          className="flex items-center gap-2 font-sans text-sm mb-8 transition-colors"
          style={{ color: 'rgba(232,232,208,0.6)' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#e8e8d0')}
          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(232,232,208,0.4)')}
        >
          ← К каталогу курсов
        </button>

        {/* Hero */}
        <div
          className="rounded-lg p-8 mb-8"
          style={{
            background: '#1a1a2e',
            boxShadow: `3px 0 0 0 ${color}, -3px 0 0 0 ${color}, 0 3px 0 0 ${color}, 0 -3px 0 0 ${color}`,
          }}
        >
          <div className="flex items-start gap-6 flex-wrap">
            <div
              className="flex-shrink-0 w-16 h-16 rounded flex items-center justify-center"
              style={{ background: `${color}20`, border: `2px solid ${color}40` }}
            >
              <PixelIcon name="books" size={28} color={color} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-3">
                <span
                  className="inline-block text-xs font-sans font-semibold px-2 py-0.5 rounded"
                  style={{ background: `${color}20`, color }}
                >
                  {course.tag}
                </span>
                {courseIsNew && (
                  <span
                    className="inline-block text-xs font-sans font-bold px-2 py-0.5 rounded"
                    style={{ background: '#EF9F27', color: '#0f0f1a' }}
                  >
                    NEW
                  </span>
                )}
                {!course.is_published && user.role === 'lead' && (
                  <span
                    className="inline-block text-xs font-sans px-2 py-0.5 rounded"
                    style={{ background: 'rgba(232,232,208,0.08)', color: 'rgba(232,232,208,0.6)' }}
                  >
                    черновик
                  </span>
                )}
              </div>

              <h1 className="font-pixel text-pixel mb-3" style={{ fontSize: '0.75rem', lineHeight: 1.8 }}>
                {course.title}
              </h1>

              <div className="flex flex-wrap gap-4">
                <span className="text-pixel/60 text-sm font-sans flex items-center gap-1"><PixelIcon name="books" size={12} color="currentColor" /> {totalLessons} урок{totalLessons !== 1 ? 'а' : ''}</span>
                <span className="text-pixel/60 text-sm font-sans flex items-center gap-1"><PixelIcon name="memo" size={12} color="currentColor" /> {totalTests} тест{totalTests !== 1 ? 'а' : ''}</span>
                <span className="text-pixel/60 text-sm font-sans flex items-center gap-1"><PixelIcon name="pencil" size={12} color="currentColor" /> {course.author_name}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left */}
          <div className="lg:col-span-2 space-y-6">
            {/* About */}
            {course.description && (
              <section
                className="rounded-lg p-6"
                style={{ background: '#1a1a2e', border: '1px solid rgba(232,232,208,0.06)' }}
              >
                <h2 className="font-pixel text-pixel mb-4" style={{ fontSize: '0.65rem', lineHeight: 2 }}>О курсе</h2>
                <p className="text-pixel/70 font-sans text-sm leading-relaxed">{course.description}</p>
              </section>
            )}

            {/* Program */}
            {course.modules?.length > 0 && (
              <section
                className="rounded-lg p-6"
                style={{ background: '#1a1a2e', border: '1px solid rgba(232,232,208,0.06)' }}
              >
                <h2 className="font-pixel text-pixel mb-5" style={{ fontSize: '0.65rem', lineHeight: 2 }}>Программа курса</h2>
                <div className="space-y-4">
                  {course.modules.map((mod: any, i: number) => (
                    <div key={mod.id}>
                      <div className="flex items-center gap-2 mb-2">
                        <span
                          className="w-5 h-5 rounded text-xs flex items-center justify-center font-sans font-bold flex-shrink-0"
                          style={{ background: `${color}30`, color }}
                        >
                          {i + 1}
                        </span>
                        <span className="text-pixel font-sans font-semibold text-sm">{mod.title}</span>
                      </div>
                      <ul className="ml-7 space-y-1">
                        {(mod.lessons || []).map((l: any, j: number) => (
                          <li key={l.id} className="text-pixel/60 font-sans text-xs flex items-center gap-2">
                            <span style={{ color: `${color}80` }}>›</span>
                            {l.type === 'quiz' ? <span className="flex items-center gap-1"><PixelIcon name="memo" size={10} color="currentColor" />{l.title}</span> : l.title}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Right */}
          <div className="space-y-4">
            {/* Requirements */}
            {course.requirements && (
              <section
                className="rounded-lg p-5"
                style={{ background: '#1a1a2e', border: '1px solid rgba(232,232,208,0.06)' }}
              >
                <h2 className="font-pixel text-pixel mb-3" style={{ fontSize: '0.6rem', lineHeight: 2 }}>Требования</h2>
                <p className="text-pixel/60 font-sans text-xs leading-relaxed">{course.requirements}</p>
              </section>
            )}

            {/* CTA — tester */}
            {user.role === 'tester' && course.is_published && (
              <button
                onClick={() => navigate(`/custom-course/${id}/learn`)}
                className="w-full py-3 rounded font-sans font-bold text-sm transition-all hover:-translate-y-0.5"
                style={{ background: color, color: '#0f0f1a', boxShadow: `0 4px 0 0 ${color}60` }}
              >
                {hasProgress ? '▶ Продолжить курс' : '▶ Начать курс'}
              </button>
            )}

            {/* Lead controls */}
            {user.role === 'lead' && (
              <div className="space-y-2">
                {actionError && (
                  <p className="text-xs font-sans mb-1" style={{ color: '#e05252' }}>{actionError}</p>
                )}
                <button
                  onClick={() => navigate(`/custom-course/${id}/learn`)}
                  className="w-full py-2.5 rounded font-sans font-semibold text-sm transition-all"
                  style={{ background: `${color}20`, color }}
                >
                  <span className="flex items-center justify-center gap-1"><PixelIcon name="search" size={12} color="currentColor" /> Предпросмотр</span>
                </button>
                <button
                  onClick={() => navigate(`/lead/course-builder/${id}`)}
                  className="w-full py-2.5 rounded font-sans font-semibold text-sm transition-all"
                  style={{ background: 'rgba(232,232,208,0.07)', color: 'rgba(232,232,208,0.7)' }}
                >
                  <span className="flex items-center justify-center gap-1"><PixelIcon name="pencil" size={12} color="currentColor" /> Редактировать</span>
                </button>
                <button
                  onClick={togglePublish}
                  disabled={publishing}
                  className="w-full py-2.5 rounded font-sans font-semibold text-sm transition-all"
                  style={{
                    background: course.is_published ? 'rgba(224,82,82,0.1)' : 'rgba(29,158,117,0.1)',
                    color: course.is_published ? '#e05252' : '#1D9E75',
                  }}
                >
                  {publishing ? '...' : course.is_published
                    ? <span className="flex items-center justify-center gap-1"><PixelIcon name="warning" size={12} color="currentColor" /> Снять с публикации</span>
                    : <span className="flex items-center justify-center gap-1"><PixelIcon name="rocket" size={12} color="currentColor" /> Опубликовать</span>
                  }
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="w-full py-2 rounded font-sans text-xs transition-all"
                  style={{ background: 'transparent', color: 'rgba(224,82,82,0.4)' }}
                >
                  {deleting ? 'Удаляю...' : <span className="flex items-center justify-center gap-1"><PixelIcon name="wrench" size={11} color="currentColor" /> Удалить курс</span>}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
