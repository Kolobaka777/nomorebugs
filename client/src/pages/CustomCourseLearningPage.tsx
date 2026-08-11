import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navigation from '../components/Navigation';
import SnailLoader from '../components/SnailLoader';
import Icon from '../components/Icon';
import { LockIcon, CheckCircleIcon, PagesIcon } from '../components/CatalogIcons';
import { API_BASE_URL as API } from '../config';
import { authFetch } from '../auth';
import { useEscapeKey } from '../utils/a11y';
import { PAGE_GRADIENT, PAGE_BG, CARD_BG, TEXT_PRIMARY, TEXT_MUTED, ACCENT, TRACK_WIDE } from '../utils/theme';

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
        <Icon name="construction" size={48} color="#EF9F27" className="mb-4" />
        <p className="font-sans text-sm" style={{ color: 'rgba(197, 198, 199,0.6)' }}>Материал этого урока ещё готовится</p>
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
            <h3 key={i} className="font-sans font-bold text-base mt-7 mb-3" style={{ color: '#C5C6C7' }}>
              {para.slice(3)}
            </h3>
          );
        }
        if (para.startsWith('# ')) {
          return (
            <h2 key={i} className="font-sans font-bold text-lg mt-8 mb-3" style={{ color: '#C5C6C7' }}>
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
              style={{ background: PAGE_BG, color: ACCENT, border: '1px solid rgba(102, 252, 241,0.2)' }}
            >
              <code>{code}</code>
            </pre>
          );
        }
        if (para.startsWith('> ')) {
          return (
            <div key={i} className="rounded p-4 mb-4 flex gap-3" style={{ background: 'rgba(102, 252, 241,0.08)', border: '1px solid rgba(102, 252, 241,0.25)' }}>
              <Icon name="lightbulb" size={22} color="#66FCF1" style={{ flexShrink: 0 }} />
              <p className="font-sans text-sm leading-relaxed" style={{ color: 'rgba(197, 198, 199,0.75)' }}>{para.slice(2)}</p>
            </div>
          );
        }
        if (para.startsWith('! ')) {
          return (
            <div key={i} className="rounded p-4 mb-4 flex gap-3" style={{ background: 'rgba(239,159,39,0.08)', border: '1px solid rgba(239,159,39,0.3)' }}>
              <Icon name="warning" size={22} color="#EF9F27" style={{ flexShrink: 0 }} />
              <p className="font-sans text-sm leading-relaxed" style={{ color: 'rgba(197, 198, 199,0.75)' }}>{para.slice(2)}</p>
            </div>
          );
        }
        if (para.includes('\n') && para.split('\n').every(line => line.startsWith('- '))) {
          const items = para.split('\n').map(l => l.slice(2));
          return (
            <ul key={i} className="mb-4 space-y-2 ml-1">
              {items.map((item, j) => (
                <li key={j} className="flex gap-2 font-sans text-sm" style={{ color: 'rgba(197, 198, 199,0.7)' }}>
                  <span className="flex-shrink-0 mt-0.5" style={{ color: '#66FCF1' }}>▸</span>
                  <span className="leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="font-sans text-sm leading-relaxed mb-4" style={{ color: 'rgba(197, 198, 199,0.75)' }}>
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
        <Icon name="construction" size={48} color="#EF9F27" className="mb-4" />
        <p className="font-sans text-pixel/60 text-sm">Вопросы для теста ещё готовятся</p>
        <button onClick={onNext} className="mt-6 px-6 py-2 rounded font-sans font-bold text-sm" style={{ background: color, color: '#0B0C10' }}>
          {isLastLesson ? '🏁 Завершить' : <>Далее <Icon name="arrowRight" size={22} color="currentColor" /></>}
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
            background: score >= 60 ? 'rgba(102, 252, 241,0.1)' : 'rgba(224,82,82,0.1)',
            border: `1px solid ${score >= 60 ? 'rgba(102, 252, 241,0.3)' : 'rgba(224,82,82,0.3)'}`,
          }}
        >
          <span className="text-3xl">{score >= 60 ? '🎉' : '😅'}</span>
          <div>
            <p className="font-sans font-bold text-base mb-1" style={{ color: score >= 60 ? '#66FCF1' : '#e05252' }}>
              {score >= 80 ? 'Отлично!' : score >= 60 ? 'Пройдено!' : 'Попробуй ещё раз'}
            </p>
            <p className="font-sans text-sm" style={{ color: 'rgba(197, 198, 199,0.6)' }}>
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
              <p className="font-sans font-semibold text-sm mb-4" style={{ color: '#C5C6C7' }}>
                <span style={{ color }} className="mr-2">{qi + 1}.</span>
                {q.question_text}
              </p>
              <div className="space-y-2">
                {opts.map((opt: string, oi: number) => {
                  const isChosen = chosen === oi;
                  const isCorrectOpt = submitted && oi === q.correct_idx;
                  const isWrongChosen = submitted && isChosen && oi !== q.correct_idx;

                  let bg = 'rgba(197, 198, 199,0.04)';
                  let border = 'rgba(197, 198, 199,0.1)';
                  let textColor = 'rgba(197, 198, 199,0.65)';

                  if (!submitted && isChosen) { bg = `${color}18`; border = `${color}60`; textColor = '#C5C6C7'; }
                  if (submitted && isCorrectOpt) { bg = 'rgba(102, 252, 241,0.12)'; border = 'rgba(102, 252, 241,0.5)'; textColor = '#C5C6C7'; }
                  if (submitted && isWrongChosen) { bg = 'rgba(224,82,82,0.1)'; border = 'rgba(224,82,82,0.4)'; textColor = 'rgba(197, 198, 199,0.6)'; }

                  return (
                    <button
                      key={oi}
                      onClick={() => !submitted && onAnswer(qi, oi)}
                      disabled={submitted}
                      className="w-full text-left px-4 py-3 rounded font-sans text-sm flex items-center gap-3 transition-all"
                      style={{ background: bg, border: `1px solid ${border}`, color: textColor, cursor: submitted ? 'default' : 'pointer' }}
                    >
                      <span className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold border" style={{ borderColor: border, color: submitted && isCorrectOpt ? '#66FCF1' : submitted && isWrongChosen ? '#e05252' : textColor }}>
                        {submitted && isCorrectOpt ? '✓' : submitted && isWrongChosen ? '✗' : String.fromCharCode(65 + oi)}
                      </span>
                      {opt}
                    </button>
                  );
                })}
              </div>
              {submitted && q.explanation && (
                <div className="mt-3 px-4 py-3 rounded text-xs font-sans leading-relaxed" style={{ background: 'rgba(197, 198, 199,0.04)', color: 'rgba(197, 198, 199,0.55)', border: '1px solid rgba(197, 198, 199,0.06)' }}>
                  💬 {q.explanation}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-10 flex justify-end">
        {!submitted ? (
          <button onClick={onSubmit} disabled={!allAnswered} className="px-8 py-3 rounded font-sans font-bold text-sm transition-all" style={{ background: allAnswered ? color : 'rgba(197, 198, 199,0.1)', color: allAnswered ? '#0B0C10' : 'rgba(197, 198, 199,0.3)', cursor: allAnswered ? 'pointer' : 'not-allowed' }}>
            Проверить ответы <Icon name="arrowRight" size={22} color="currentColor" />
          </button>
        ) : (
          <button onClick={onNext} className="px-8 py-3 rounded font-sans font-bold text-sm transition-all hover:-translate-y-0.5" style={{ background: color, color: '#0B0C10', boxShadow: `0 4px 0 0 ${color}50` }}>
            {isLastLesson ? '🏁 Завершить курс' : <>Далее <Icon name="arrowRight" size={22} color="currentColor" /></>}
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
      <div className="fixed top-0 right-0 h-full z-50 flex flex-col transition-transform duration-300" style={{ width: '320px', background: CARD_BG, borderLeft: '2px solid rgba(197, 198, 199,0.08)', transform: show ? 'translateX(0)' : 'translateX(100%)' }}>
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: '1px solid rgba(197, 198, 199,0.08)' }}>
          <span className="font-montserrat font-semibold flex items-center gap-2" style={{ fontSize: 14, color: TEXT_PRIMARY, letterSpacing: TRACK_WIDE }}><PagesIcon size={16} color={ACCENT} />Заметки</span>
          <button onClick={onClose} aria-label="Закрыть заметки" className="flex items-center cursor-pointer" style={{ color: TEXT_MUTED }}><Icon name="close" size={22} color="currentColor" /></button>
        </div>
        <div className="px-4 py-4 flex-shrink-0" style={{ borderBottom: '1px solid rgba(197, 198, 199,0.06)' }}>
          <p className="text-pixel/60 font-sans text-xs mb-2 truncate">Урок: {currentLessonTitle}</p>
          <textarea value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) save(); }} placeholder="Заметка... (Ctrl+Enter)" rows={4} className="w-full rounded-lg px-3 py-2 font-geist text-xs resize-none outline-none" style={{ background: PAGE_BG, color: TEXT_PRIMARY, border: '1px solid rgba(197, 198, 199,0.1)' }} />
          <button onClick={save} disabled={!text.trim()} className="mt-2 w-full py-2 rounded font-sans text-xs font-semibold" style={{ background: text.trim() ? '#66FCF1' : 'rgba(197, 198, 199,0.06)', color: text.trim() ? '#0B0C10' : 'rgba(197, 198, 199,0.3)', cursor: text.trim() ? 'pointer' : 'not-allowed' }}>
            Сохранить
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {notes.length === 0 ? (
            <p className="text-pixel/55 font-sans text-xs text-center py-8">Заметок пока нет</p>
          ) : (
            <div className="space-y-3">
              {[...notes].reverse().map(n => (
                <div key={n.id} className="rounded-lg p-3 group relative" style={{ background: 'rgba(197, 198, 199,0.04)', border: '1px solid rgba(197, 198, 199,0.07)' }}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-sans text-xs font-semibold truncate pr-4" style={{ color: '#66FCF1', maxWidth: '180px' }}>{n.lessonTitle}</span>
                    <span className="text-pixel/55 font-sans text-xs flex-shrink-0">{n.createdAt}</span>
                  </div>
                  <p className="font-sans text-xs leading-relaxed" style={{ color: 'rgba(197, 198, 199,0.65)' }}>{n.text}</p>
                  <button onClick={() => del(n.id)} aria-label="Удалить заметку" className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity text-pixel/55 hover:text-red-400 flex items-center"><Icon name="close" size={16} color="currentColor" /></button>
                </div>
              ))}
            </div>
          )}
        </div>
        {notes.length > 0 && (
          <div className="px-4 py-3 flex-shrink-0" style={{ borderTop: '1px solid rgba(197, 198, 199,0.06)' }}>
            <button onClick={() => navigator.clipboard.writeText(notes.map(n => `[${n.lessonTitle}]\n${n.text}`).join('\n\n---\n\n'))} className="w-full py-2 rounded font-sans text-xs" style={{ background: 'rgba(197, 198, 199,0.06)', color: 'rgba(197, 198, 199,0.6)' }}>
              <span className="flex items-center justify-center gap-1.5"><Icon name="clipboard" size={12} color="currentColor" />Скопировать все</span>
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Lead timer ───────────────────────────────────────────────────────────────

// Owns its own ticking interval/state so the once-a-second update only
// re-renders this small leaf instead of the whole learning page (lesson
// content, sidebar, quiz state) — previously elapsedSeconds lived on the
// top-level page component.
function LeadTimer({ startTimeMs, color }: { startTimeMs: number; color: string }) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setElapsedSeconds(Math.round((Date.now() - startTimeMs) / 1000)), 1000);
    return () => clearInterval(t);
  }, [startTimeMs]);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  return (
    <div className="w-40 flex-shrink-0 flex flex-col items-center justify-start pt-8 px-4" style={{ borderLeft: '1px solid rgba(197, 198, 199,0.06)' }}>
      <p className="font-geist font-semibold mb-2" style={{ fontSize: 12, letterSpacing: TRACK_WIDE, color: TEXT_MUTED }}>ТАЙМЕР</p>
      <p className="font-geist text-2xl font-bold tabular-nums" style={{ color }}>{formatTime(elapsedSeconds)}</p>
      <p className="font-geist text-xs mt-1" style={{ color: TEXT_MUTED }}>мин:сек</p>
      <p className="font-geist text-xs mt-4 text-center leading-relaxed" style={{ color: TEXT_MUTED }}>Видно только лиду</p>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function CustomCourseLearningPage({ user, onLogout }: Props) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [course, setCourse] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const loadCourse = () => {
    setLoading(true);
    setLoadError(false);
    authFetch(`${API}/custom-courses/${id}`)
      .then(r => r.json())
      .then(data => { if (!data.error) setCourse(data); })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadCourse(); }, [id]);

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
  // Below the lg breakpoint the module/lesson list collapses into this
  // toggle instead of eating a fixed-width column — on a phone a 256px
  // sidebar next to the lesson content left almost nothing to actually
  // read the lesson in.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const startTimeRef = useRef(Date.now());

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
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <p className="font-sans text-pixel/60 text-sm">
            {loadError ? 'Не удалось загрузить курс — проверьте соединение и попробуйте снова.' : 'Курс не найден'}
          </p>
          {loadError && (
            <button onClick={loadCourse} className="text-primary font-sans text-sm hover:underline">
              ↻ Повторить
            </button>
          )}
        </div>
      </div>
    );
  }

  const color = course.color || '#66FCF1';
  const currentLesson = allLessons[currentIdx];
  const isLastLesson = currentIdx === allLessons.length - 1;
  const totalLessons = allLessons.length;
  const completedCount = completedLessons.size;
  const progressPercent = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;

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
    <div className="h-screen flex flex-col" style={{ background: PAGE_GRADIENT }}>
      <Navigation user={user} onLogout={onLogout} />

      <div className="flex flex-1 overflow-hidden flex-col lg:flex-row">
        {/* Sidebar — full-width collapsible block on mobile, static column from lg up */}
        <aside className="w-full lg:w-64 flex-shrink-0 flex flex-col overflow-hidden" style={{ background: CARD_BG, borderRight: '1px solid rgba(197, 198, 199,0.06)', borderBottom: '1px solid rgba(197, 198, 199,0.06)' }}>
          <button
            onClick={() => setMobileNavOpen(o => !o)}
            className="w-full flex items-center justify-between px-4 py-4 flex-shrink-0 lg:hidden"
            style={{ borderBottom: mobileNavOpen ? '1px solid rgba(197, 198, 199,0.06)' : 'none' }}
          >
            <span className="text-left min-w-0">
              <p className="font-montserrat font-semibold mb-1 truncate" style={{ fontSize: 14, color: TEXT_PRIMARY }}>{course.title}</p>
              <p className="font-geist text-xs" style={{ color: TEXT_MUTED }}>{completedCount}/{totalLessons} пройдено · {progressPercent}%</p>
            </span>
            <span className="font-geist text-xs flex-shrink-0 ml-2" style={{ color: 'rgba(197, 198, 199,0.55)' }}>{mobileNavOpen ? <>Скрыть <Icon name="chevronUp" size={22} color="currentColor" /></> : <>Оглавление <Icon name="chevronDown" size={22} color="currentColor" /></>}</span>
          </button>

          <div className="px-4 py-4 flex-shrink-0 hidden lg:block" style={{ borderBottom: '1px solid rgba(197, 198, 199,0.06)' }}>
            <p className="font-montserrat font-semibold mb-2 truncate" style={{ fontSize: 14, color: TEXT_PRIMARY }}>{course.title}</p>
            <div className="flex items-center gap-2 mb-2">
              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(197, 198, 199,0.08)' }}>
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progressPercent}%`, background: color }} />
              </div>
              <span className="font-geist text-xs" style={{ color: TEXT_MUTED }}>{progressPercent}%</span>
            </div>
            <p className="font-geist text-xs" style={{ color: TEXT_MUTED }}>{completedCount}/{totalLessons} пройдено</p>
          </div>

          <div className={`flex-1 overflow-y-auto py-2 ${mobileNavOpen ? '' : 'hidden'} lg:block`} style={{ maxHeight: '50vh' }}>
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
                    style={{ background: isCurMod ? 'rgba(197, 198, 199,0.05)' : 'transparent' }}
                  >
                    <span className="flex-shrink-0" style={{ color: color, transform: isExpanded ? 'rotate(90deg)' : 'none', display: 'inline-block', transition: 'transform 0.15s' }}><Icon name="chevronRight" size={22} color="currentColor" /></span>
                    <span className="flex-1 font-geist text-xs font-semibold leading-snug" style={{ color: isCurMod ? color : 'rgba(197, 198, 199,0.6)' }}>{(mod.title || `Модуль ${mi + 1}`).toUpperCase()}</span>
                    <span className="font-geist text-xs" style={{ color: 'rgba(197, 198, 199,0.55)' }}>
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
                        onClick={() => accessible && (setCurrentIdx(gi), setMobileNavOpen(false))}
                        disabled={!accessible}
                        className="w-full flex items-center gap-2.5 pl-8 pr-4 py-2 text-left transition-all"
                        style={{ background: isCur ? `${color}15` : 'transparent', borderLeft: isCur ? `2px solid ${color}` : '2px solid transparent', cursor: accessible ? 'pointer' : 'not-allowed', opacity: !accessible ? 0.4 : 1 }}
                      >
                        <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center text-xs">
                          {completed ? <CheckCircleIcon size={14} color={ACCENT} /> : isCur ? <span style={{ color }}>▸</span> : !accessible ? <LockIcon size={13} color="rgba(197, 198, 199,0.3)" /> : <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'rgba(197, 198, 199,0.2)' }} />}
                        </span>
                        <span className="font-geist text-xs leading-snug flex-1 flex items-center gap-1.5" style={{ color: isCur ? TEXT_PRIMARY : 'rgba(197, 198, 199,0.5)' }}>
                          {lesson.type === 'quiz' && <PagesIcon size={12} color="currentColor" />}
                          {lesson.title}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>

          <div className={`px-4 py-3 flex-shrink-0 space-y-2 ${mobileNavOpen ? '' : 'hidden'} lg:block`} style={{ borderTop: '1px solid rgba(197, 198, 199,0.06)' }}>
            <button onClick={() => setShowNotes(true)} className="w-full py-2 rounded-lg font-geist text-xs flex items-center justify-center gap-2 cursor-pointer" style={{ background: 'rgba(197, 198, 199,0.06)', color: 'rgba(197, 198, 199,0.6)' }}>
              <PagesIcon size={14} color="currentColor" /> Заметки {notes.length > 0 && <span className="text-xs rounded-full w-4 h-4 flex items-center justify-center" style={{ background: color, color: PAGE_BG, fontSize: '0.6rem' }}>{notes.length}</span>}
            </button>
            <button onClick={() => navigate(`/custom-course/${id}`)} className="w-full py-2 rounded-lg font-geist text-xs cursor-pointer" style={{ color: 'rgba(197, 198, 199,0.55)' }}><Icon name="chevronLeft" size={22} color="currentColor" /> К описанию</button>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          {showCompleted ? (
            <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
              <div className="mb-6"><Icon name="trophy" size={64} color="#EF9F27" /></div>
              <h2 className="font-montserrat font-bold mb-3" style={{ fontSize: 24, color: TEXT_PRIMARY, letterSpacing: TRACK_WIDE }}>Курс завершён!</h2>
              <p className="font-geist text-sm mb-10" style={{ color: TEXT_MUTED }}>{course.title}</p>
              <button onClick={() => navigate('/zhukademia')} className="px-8 py-3 rounded-lg font-geist font-bold text-sm hover:-translate-y-0.5 transition-all cursor-pointer" style={{ background: color, color: PAGE_BG }}><Icon name="chevronLeft" size={22} color="currentColor" /> Вернуться к курсам</button>
            </div>
          ) : currentLesson ? (
            <div className="max-w-3xl mx-auto px-8 py-8">
              {/* Breadcrumb */}
              <p className="font-geist text-xs mb-6" style={{ color: 'rgba(197, 198, 199,0.55)' }}>
                {(course.modules || [])[currentModuleIdx]?.title || ''}
                {' › '}
                <span style={{ color: 'rgba(197, 198, 199,0.6)' }}>{currentLesson.title}</span>
              </p>

              <h1 className="font-montserrat font-bold mb-8" style={{ fontSize: 22, color: TEXT_PRIMARY, letterSpacing: TRACK_WIDE }}>{currentLesson.title}</h1>

              {currentLesson.prerequisite_type === 'optional' && currentLesson.prerequisite_note && (
                <div
                  className="rounded-lg p-3 mb-6 flex items-start gap-2"
                  style={{ background: 'rgba(239,159,39,0.06)', border: '1px solid rgba(239,159,39,0.25)' }}
                >
                  <Icon name="lightbulb" size={22} color="#EF9F27" />
                  <p className="font-geist text-xs" style={{ color: 'rgba(197, 198, 199,0.7)' }}>{currentLesson.prerequisite_note}</p>
                </div>
              )}

              {currentLesson.type === 'lesson' ? (
                <>
                  <LessonContent content={currentLesson.content} />

                  {completeError && (
                    <p className="font-geist text-xs mt-4" style={{ color: '#e05252' }}>
                      Не удалось сохранить прогресс. Проверь соединение и попробуй ещё раз.
                    </p>
                  )}

                  <div className="flex items-center justify-between mt-10 pt-6" style={{ borderTop: '1px solid rgba(197, 198, 199,0.07)' }}>
                    {currentIdx > 0 ? (
                      <button onClick={() => isAccessible(currentIdx - 1) && setCurrentIdx(i => i - 1)} className="font-geist text-sm transition-colors cursor-pointer" style={{ color: 'rgba(197, 198, 199,0.6)' }} onMouseEnter={e => (e.currentTarget.style.color = TEXT_PRIMARY)} onMouseLeave={e => (e.currentTarget.style.color = 'rgba(197, 198, 199,0.6)')}><Icon name="chevronLeft" size={22} color="currentColor" /> Назад</button>
                    ) : <div />}
                    <button
                      onClick={() => markComplete(currentLesson.id)}
                      className="px-8 py-3 rounded-lg font-geist font-bold text-sm transition-all hover:-translate-y-0.5 cursor-pointer flex items-center gap-2"
                      style={{ background: color, color: PAGE_BG }}
                    >
                      {allLessons[currentIdx + 1]?.type === 'quiz'
                        ? <><PagesIcon size={14} color="currentColor" />Пройти тест <Icon name="chevronRight" size={22} color="currentColor" /></>
                        : isLastLesson
                        ? <><CheckCircleIcon size={14} color="currentColor" />Завершить курс</>
                        : <>Далее <Icon name="chevronRight" size={22} color="currentColor" /></>}
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
              <p className="font-geist text-sm" style={{ color: TEXT_MUTED }}>Выбери урок слева</p>
            </div>
          )}
        </main>

        {/* Lead timer — its own component so the once-a-second tick doesn't re-render this whole page */}
        {user.role === 'lead' && (
          <LeadTimer startTimeMs={startTimeRef.current} color={color} />
        )}
      </div>

      <NotesDrawer show={showNotes} onClose={() => setShowNotes(false)} notes={notes} setNotes={setNotes} currentLessonTitle={currentLesson?.title || ''} userId={user.id} courseId={id || ''} />

      {!showNotes && (
        <button onClick={() => setShowNotes(true)} className="fixed bottom-6 right-6 z-30 flex items-center gap-2 px-4 py-2.5 rounded-full font-sans text-sm font-semibold shadow-lg transition-all hover:-translate-y-0.5" style={{ background: CARD_BG, border: '1px solid rgba(197, 198, 199,0.12)', color: 'rgba(197, 198, 199,0.6)', boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>
          <Icon name="memo" size={22} color="currentColor" /> <span className="text-xs">Заметки</span>
          {notes.length > 0 && <span className="rounded-full w-4 h-4 flex items-center justify-center text-xs" style={{ background: color, color: '#0B0C10', fontSize: '0.6rem' }}>{notes.length}</span>}
        </button>
      )}
    </div>
  );
}
