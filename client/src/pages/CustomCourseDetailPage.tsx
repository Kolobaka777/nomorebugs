import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navigation from '../components/Navigation';
import SnailLoader from '../components/SnailLoader';
import Icon from '../components/Icon';
import { BookOpenIcon, PagesIcon, CapIcon, PencilLineIcon, SearchIcon, TrashLineIcon } from '../components/CatalogIcons';
import { API_BASE_URL as API } from '../config';
import { authFetch } from '../auth';
import { leadApi } from '../api';
import { parseServerDate } from '../utils/date';
import { PAGE_GRADIENT, PAGE_BG, CARD_BG, TEXT_PRIMARY, TEXT_MUTED, ACCENT, TRACK_WIDE } from '../utils/theme';

interface Props {
  user: any;
  onLogout: () => void;
}

function isNew(createdAt: string): boolean {
  return Date.now() - parseServerDate(createdAt).getTime() < 7 * 24 * 60 * 60 * 1000;
}

function deadlineInfo(deadline: string | null): { label: string; color: string } | null {
  if (!deadline) return null;
  const due = parseServerDate(deadline).getTime();
  const diffDays = Math.ceil((due - Date.now()) / (24 * 60 * 60 * 1000));
  const dateStr = parseServerDate(deadline).toLocaleDateString('ru-RU');
  if (diffDays < 0) return { label: `Дедлайн просрочен (${dateStr})`, color: '#e05252' };
  if (diffDays === 0) return { label: 'Дедлайн сегодня', color: '#EF9F27' };
  if (diffDays <= 3) return { label: `Дедлайн через ${diffDays} дн.`, color: '#EF9F27' };
  return { label: `Дедлайн: ${dateStr}`, color: 'rgba(197, 198, 199,0.6)' };
}

// Card shell shared by every panel on this page ("О курсе", "Программа
// курса", "Требования", "Содержание", "Прогресс команды") — one place to
// keep the border/radius/shadow/heading style consistent.
function Panel({ title, children, pad = 'p-6' }: { title: string; children: React.ReactNode; pad?: string }) {
  return (
    <section
      className={`rounded-lg ${pad}`}
      style={{ background: CARD_BG, border: '1px solid rgba(197, 198, 199,0.08)', boxShadow: '0 6px 12px 0 rgba(0, 0, 0, 0.25)' }}
    >
      <h2 className="font-montserrat font-semibold mb-4" style={{ fontSize: 16, color: TEXT_PRIMARY, letterSpacing: TRACK_WIDE }}>{title}</h2>
      {children}
    </section>
  );
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
  const [deadlineEditFor, setDeadlineEditFor] = useState<number | null>(null);
  const [deadlineDraft, setDeadlineDraft] = useState('');
  const [savingDeadline, setSavingDeadline] = useState(false);

  const saveDeadlineOverride = async (userId: number) => {
    if (!deadlineDraft) return;
    setSavingDeadline(true);
    try {
      await leadApi.setDeadlineOverride(Number(id), { user_id: userId, deadline_at: deadlineDraft });
      setDeadlineEditFor(null);
      load();
    } catch {
      setActionError('Не удалось продлить дедлайн');
    } finally {
      setSavingDeadline(false);
    }
  };

  const removeDeadlineOverride = async (userId: number) => {
    setSavingDeadline(true);
    try {
      await leadApi.removeDeadlineOverride(Number(id), userId);
      setDeadlineEditFor(null);
      load();
    } catch {
      setActionError('Не удалось сбросить дедлайн');
    } finally {
      setSavingDeadline(false);
    }
  };

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
      <div className="min-h-screen" style={{ background: PAGE_GRADIENT }}>
        <Navigation user={user} onLogout={onLogout} />
        <SnailLoader />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="min-h-screen" style={{ background: PAGE_GRADIENT }}>
        <Navigation user={user} onLogout={onLogout} />
        <div className="max-w-3xl mx-auto px-6 py-16 text-center">
          <p className="font-geist" style={{ color: TEXT_MUTED }}>
            {loadError ? 'Не удалось загрузить курс — проверьте соединение и попробуйте снова.' : 'Курс не найден'}
          </p>
          <div className="flex items-center justify-center gap-4 mt-4">
            {loadError && (
              <button onClick={load} className="font-geist text-sm hover:underline" style={{ color: ACCENT }}>
                ↻ Повторить
              </button>
            )}
            <button onClick={() => navigate('/zhukademia')} className="font-geist text-sm hover:underline" style={{ color: ACCENT }}>
              <Icon name="chevronLeft" size={22} color="currentColor" /> К каталогу
            </button>
          </div>
        </div>
      </div>
    );
  }

  const color = course.color || ACCENT;
  const courseIsNew = isNew(course.created_at);
  // Server truth (custom_lesson_progress), not localStorage — progress must
  // survive a logout/new-device/redeploy, and a local-only flag can't do that.
  const hasProgress = (course.modules || []).some((m: any) => (m.lessons || []).some((l: any) => l.completed));

  const totalLessons = (course.modules || []).reduce((acc: number, m: any) => acc + (m.lessons || []).filter((l: any) => l.type === 'lesson').length, 0);
  const totalTests = (course.modules || []).reduce((acc: number, m: any) => acc + (m.lessons || []).filter((l: any) => l.type === 'quiz').length, 0);
  const totalModules = (course.modules || []).length;

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
    <div className="min-h-screen fade-in" style={{ background: PAGE_GRADIENT }}>
      <Navigation user={user} onLogout={onLogout} />

      <div className="max-w-5xl mx-auto px-8 pt-16 pb-16">
        {/* Back */}
        <button
          onClick={() => navigate('/zhukademia')}
          className="flex items-center gap-2 font-geist text-sm mb-8 transition-colors cursor-pointer"
          style={{ color: 'rgba(197, 198, 199,0.6)' }}
          onMouseEnter={e => (e.currentTarget.style.color = TEXT_PRIMARY)}
          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(197, 198, 199,0.6)')}
        >
          <Icon name="chevronLeft" size={22} color="currentColor" /> К каталогу курсов
        </button>

        {/* Hero */}
        <div
          className="rounded-lg p-8 mb-8"
          style={{ background: CARD_BG, border: `1px solid ${color}`, boxShadow: '0 8px 12px 0 rgba(0, 0, 0, 0.25)' }}
        >
          <div className="flex items-start gap-6 flex-wrap">
            <div
              className="flex-shrink-0 w-16 h-16 rounded-lg flex items-center justify-center"
              style={{ background: `${color}18`, border: `1.5px solid ${color}55` }}
            >
              <BookOpenIcon size={28} color={color} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-3">
                <span className="font-geist font-semibold rounded px-2 py-0.5" style={{ fontSize: 11, background: `${color}20`, color, border: `1px solid ${color}55` }}>
                  {course.tag}
                </span>
                {courseIsNew && (
                  <span className="font-geist font-bold rounded px-2 py-0.5" style={{ fontSize: 11, background: '#4ADE80', color: PAGE_BG }}>
                    NEW
                  </span>
                )}
                {!course.is_published && course.proposal_status === 'pending' && (user.role === 'lead' || user.role === 'admin' || course.created_by === user.id) && (
                  <span className="font-geist font-semibold rounded px-2 py-0.5" style={{ fontSize: 11, background: 'rgba(239,159,39,0.15)', color: '#EF9F27' }}>
                    на рассмотрении
                  </span>
                )}
                {!course.is_published && course.proposal_status !== 'pending' && user.role === 'lead' && (
                  <span className="font-geist rounded px-2 py-0.5" style={{ fontSize: 11, background: 'rgba(197, 198, 199,0.08)', color: 'rgba(197, 198, 199,0.6)' }}>
                    черновик
                  </span>
                )}
                {(() => {
                  const info = deadlineInfo(course.effectiveDeadline);
                  return info ? (
                    <span className="font-geist rounded px-2 py-0.5" style={{ fontSize: 11, background: `${info.color}20`, color: info.color }}>
                      {info.label}
                    </span>
                  ) : null;
                })()}
              </div>

              <h1 className="font-montserrat font-bold mb-3" style={{ fontSize: 24, color: TEXT_PRIMARY, letterSpacing: TRACK_WIDE }}>
                {course.title}
              </h1>

              <div className="flex flex-wrap gap-5">
                <span className="font-geist text-sm flex items-center gap-1.5" style={{ color: TEXT_MUTED }}><BookOpenIcon size={16} color="currentColor" /> {totalLessons} урок{totalLessons !== 1 ? 'а' : ''}</span>
                <span className="font-geist text-sm flex items-center gap-1.5" style={{ color: TEXT_MUTED }}><PagesIcon size={16} color="currentColor" /> {totalModules} модул{totalModules === 1 ? 'ь' : 'я'}</span>
                <span className="font-geist text-sm flex items-center gap-1.5" style={{ color: TEXT_MUTED }}><CapIcon size={16} color="currentColor" /> {totalTests} тест{totalTests !== 1 ? 'а' : ''}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left */}
          <div className="lg:col-span-2 space-y-6">
            {course.description && (
              <Panel title="О курсе">
                <p className="font-geist text-sm leading-relaxed" style={{ color: 'rgba(197, 198, 199,0.75)' }}>{course.description}</p>
              </Panel>
            )}

            {course.modules?.length > 0 && (
              <Panel title="Программа курса">
                <div className="space-y-4">
                  {course.modules.map((mod: any, i: number) => (
                    <div key={mod.id}>
                      <div className="flex items-center gap-2.5 mb-2">
                        <span
                          className="w-6 h-6 rounded flex items-center justify-center font-geist font-bold flex-shrink-0"
                          style={{ fontSize: 12, background: color, color: PAGE_BG }}
                        >
                          {i + 1}
                        </span>
                        <span className="font-montserrat font-semibold text-sm" style={{ color: TEXT_PRIMARY }}>{mod.title}</span>
                      </div>
                      <ul className="ml-8 space-y-1">
                        {(mod.lessons || []).map((l: any) => (
                          <li key={l.id} className="font-geist text-xs flex items-center gap-2" style={{ color: TEXT_MUTED }}>
                            <Icon name="chevronRight" size={14} color={`${color}90`} />
                            {l.title}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </Panel>
            )}

            {/* Per-tester progress — lead/admin only (server omits
                progressByTester for everyone else). */}
            {course.progressByTester && (
              <Panel title="Прогресс команды">
                {course.progressByTester.length === 0 ? (
                  <p className="font-geist text-sm" style={{ color: TEXT_MUTED }}>В команде пока нет тестировщиков.</p>
                ) : (
                  <div className="space-y-2">
                    {course.progressByTester.map((t: any) => {
                      const pct = t.totalLessons > 0 ? Math.round((t.completedLessons / t.totalLessons) * 100) : 0;
                      const override = (course.deadlineOverrides || []).find((o: any) => o.user_id === t.id);
                      return (
                        <div key={t.id} className="flex items-center gap-3">
                          <span className="font-geist text-sm w-32 truncate shrink-0" style={{ color: TEXT_PRIMARY }}>{t.name}</span>
                          <div className="xp-bar-track flex-1">
                            <div className="xp-bar-fill" style={{ width: `${pct}%`, background: t.finished ? color : undefined }} />
                          </div>
                          <span className="font-geist text-xs w-20 text-right shrink-0" style={{ color: TEXT_MUTED }}>
                            {t.finished ? '✓ пройден' : `${t.completedLessons}/${t.totalLessons}`}
                          </span>
                          {deadlineEditFor === t.id ? (
                            <div className="flex items-center gap-1 shrink-0">
                              <input
                                type="date"
                                value={deadlineDraft}
                                onChange={e => setDeadlineDraft(e.target.value)}
                                className="pixel-input text-xs"
                                style={{ width: 130, padding: '2px 6px' }}
                              />
                              <button onClick={() => saveDeadlineOverride(t.id)} disabled={savingDeadline} className="text-xs font-geist cursor-pointer" style={{ color }}>✓</button>
                              <button onClick={() => setDeadlineEditFor(null)} className="text-xs font-geist cursor-pointer flex items-center" style={{ color: TEXT_MUTED }}><Icon name="close" size={14} color="currentColor" /></button>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setDeadlineEditFor(t.id); setDeadlineDraft(override?.deadline_at?.slice(0, 10) || course.deadline_at?.slice(0, 10) || ''); }}
                              className="text-xs font-geist cursor-pointer shrink-0 hover:underline flex items-center gap-1"
                              style={{ color: override ? '#EF9F27' : 'rgba(197, 198, 199,0.4)' }}
                              title="Продлить дедлайн для этого сотрудника"
                            >
                              <Icon name="clock" size={14} color="currentColor" />{override ? ` до ${override.deadline_at.slice(0, 10)}` : ''}
                            </button>
                          )}
                          {override && deadlineEditFor !== t.id && (
                            <button onClick={() => removeDeadlineOverride(t.id)} disabled={savingDeadline} className="text-xs font-geist cursor-pointer shrink-0 flex items-center" style={{ color: 'rgba(197, 198, 199,0.3)' }} title="Сбросить к дедлайну по умолчанию"><Icon name="undo" size={14} color="currentColor" /></button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Panel>
            )}
          </div>

          {/* Right */}
          <div className="space-y-4">
            {course.requirements && (
              <Panel title="Требования" pad="p-5">
                <p className="font-geist text-xs leading-relaxed" style={{ color: TEXT_MUTED }}>{course.requirements}</p>
              </Panel>
            )}

            {course.modules?.length > 0 && (
              <Panel title="Содержание" pad="p-5">
                <div className="space-y-3">
                  {course.modules.map((mod: any, i: number) => (
                    <div key={mod.id}>
                      <p className="font-geist font-semibold text-xs" style={{ color }}>МОДУЛЬ {i + 1}: {mod.title}</p>
                      <p className="font-geist text-xs mt-0.5" style={{ color: TEXT_MUTED }}>{(mod.lessons || []).length} элемент{(mod.lessons || []).length === 1 ? '' : 'ов'}</p>
                    </div>
                  ))}
                </div>
              </Panel>
            )}

            {/* CTA — tester */}
            {user.role === 'tester' && course.is_published && (
              <button
                onClick={() => navigate(`/custom-course/${id}/learn`)}
                className="w-full py-3 rounded-lg font-geist font-bold text-sm transition-all hover:-translate-y-0.5 cursor-pointer flex items-center justify-center gap-2"
                style={{ background: color, color: PAGE_BG }}
              >
                {hasProgress ? 'Продолжить курс' : 'Начать курс'} <span aria-hidden="true">🧪</span>
              </button>
            )}

            {/* Author's own view of their pending proposal — read-only,
                no lead controls below since only a lead reviews it. */}
            {user.role !== 'lead' && course.created_by === user.id && course.proposal_status === 'pending' && (
              <div className="rounded-lg p-4" style={{ background: 'rgba(239,159,39,0.06)', border: '1px solid rgba(239,159,39,0.25)' }}>
                <p className="font-geist text-sm flex items-center gap-2" style={{ color: '#EF9F27' }}>
                  <Icon name="clock" size={16} color="#EF9F27" /> Ждёт рассмотрения лидом
                </p>
                <p className="font-geist text-xs mt-1.5" style={{ color: TEXT_MUTED }}>
                  Как только курс одобрят, он появится в общем каталоге для всей команды.
                </p>
              </div>
            )}

            {/* Lead controls */}
            {user.role === 'lead' && (
              <div className="space-y-2">
                {actionError && (
                  <p className="text-xs font-geist mb-1" style={{ color: '#e05252' }}>{actionError}</p>
                )}
                {course.proposal_status === 'pending' && (
                  <p className="font-geist text-xs mb-1" style={{ color: TEXT_MUTED }}>
                    Предложил(а): <span style={{ color: TEXT_PRIMARY }}>{course.author_name}</span>
                  </p>
                )}
                <button
                  onClick={() => navigate(`/custom-course/${id}/learn`)}
                  className="w-full py-2.5 rounded-lg font-geist font-semibold text-sm transition-all cursor-pointer flex items-center justify-center gap-2"
                  style={{ background: `${color}18`, color }}
                >
                  <SearchIcon size={14} color="currentColor" /> Предпросмотр
                </button>
                <button
                  onClick={() => navigate(`/lead/course-builder/${id}`)}
                  className="w-full py-2.5 rounded-lg font-geist font-semibold text-sm transition-all cursor-pointer flex items-center justify-center gap-2"
                  style={{ background: 'rgba(197, 198, 199,0.07)', color: 'rgba(197, 198, 199,0.7)' }}
                >
                  <PencilLineIcon size={14} color="currentColor" /> Редактировать
                </button>
                {course.proposal_status === 'pending' ? (
                  <>
                    <button
                      onClick={togglePublish}
                      disabled={publishing}
                      className="w-full py-2.5 rounded-lg font-geist font-semibold text-sm transition-all cursor-pointer"
                      style={{ background: 'rgba(102, 252, 241,0.1)', color: ACCENT }}
                    >
                      {publishing ? '...' : 'Одобрить и опубликовать'}
                    </button>
                    <button
                      onClick={handleDelete}
                      disabled={deleting}
                      className="w-full py-2 rounded-lg font-geist text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
                      style={{ background: 'transparent', color: 'rgba(224,82,82,0.5)' }}
                    >
                      <TrashLineIcon size={12} color="currentColor" /> {deleting ? 'Отклоняю...' : 'Отклонить предложение'}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={togglePublish}
                      disabled={publishing}
                      className="w-full py-2.5 rounded-lg font-geist font-semibold text-sm transition-all cursor-pointer"
                      style={{
                        background: course.is_published ? 'rgba(224,82,82,0.1)' : 'rgba(102, 252, 241,0.1)',
                        color: course.is_published ? '#e05252' : ACCENT,
                      }}
                    >
                      {publishing ? '...' : course.is_published ? 'Снять с публикации' : 'Опубликовать'}
                    </button>
                    <button
                      onClick={handleDelete}
                      disabled={deleting}
                      className="w-full py-2 rounded-lg font-geist text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
                      style={{ background: 'transparent', color: 'rgba(224,82,82,0.5)' }}
                    >
                      <TrashLineIcon size={12} color="currentColor" /> {deleting ? 'Удаляю...' : 'Удалить курс'}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
