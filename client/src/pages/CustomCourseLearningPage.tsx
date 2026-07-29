import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navigation from '../components/Navigation';
import SnailLoader from '../components/SnailLoader';
import PixelIcon from '../components/PixelIcon';
import { API_BASE_URL as API } from '../config';
import { authFetch } from '../auth';
import { useEscapeKey } from '../utils/a11y';

interface Props {
  user: any;
  onLogout: () => void;
}

interface Note {
  id: string;
  lessonTitle: string;
  text: string;
  createdAt: string;
}

// ─── Lesson content renderer ──────────────────────────────────────────────────

function LessonContent({ content }: { content: string }) {
  if (!content?.trim()) {
    return (
      <div className="flex flex-col items-center py-16 text-center">
        <PixelIcon name="construction" size={48} color="#EF9F27" className="mb-4" />
        <p className="font-sans text-sm" style={{ color: 'rgba(232,232,208,0.6)' }}>Материал этого урока ещё готовится</p>
      </div>
    );
  }
  // Split by blank lines into paragraphs
  const paragraphs = content.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
  return (
    <div>
      {paragraphs.map((para, i) => {
        if (para.startsWith('## ')) {
          return (
            <h3 key={i} className="font-sans font-bold text-base mt-7 mb-3" style={{ color: '#e8e8d0' }}>
              {para.slice(3)}
            </h3>
          );
        }
        if (para.startsWith('# ')) {
          return (
            <h2 key={i} className="font-sans font-bold text-lg mt-8 mb-3" style={{ color: '#e8e8d0' }}>
              {para.slice(2)}
            </h2>
          );
        }
        if (para.startsWith('```') && para.endsWith('```')) {
          const lines = para.split('\n');
          const code = lines.slice(1, -1).join('\n');
          return (
            <pre
              key={i}
              className="rounded p-4 mb-4 overflow-x-auto text-xs leading-relaxed font-mono"
              style={{ background: '#0f0f1a', color: '#1D9E75', border: '1px solid rgba(29,158,117,0.2)' }}
            >
              <code>{code}</code>
            </pre>
          );
        }
        if (para.startsWith('> ')) {
          return (
            <div key={i} className="rounded p-4 mb-4 flex gap-3" style={{ background: 'rgba(29,158,117,0.08)', border: '1px solid rgba(29,158,117,0.25)' }}>
              <PixelIcon name="lightbulb" size={16} color="#1D9E75" style={{ flexShrink: 0 }} />
              <p className="font-sans text-sm leading-relaxed" style={{ color: 'rgba(232,232,208,0.75)' }}>{para.slice(2)}</p>
            </div>
          );
        }
        if (para.startsWith('! ')) {
          return (
            <div key={i} className="rounded p-4 mb-4 flex gap-3" style={{ background: 'rgba(239,159,39,0.08)', border: '1px solid rgba(239,159,39,0.3)' }}>
              <PixelIcon name="warning" size={16} color="#EF9F27" style={{ flexShrink: 0 }} />
              <p className="font-sans text-sm leading-relaxed" style={{ color: 'rgba(232,232,208,0.75)' }}>{para.slice(2)}</p>
            </div>
          );
        }
        if (para.includes('\n') && para.split('\n').every(line => line.startsWith('- '))) {
          const items = para.split('\n').map(l => l.slice(2));
          return (
            <ul key={i} className="mb-4 space-y-2 ml-1">
              {items.map((item, j) => (
                <li key={j} className="flex gap-2 font-sans text-sm" style={{ color: 'rgba(232,232,208,0.7)' }}>
                  <span className="flex-shrink-0 mt-0.5" style={{ color: '#1D9E75' }}>▸</span>
                  <span className="leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="font-sans text-sm leading-relaxed mb-4" style={{ color: 'rgba(232,232,208,0.75)' }}>
            {para}
          </p>
        );
      })}
    </div>
  );
}

// ─── Quiz view ────────────────────────────────────────────────────────────────

interface QuizState {
  answers: Record<number, number>;
  submitted: boolean;
  score: number;
}

function CustomQuizView({
  lesson,
  quizState,
  onAnswer,
  onSubmit,
  onNext,
  isLastLesson,
  color,
}: {
  lesson: any;
  quizState: QuizState;
  onAnswer: (qi: number, oi: number) => void;
  onSubmit: () => void;
  onNext: () => void;
  isLastLesson: boolean;
  color: string;
}) {
  const questions = lesson.questions || [];

  if (questions.length === 0) {
    return (
      <div className="flex flex-col items-center py-16">
        <PixelIcon name="construction" size={48} color="#EF9F27" className="mb-4" />
        <p className="font-sans text-pixel/60 text-sm">Вопросы для теста ещё готовятся</p>
        <button onClick={onNext} className="mt-6 px-6 py-2 rounded font-sans font-bold text-sm" style={{ background: color, color: '#0f0f1a' }}>
          {isLastLesson ? '🏁 Завершить' : 'Далее →'}
        </button>
      </div>
    );
  }

  const allAnswered = questions.every((_: any, qi: number) => quizState.answers[qi] !== undefined);
  const { submitted, score } = quizState;

  return (
    <div>
      {submitted && (
        <div
          className="rounded-lg p-5 mb-8 flex items-center gap-4"
          style={{
            background: score >= 60 ? 'rgba(29,158,117,0.1)' : 'rgba(224,82,82,0.1)',
            border: `1px solid ${score >= 60 ? 'rgba(29,158,117,0.3)' : 'rgba(224,82,82,0.3)'}`,
          }}
        >
          <span className="text-3xl">{score >= 60 ? '🎉' : '😅'}</span>
          <div>
            <p className="font-sans font-bold text-base mb-1" style={{ color: score >= 60 ? '#1D9E75' : '#e05252' }}>
              {score >= 80 ? 'Отлично!' : score >= 60 ? 'Пройдено!' : 'Попробуй ещё раз'}
            </p>
            <p className="font-sans text-sm" style={{ color: 'rgba(232,232,208,0.6)' }}>
              {Math.round((score / 100) * questions.length)} из {questions.length} ({score}%)
            </p>
          </div>
        </div>
      )}

      <div className="space-y-8">
        {questions.map((q: any, qi: number) => {
          const opts = [q.option_a, q.option_b, q.option_c, q.option_d].filter(Boolean);
          const chosen = quizState.answers[qi];

          return (
            <div key={q.id ?? qi}>
              <p className="font-sans font-semibold text-sm mb-4" style={{ color: '#e8e8d0' }}>
                <span style={{ color }} className="mr-2">{qi + 1}.</span>
                {q.question_text}
              </p>
              <div className="space-y-2">
                {opts.map((opt: string, oi: number) => {
                  const isChosen = chosen === oi;
                  const isCorrectOpt = submitted && oi === q.correct_idx;
                  const isWrongChosen = submitted && isChosen && oi !== q.correct_idx;

                  let bg = 'rgba(232,232,208,0.04)';
                  let border = 'rgba(232,232,208,0.1)';
                  let textColor = 'rgba(232,232,208,0.65)';

                  if (!submitted && isChosen) { bg = `${color}18`; border = `${color}60`; textColor = '#e8e8d0'; }
                  if (submitted && isCorrectOpt) { bg = 'rgba(29,158,117,0.12)'; border = 'rgba(29,158,117,0.5)'; textColor = '#e8e8d0'; }
                  if (submitted && isWrongChosen) { bg = 'rgba(224,82,82,0.1)'; border = 'rgba(224,82,82,0.4)'; textColor = 'rgba(232,232,208,0.6)'; }

                  return (
                    <button
                      key={oi}
                      onClick={() => !submitted && onAnswer(qi, oi)}
                      disabled={submitted}
                      className="w-full text-left px-4 py-3 rounded font-sans text-sm flex items-center gap-3 transition-all"
                      style={{ background: bg, border: `1px solid ${border}`, color: textColor, cursor: submitted ? 'default' : 'pointer' }}
                    >
                      <span className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold border" style={{ borderColor: border, color: submitted && isCorrectOpt ? '#1D9E75' : submitted && isWrongChosen ? '#e05252' : textColor }}>
                        {submitted && isCorrectOpt ? '✓' : submitted && isWrongChosen ? '✗' : String.fromCharCode(65 + oi)}
                      </span>
                      {opt}
                    </button>
                  );
                })}
              </div>
              {submitted && q.explanation && (
                <div className="mt-3 px-4 py-3 rounded text-xs font-sans leading-relaxed" style={{ background: 'rgba(232,232,208,0.04)', color: 'rgba(232,232,208,0.55)', border: '1px solid rgba(232,232,208,0.06)' }}>
                  💬 {q.explanation}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-10 flex justify-end">
        {!submitted ? (
          <button onClick={onSubmit} disabled={!allAnswered} className="px-8 py-3 rounded font-sans font-bold text-sm transition-all" style={{ background: allAnswered ? color : 'rgba(232,232,208,0.1)', color: allAnswered ? '#0f0f1a' : 'rgba(232,232,208,0.3)', cursor: allAnswered ? 'pointer' : 'not-allowed' }}>
            Проверить ответы →
          </button>
        ) : (
          <button onClick={onNext} className="px-8 py-3 rounded font-sans font-bold text-sm transition-all hover:-translate-y-0.5" style={{ background: color, color: '#0f0f1a', boxShadow: `0 4px 0 0 ${color}50` }}>
            {isLastLesson ? '🏁 Завершить курс' : 'Далее →'}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Notes drawer ─────────────────────────────────────────────────────────────

function NotesDrawer({ show, onClose, notes, setNotes, currentLessonTitle, userId, courseId }: {
  show: boolean; onClose: () => void; notes: Note[]; setNotes: (n: Note[]) => void;
  currentLessonTitle: string; userId: number; courseId: string;
}) {
  const [text, setText] = useState('');
  const key = `custom_course_notes_${userId}_${courseId}`;

  useEscapeKey(() => { if (show) onClose(); });

  const save = () => {
    if (!text.trim()) return;
    const note: Note = { id: Date.now().toString(), lessonTitle: currentLessonTitle, text: text.trim(), createdAt: new Date().toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) };
    const updated = [...notes, note];
    setNotes(updated);
    localStorage.setItem(key, JSON.stringify(updated));
    setText('');
  };

  const del = (nid: string) => {
    const updated = notes.filter(n => n.id !== nid);
    setNotes(updated);
    localStorage.setItem(key, JSON.stringify(updated));
  };

  return (
    <>
      {show && <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onClose} />}
      <div className="fixed top-0 right-0 h-full z-50 flex flex-col transition-transform duration-300" style={{ width: '320px', background: '#1a1a2e', borderLeft: '2px solid rgba(232,232,208,0.08)', transform: show ? 'translateX(0)' : 'translateX(100%)' }}>
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: '1px solid rgba(232,232,208,0.08)' }}>
          <span className="font-pixel text-pixel flex items-center gap-1.5" style={{ fontSize: '0.6rem', lineHeight: 2 }}><PixelIcon name="memo" size={11} color="currentColor" />Заметки</span>
          <button onClick={onClose} aria-label="Закрыть заметки" className="text-pixel/60 hover:text-pixel text-lg leading-none">×</button>
        </div>
        <div className="px-4 py-4 flex-shrink-0" style={{ borderBottom: '1px solid rgba(232,232,208,0.06)' }}>
          <p className="text-pixel/60 font-sans text-xs mb-2 truncate">Урок: {currentLessonTitle}</p>
          <textarea value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) save(); }} placeholder="Заметка... (Ctrl+Enter)" rows={4} className="w-full rounded px-3 py-2 font-sans text-xs resize-none outline-none" style={{ background: '#0f0f1a', color: '#e8e8d0', border: '1px solid rgba(232,232,208,0.1)' }} />
          <button onClick={save} disabled={!text.trim()} className="mt-2 w-full py-2 rounded font-sans text-xs font-semibold" style={{ background: text.trim() ? '#1D9E75' : 'rgba(232,232,208,0.06)', color: text.trim() ? '#0f0f1a' : 'rgba(232,232,208,0.3)', cursor: text.trim() ? 'pointer' : 'not-allowed' }}>
            Сохранить
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {notes.length === 0 ? (
            <p className="text-pixel/55 font-sans text-xs text-center py-8">Заметок пока нет</p>
          ) : (
            <div className="space-y-3">
              {[...notes].reverse().map(n => (
                <div key={n.id} className="rounded p-3 group relative" style={{ background: 'rgba(232,232,208,0.04)', border: '1px solid rgba(232,232,208,0.07)' }}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-sans text-xs font-semibold truncate pr-4" style={{ color: '#1D9E75', maxWidth: '180px' }}>{n.lessonTitle}</span>
                    <span className="text-pixel/55 font-sans text-xs flex-shrink-0">{n.createdAt}</span>
                  </div>
                  <p className="font-sans text-xs leading-relaxed" style={{ color: 'rgba(232,232,208,0.65)' }}>{n.text}</p>
                  <button onClick={() => del(n.id)} aria-label="Удалить заметку" className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity text-pixel/55 hover:text-red-400 text-xs">×</button>
                </div>
              ))}
            </div>
          )}
        </div>
        {notes.length > 0 && (
          <div className="px-4 py-3 flex-shrink-0" style={{ borderTop: '1px solid rgba(232,232,208,0.06)' }}>
            <button onClick={() => navigator.clipboard.writeText(notes.map(n => `[${n.lessonTitle}]\n${n.text}`).join('\n\n---\n\n'))} className="w-full py-2 rounded font-sans text-xs" style={{ background: 'rgba(232,232,208,0.06)', color: 'rgba(232,232,208,0.6)' }}>
              <span className="flex items-center justify-center gap-1.5"><PixelIcon name="clipboard" size={12} color="currentColor" />Скопировать все</span>
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function CustomCourseLearningPage({ user, onLogout }: Props) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [course, setCourse] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authFetch(`${API}/custom-courses/${id}`)
      .then(r => r.json())
      .then(data => { if (!data.error) setCourse(data); })
      .finally(() => setLoading(false));
  }, [id]);

  const allLessons: any[] = useMemo(() => {
    if (!course) return [];
    return (course.modules || []).flatMap((m: any) => m.lessons || []);
  }, [course]);

  // Completion is now tracked server-side (custom_lesson_progress) — the
  // course payload already includes `completed`/`locked` per lesson,
  // computed for the current user. This Set is just a local mirror we
  // update optimistically after a successful complete-call, seeded from
  // whatever the server said was already completed.
  const [completedLessons, setCompletedLessons] = useState<Set<number>>(new Set());
  const [completeError, setCompleteError] = useState(false);

  useEffect(() => {
    if (!course) return;
    const lessons = (course.modules || []).flatMap((m: any) => m.lessons || []);
    setCompletedLessons(new Set(lessons.filter((l: any) => l.completed).map((l: any) => l.id)));
  }, [course]);

  const [currentIdx, setCurrentIdx] = useState(0);
  const [showCompleted, setShowCompleted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState<Note[]>(() => {
    try { const s = localStorage.getItem(`custom_course_notes_${user.id}_${id}`); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const [quizStates, setQuizStates] = useState<Record<number, any>>({});
  const [expandedModules, setExpandedModules] = useState<Set<number>>(new Set());

  const startTimeRef = useRef(Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setElapsedSeconds(Math.round((Date.now() - startTimeRef.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  // Initialise starting lesson and expanded modules using server-reported completion
  useEffect(() => {
    if (!course) return;
    const allMods = (course.modules || []) as any[];
    setExpandedModules(new Set(allMods.map((_: any, i: number) => i)));

    const lessons = allMods.flatMap((m: any) => m.lessons || []);
    for (let i = 0; i < lessons.length; i++) {
      if (!lessons[i].completed) { setCurrentIdx(i); return; }
    }
    setCurrentIdx(Math.max(0, lessons.length - 1));
  }, [course]);

  // NOTE: this hook must stay above the loading/!course early returns below —
  // hooks can't be called conditionally, and those returns skip everything
  // after them on the first (loading) render but not on later renders, which
  // previously crashed the component with "Rendered more hooks than during
  // the previous render."
  const markComplete = useCallback(async (lessonId: number) => {
    setCompleteError(false);
    try {
      const res = await authFetch(`${API}/custom-lessons/${lessonId}/complete`, { method: 'POST' });
      if (!res.ok) { setCompleteError(true); return; }
    } catch {
      setCompleteError(true);
      return;
    }
    const next = new Set(completedLessons);
    next.add(lessonId);
    setCompletedLessons(next);
    if (currentIdx === allLessons.length - 1) {
      const totalSeconds = Math.round((Date.now() - startTimeRef.current) / 1000);
      authFetch(`${API}/courses/time-track`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ course_id: parseInt(id || '0'), seconds_spent: totalSeconds }) }).catch(() => {});
      setShowCompleted(true);
    } else {
      setCurrentIdx(i => i + 1);
    }
  }, [completedLessons, allLessons, currentIdx, id]);

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
        <div className="flex items-center justify-center h-64">
          <p className="font-sans text-pixel/60 text-sm">Курс не найден</p>
        </div>
      </div>
    );
  }

  const color = course.color || '#1D9E75';
  const currentLesson = allLessons[currentIdx];
  const isLastLesson = currentIdx === allLessons.length - 1;
  const totalLessons = allLessons.length;
  const completedCount = completedLessons.size;
  const progressPercent = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;
  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  // Mirrors the server's lock computation (see GET /api/custom-courses/:id)
  // but reactive to completedLessons as the user progresses within this
  // session, instead of only reflecting the state at initial page load.
  const isAccessible = (idx: number) => {
    const lesson = allLessons[idx];
    if (!lesson) return false;
    if (lesson.prerequisite_type !== 'mandatory' || lesson.prerequisite_lesson_id == null) return true;
    return completedLessons.has(lesson.prerequisite_lesson_id);
  };

  // Find module index for current lesson
  let lessonGlobalIdx = 0;
  const currentModuleIdx = (() => {
    let gi = 0;
    for (let mi = 0; mi < (course.modules || []).length; mi++) {
      const mod = course.modules[mi];
      for (let li = 0; li < (mod.lessons || []).length; li++) {
        if (gi === currentIdx) return mi;
        gi++;
      }
    }
    return 0;
  })();

  return (
    <div className="h-screen flex flex-col" style={{ background: '#0f0f1a' }}>
      <Navigation user={user} onLogout={onLogout} />

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 flex-shrink-0 flex flex-col overflow-hidden" style={{ background: '#141424', borderRight: '1px solid rgba(232,232,208,0.06)' }}>
          <div className="px-4 py-4 flex-shrink-0" style={{ borderBottom: '1px solid rgba(232,232,208,0.06)' }}>
            <p className="font-pixel text-pixel mb-1 truncate" style={{ fontSize: '0.55rem', lineHeight: 2 }}>{course.title}</p>
            <div className="flex items-center gap-2 mb-2">
              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(232,232,208,0.08)' }}>
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progressPercent}%`, background: color }} />
              </div>
              <span className="text-pixel/60 font-sans text-xs">{progressPercent}%</span>
            </div>
            <p className="text-pixel/55 font-sans text-xs">{completedCount}/{totalLessons} пройдено</p>
          </div>

          <div className="flex-1 overflow-y-auto py-2">
            {(course.modules || []).map((mod: any, mi: number) => {
              const modLessons = mod.lessons || [];
              const isExpanded = expandedModules.has(mi);
              const isCurMod = mi === currentModuleIdx;

              // Global start idx for this module
              let modStartIdx = 0;
              for (let i = 0; i < mi; i++) modStartIdx += (course.modules[i].lessons || []).length;

              return (
                <div key={mod.id ?? mi} className="mb-1">
                  <button
                    onClick={() => setExpandedModules(s => { const n = new Set(s); n.has(mi) ? n.delete(mi) : n.add(mi); return n; })}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-left"
                    style={{ background: isCurMod ? 'rgba(232,232,208,0.05)' : 'transparent' }}
                  >
                    <span className="text-xs flex-shrink-0" style={{ color: 'rgba(232,232,208,0.55)', transform: isExpanded ? 'rotate(90deg)' : 'none', display: 'inline-block', transition: 'transform 0.15s' }}>›</span>
                    <span className="flex-1 font-sans text-xs font-semibold leading-snug" style={{ color: 'rgba(232,232,208,0.6)' }}>{mod.title || `Модуль ${mi + 1}`}</span>
                    <span className="font-sans text-xs" style={{ color: 'rgba(232,232,208,0.55)' }}>
                      {modLessons.filter((_: any, li: number) => completedLessons.has(modLessons[li]?.id)).length}/{modLessons.length}
                    </span>
                  </button>

                  {isExpanded && modLessons.map((lesson: any, li: number) => {
                    const gi = modStartIdx + li;
                    const accessible = isAccessible(gi);
                    const completed = completedLessons.has(lesson.id);
                    const isCur = gi === currentIdx;

                    return (
                      <button
                        key={lesson.id ?? li}
                        onClick={() => accessible && setCurrentIdx(gi)}
                        disabled={!accessible}
                        className="w-full flex items-center gap-2.5 pl-8 pr-4 py-2 text-left transition-all"
                        style={{ background: isCur ? `${color}15` : 'transparent', borderLeft: isCur ? `2px solid ${color}` : '2px solid transparent', cursor: accessible ? 'pointer' : 'not-allowed', opacity: !accessible ? 0.4 : 1 }}
                      >
                        <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center text-xs">
                          {completed ? <span style={{ color: '#1D9E75' }}>✓</span> : isCur ? <span style={{ color }}>▸</span> : !accessible ? <PixelIcon name="lock" size={12} color="rgba(232,232,208,0.2)" /> : <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'rgba(232,232,208,0.2)' }} />}
                        </span>
                        <span className="font-sans text-xs leading-snug flex-1" style={{ color: isCur ? '#e8e8d0' : 'rgba(232,232,208,0.5)' }}>
                          {lesson.type === 'quiz'
                            ? <span className="flex items-center gap-1"><PixelIcon name="memo" size={10} color="currentColor" />{lesson.title}</span>
                            : lesson.title}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>

          <div className="px-4 py-3 flex-shrink-0 space-y-2" style={{ borderTop: '1px solid rgba(232,232,208,0.06)' }}>
            <button onClick={() => setShowNotes(true)} className="w-full py-2 rounded font-sans text-xs flex items-center justify-center gap-2" style={{ background: 'rgba(232,232,208,0.06)', color: 'rgba(232,232,208,0.6)' }}>
              <PixelIcon name="memo" size={13} color="currentColor" /> Заметки {notes.length > 0 && <span className="text-xs rounded-full w-4 h-4 flex items-center justify-center" style={{ background: color, color: '#0f0f1a', fontSize: '0.6rem' }}>{notes.length}</span>}
            </button>
            <button onClick={() => navigate(`/custom-course/${id}`)} className="w-full py-2 rounded font-sans text-xs" style={{ color: 'rgba(232,232,208,0.55)' }}>← К описанию</button>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          {showCompleted ? (
            <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
              <div className="mb-6"><PixelIcon name="trophy" size={64} color="#EF9F27" /></div>
              <h2 className="font-pixel text-pixel mb-3" style={{ fontSize: '0.75rem', lineHeight: 1.8 }}>Курс завершён!</h2>
              <p className="font-sans text-sm mb-10" style={{ color: 'rgba(232,232,208,0.6)' }}>{course.title}</p>
              <button onClick={() => navigate('/zhukademia')} className="px-8 py-3 rounded font-sans font-bold text-sm hover:-translate-y-0.5 transition-all" style={{ background: color, color: '#0f0f1a', boxShadow: `0 4px 0 0 ${color}50` }}>← Вернуться к курсам</button>
            </div>
          ) : currentLesson ? (
            <div className="max-w-3xl mx-auto px-8 py-8">
              {/* Breadcrumb */}
              <p className="font-sans text-xs mb-6" style={{ color: 'rgba(232,232,208,0.55)' }}>
                {(course.modules || [])[currentModuleIdx]?.title || ''}
                {' › '}
                <span style={{ color: 'rgba(232,232,208,0.6)' }}>{currentLesson.title}</span>
              </p>

              <h1 className="font-pixel text-pixel mb-8" style={{ fontSize: '0.7rem', lineHeight: 1.9 }}>{currentLesson.title}</h1>

              {currentLesson.prerequisite_type === 'optional' && currentLesson.prerequisite_note && (
                <div
                  className="rounded p-3 mb-6 flex items-start gap-2"
                  style={{ background: 'rgba(239,159,39,0.06)', border: '1px solid rgba(239,159,39,0.25)' }}
                >
                  <PixelIcon name="lightbulb" size={14} color="#EF9F27" />
                  <p className="font-sans text-xs" style={{ color: 'rgba(232,232,208,0.7)' }}>{currentLesson.prerequisite_note}</p>
                </div>
              )}

              {currentLesson.type === 'lesson' ? (
                <>
                  <LessonContent content={currentLesson.content} />

                  {completeError && (
                    <p className="font-sans text-xs mt-4" style={{ color: '#e05252' }}>
                      Не удалось сохранить прогресс. Проверь соединение и попробуй ещё раз.
                    </p>
                  )}

                  <div className="flex items-center justify-between mt-10 pt-6" style={{ borderTop: '1px solid rgba(232,232,208,0.07)' }}>
                    {currentIdx > 0 ? (
                      <button onClick={() => isAccessible(currentIdx - 1) && setCurrentIdx(i => i - 1)} className="font-sans text-sm transition-colors" style={{ color: 'rgba(232,232,208,0.6)' }} onMouseEnter={e => (e.currentTarget.style.color = '#e8e8d0')} onMouseLeave={e => (e.currentTarget.style.color = 'rgba(232,232,208,0.35)')}>← Назад</button>
                    ) : <div />}
                    <button
                      onClick={() => markComplete(currentLesson.id)}
                      className="px-8 py-3 rounded font-sans font-bold text-sm transition-all hover:-translate-y-0.5"
                      style={{ background: color, color: '#0f0f1a', boxShadow: `0 4px 0 0 ${color}50` }}
                    >
                      {allLessons[currentIdx + 1]?.type === 'quiz'
                        ? <span className="flex items-center gap-2"><PixelIcon name="memo" size={13} color="currentColor" />Пройти тест →</span>
                        : isLastLesson
                        ? <span className="flex items-center gap-2"><PixelIcon name="check" size={13} color="currentColor" />Завершить курс</span>
                        : 'Далее →'}
                    </button>
                  </div>
                </>
              ) : (
                <CustomQuizView
                  lesson={currentLesson}
                  quizState={quizStates[currentIdx] || { answers: {}, submitted: false, score: 0 }}
                  onAnswer={(qi, oi) => setQuizStates(prev => ({ ...prev, [currentIdx]: { ...(prev[currentIdx] || { answers: {}, submitted: false, score: 0 }), answers: { ...(prev[currentIdx]?.answers || {}), [qi]: oi } } }))}
                  onSubmit={() => {
                    const qs = currentLesson.questions || [];
                    const state = quizStates[currentIdx] || { answers: {}, submitted: false, score: 0 };
                    const correct = qs.filter((q: any, qi: number) => state.answers[qi] === q.correct_idx).length;
                    const score = qs.length ? Math.round((correct / qs.length) * 100) : 100;
                    setQuizStates(prev => ({ ...prev, [currentIdx]: { ...state, submitted: true, score } }));
                  }}
                  onNext={() => markComplete(currentLesson.id)}
                  isLastLesson={isLastLesson}
                  color={color}
                />
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="font-sans text-pixel/60 text-sm">Выбери урок слева</p>
            </div>
          )}
        </main>

        {/* Lead timer */}
        {user.role === 'lead' && (
          <div className="w-40 flex-shrink-0 flex flex-col items-center justify-start pt-8 px-4" style={{ borderLeft: '1px solid rgba(232,232,208,0.06)' }}>
            <p className="font-pixel text-pixel/60 mb-2" style={{ fontSize: '0.5rem', lineHeight: 2 }}>Таймер</p>
            <p className="font-sans text-2xl font-bold tabular-nums" style={{ color }}>{formatTime(elapsedSeconds)}</p>
            <p className="text-pixel/55 font-sans text-xs mt-1">мин:сек</p>
            <p className="text-pixel/55 font-sans text-xs mt-4 text-center leading-relaxed">Видно только лиду</p>
          </div>
        )}
      </div>

      <NotesDrawer show={showNotes} onClose={() => setShowNotes(false)} notes={notes} setNotes={setNotes} currentLessonTitle={currentLesson?.title || ''} userId={user.id} courseId={id || ''} />

      {!showNotes && (
        <button onClick={() => setShowNotes(true)} className="fixed bottom-6 right-6 z-30 flex items-center gap-2 px-4 py-2.5 rounded-full font-sans text-sm font-semibold shadow-lg transition-all hover:-translate-y-0.5" style={{ background: '#1a1a2e', border: '1px solid rgba(232,232,208,0.12)', color: 'rgba(232,232,208,0.6)', boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>
          <PixelIcon name="memo" size={14} color="currentColor" /> <span className="text-xs">Заметки</span>
          {notes.length > 0 && <span className="rounded-full w-4 h-4 flex items-center justify-center text-xs" style={{ background: color, color: '#0f0f1a', fontSize: '0.6rem' }}>{notes.length}</span>}
        </button>
      )}
    </div>
  );
}
