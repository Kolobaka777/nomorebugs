import { lazy, Suspense, useEffect, useState, useRef, useCallback, useMemo } from 'react';
// The pass mark, mirrored from the server (COURSE_PASS_SCORE in
// routes/courses.js). The number is written down in two places because the
// browser has to be able to say "не сдан" without a round trip; the server
// remains the one that decides.
const COURSE_PASS_SCORE = 60;
import { useParams, useNavigate } from 'react-router-dom';
import Navigation from '../components/Navigation';
import FrogLoader from '../components/FrogLoader';
import Icon from '../components/Icon';
import { resultText } from '../utils/courseResult';
import { LockIcon, CheckCircleIcon, DoubleCheckIcon, PagesIcon, BookOpenIcon, CapIcon } from '../components/CatalogIcons';
import { testerApi, coursesApi } from '../api';
import { CourseNote } from '../types';
import { useEscapeKey } from '../utils/a11y';
import { parseServerDate } from '../utils/date';
import { apiErrorMessage, showApiError } from '../utils/toast';
import { parseRichContent } from '../utils/richContent';
import { counted } from '../utils/plural';
import { getCourseTagColor, tagChipStyle } from '../utils/topics';
import { PAGE_GRADIENT, PAGE_BG, CARD_BG, CARD_BG_PATTERN, CARD_SHADOW, TEXT_PRIMARY, TEXT_MUTED, ACCENT, SUCCESS, TRACK_WIDE, ERROR, H2 } from '../utils/theme';
import successFrogUrl from '../assets/icons/success-frog.svg';
import failedFrogUrl from '../assets/icons/failed-frog.svg';

// Same lazy-split reasoning as GuidesPage.tsx.
const RichTextEditor = lazy(() => import('../components/RichTextEditor'));

function LessonContentFallback() {
  return (
    <div className="flex items-center justify-center py-10">
      <div className="pixel-pulse font-geist text-xs" style={{ color: TEXT_MUTED }}>загружаю...</div>
    </div>
  );
}

// Semantic pass/fail colors for the course-result screen — deliberately
// independent of the course's own accent `color` (a course themed amber can
// still show a green "passed" percentage), matching the green already used
// elsewhere for "fresh/positive" state (ZhukademiPage's NEW_BADGE_COLOR) and
// the red already used throughout this file for wrong-answer states.
const RESULT_PASS_COLOR = '#4ADE80';
const RESULT_FAIL_COLOR = ERROR;

interface Props {
  user: any;
  onLogout: () => void;
}

// ─── Lesson content renderer ──────────────────────────────────────────────────

// Used to be a hand-rolled parser for a markdown-like subset ("# heading",
// "- list", fenced ``` code, "> "/"! " callouts) with no editor to match —
// LessonEditor.tsx's textarea just had a placeholder explaining the
// convention. Now the same RichTextEditor every other rich-text surface
// uses; parseRichContent upgrades any lesson written under the old
// convention into real headings/lists/code the first time it's opened
// here (see utils/richContent.ts) instead of showing raw "# " characters.
function LessonContent({ content }: { content: string }) {
  if (!content?.trim()) {
    return (
      <div className="flex flex-col items-center py-16 text-center">
        <Icon name="construction" size={48} color="#EF9F27" className="mb-4" />
        <p className="font-sans text-sm" style={{ color: 'rgba(197, 198, 199,0.6)' }}>Материал этого урока ещё готовится</p>
      </div>
    );
  }
  return (
    <Suspense fallback={<LessonContentFallback />}>
      <RichTextEditor content={parseRichContent(content)} editable={false} />
    </Suspense>
  );
}

// ─── Quiz view ────────────────────────────────────────────────────────────────

// `answers` is what the person picked, by question index — the UI's own
// bookkeeping. Everything about *correctness* comes from the server:
// `reveal` is filled one question at a time as they answer, `breakdown`
// arrives with the graded submission. The questions themselves no longer
// carry correct_idx/explanation at all (see routes/courses.js), so there is
// nothing here to read the answer key out of.
interface Reveal { correct_idx: number; explanation: string }

interface QuizState {
  answers: Record<number, number>;
  reveal: Record<number, Reveal>;
  submitted: boolean;
  score: number;
  breakdown: Record<number, { correct_idx: number; isCorrect: boolean; explanation: string }>;
  error: string;
}

const emptyQuizState = (): QuizState => ({ answers: {}, reveal: {}, submitted: false, score: 0, breakdown: {}, error: '' });

function CustomQuizView({
  lesson,
  quizState,
  onAnswer,
  onCheck,
  onSubmit,
  onNext,
  onRetry,
  isLastLesson,
  color,
}: {
  lesson: any;
  quizState: QuizState;
  onAnswer: (qi: number, oi: number) => void;
  onCheck: (qi: number) => Promise<void>;
  onSubmit: () => Promise<boolean>;
  onNext: () => void;
  onRetry: () => void;
  isLastLesson: boolean;
  color: string;
}) {
  const questions = lesson.questions || [];
  // Which question is on screen right now, and which of them have already
  // been "checked" (answer locked in + correctness revealed) — both reset
  // for free whenever the parent remounts this component via `key={lesson.id}`,
  // so switching quiz lessons never leaks state from the previous one.
  const [qIdx, setQIdx] = useState(0);
  const [busy, setBusy] = useState(false);

  if (questions.length === 0) {
    return (
      <div className="flex flex-col items-center py-16">
        <Icon name="construction" size={48} color="#EF9F27" className="mb-4" />
        <p className="font-sans text-pixel/60 text-sm">Вопросы для теста ещё готовятся</p>
        <button onClick={onNext} className="mt-6 px-6 py-2 rounded font-sans font-bold text-sm" style={{ background: color, color: '#0B0C10' }}>
          {isLastLesson
            ? <><CheckCircleIcon size={16} color="currentColor" /> Завершить</>
            : <>Далее <Icon name="arrowRight" size={20} color="currentColor" /></>}
        </button>
      </div>
    );
  }

  const { submitted, score, breakdown } = quizState;

  // ── After the whole quiz is submitted: full recap, every question at
  // once with its result — this is a review of a finished attempt, not the
  // "stay focused, one thing at a time" flow, so nothing distracting about
  // showing it all together here.
  //
  // The recap states whether the attempt counted, because the answer
  // decides what happens next: a pass opens the module ahead, a fail is a
  // retake. It stops short of celebrating — CourseResultScreen is where the
  // whole course gets its verdict, and this recap fires after every test in
  // it, not only the last.
  if (submitted) {
    const passedThis = score >= COURSE_PASS_SCORE;
    return (
      <div>
        <div className="mb-8 rounded-lg px-4 py-3" style={{ background: passedThis ? `${SUCCESS}12` : 'rgba(224,82,82,0.10)', border: `1px solid ${passedThis ? `${SUCCESS}55` : 'rgba(224,82,82,0.5)'}` }}>
          <p className="font-geist font-semibold" style={{ fontSize: 14, color: passedThis ? SUCCESS : ERROR }}>
            {passedThis ? 'Тест сдан' : 'Тест не сдан'} — {Object.values(breakdown).filter(b => b.isCorrect).length} из {questions.length} ({score}%)
          </p>
          <p className="font-geist mt-1" style={{ fontSize: 12, color: 'rgba(197, 198, 199,0.7)' }}>
            {passedThis
              ? 'Следующий модуль открыт.'
              : `Нужно ${COURSE_PASS_SCORE}% или больше. Пересдавать можно сколько угодно — сохраняется лучший результат.`}
          </p>
        </div>

        <div className="space-y-8">
          {questions.map((q: any, qi: number) => {
            const opts = [q.option_a, q.option_b, q.option_c, q.option_d].filter(Boolean);
            const chosen = quizState.answers[qi];
            const verdict = breakdown[q.id];

            return (
              <div key={q.id ?? qi}>
                <p className="font-sans font-semibold text-sm mb-4 break-words" style={{ color: '#C5C6C7' }}>
                  <span style={{ color }} className="mr-2">{qi + 1}.</span>
                  {q.question_text}
                </p>
                <div className="space-y-2">
                  {opts.map((opt: string, oi: number) => {
                    const isChosen = chosen === oi;
                    const isCorrectOpt = oi === verdict?.correct_idx;
                    const isWrongChosen = isChosen && oi !== verdict?.correct_idx;

                    let bg = 'rgba(197, 198, 199,0.04)';
                    let border = 'rgba(197, 198, 199,0.1)';
                    let textColor = 'rgba(197, 198, 199,0.65)';

                    if (isCorrectOpt) { bg = 'rgba(102, 252, 241,0.12)'; border = 'rgba(102, 252, 241,0.5)'; textColor = '#C5C6C7'; }
                    if (isWrongChosen) { bg = 'rgba(224,82,82,0.1)'; border = 'rgba(224,82,82,0.4)'; textColor = 'rgba(197, 198, 199,0.6)'; }

                    return (
                      <div
                        key={oi}
                        className="w-full text-left px-4 py-3 rounded font-sans text-sm flex items-center gap-3"
                        style={{ background: bg, border: `1px solid ${border}`, color: textColor }}
                      >
                        <span className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold border" style={{ borderColor: border, color: isCorrectOpt ? '#66FCF1' : isWrongChosen ? ERROR : textColor }}>
                          {isCorrectOpt ? <Icon name="check" size={13} color="currentColor" />
                            : isWrongChosen ? <Icon name="close" size={13} color="currentColor" />
                            : String.fromCharCode(65 + oi)}
                        </span>
                        <span className="break-words min-w-0">{opt}</span>
                      </div>
                    );
                  })}
                </div>
                {verdict?.explanation && (
                  <div className="mt-3 px-4 py-3 rounded text-xs font-sans leading-relaxed break-words" style={{ background: 'rgba(197, 198, 199,0.04)', color: 'rgba(197, 198, 199,0.55)', border: '1px solid rgba(197, 198, 199,0.06)' }}>
                    <span className="flex items-start gap-2"><Icon name="lightbulb" size={14} color="currentColor" className="shrink-0 mt-0.5" /> {verdict.explanation}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-10 flex justify-end gap-3 flex-wrap">
          {/* A failed test offers only the retake. Moving on is not on the
              table — the server refuses to mark it done — so offering it
              would be offering an error message. */}
          <button
            onClick={onRetry}
            className="px-6 py-3 rounded-lg font-geist font-semibold text-sm transition-all hover:brightness-125 cursor-pointer flex items-center gap-2"
            style={{ background: 'rgba(197, 198, 199,0.06)', border: '1px solid rgba(197, 198, 199,0.25)', color: TEXT_PRIMARY, letterSpacing: '1.2px' }}
          >
            <Icon name="undo" size={18} color="currentColor" /> Пройти тест заново
          </button>
          {passedThis && (
            <button
              onClick={onNext}
              className="px-6 py-3 rounded-lg font-geist font-semibold text-sm transition-all hover:brightness-125 cursor-pointer flex items-center gap-2"
              style={{ background: `${color}1F`, border: `1px solid ${color}`, color, letterSpacing: '1.2px' }}
            >
              {isLastLesson
                ? <><CheckCircleIcon size={16} color="currentColor" /> Завершить курс</>
                : <>Дальше <Icon name="arrowRight" size={20} color="currentColor" /></>}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Still taking the quiz: one question fills the page, nothing else
  // competing for attention — pick an option, lock it in, see the result,
  // move on. Mirrors QuizPage's (the seeded-lecture quiz) same pattern.
  const q = questions[qIdx];
  const opts = [q.option_a, q.option_b, q.option_c, q.option_d].filter(Boolean);
  const chosen = quizState.answers[qIdx];
  const reveal = quizState.reveal[qIdx];
  const checked = !!reveal;
  const isLastQuestion = qIdx === questions.length - 1;
  const isCorrect = checked && chosen === reveal.correct_idx;

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-6">
        <h2 className="font-montserrat break-words min-w-0" style={{ ...H2 }}>
          Тест: {lesson.title}
        </h2>
        <span className="font-geist flex items-center gap-2 shrink-0 tabular-nums" style={{ fontSize: 13, color }}>
          <PagesIcon size={16} color="currentColor" />{qIdx + 1}/{questions.length}
        </span>
      </div>

      {/* No panel around the question: the design puts it straight on the
          page. A card here framed a single question inside a page that had
          nothing else on it, which is a border drawn around everything. */}
      <div className="fade-in">
        <p className="font-geist mb-6 break-words flex gap-3" style={{ fontSize: 15, lineHeight: 1.6, letterSpacing: '1.6px', color: TEXT_PRIMARY }}>
          <span className="shrink-0 w-6 h-6 rounded flex items-center justify-center font-geist font-bold text-xs" style={{ background: color, color: PAGE_BG }}>{qIdx + 1}</span>
          <span className="break-words min-w-0">{q.question_text}</span>
        </p>

        <div className="space-y-3">
          {opts.map((opt: string, oi: number) => {
            const isChosen = chosen === oi;
            const isCorrectOpt = checked && oi === reveal.correct_idx;
            const isWrongChosen = checked && isChosen && oi !== reveal.correct_idx;

            // An option nobody picked keeps the course's own outline once
            // the answer is revealed, rather than greying out — only the
            // two that carry a verdict change colour, so the verdict is
            // what the eye finds. Correct is green, not the course accent:
            // "this is the answer" is not the same statement as "this is
            // the brand".
            let bg = `${color}0A`;
            let border = `${color}55`;
            let textColor = 'rgba(197, 198, 199,0.75)';
            let markColor = color;

            if (!checked && isChosen) { bg = `${color}22`; border = color; textColor = TEXT_PRIMARY; }
            if (isCorrectOpt) { bg = `${SUCCESS}18`; border = `${SUCCESS}80`; textColor = TEXT_PRIMARY; markColor = SUCCESS; }
            if (isWrongChosen) { bg = 'rgba(224,82,82,0.12)'; border = 'rgba(224,82,82,0.6)'; textColor = 'rgba(197, 198, 199,0.7)'; markColor = ERROR; }

            return (
              <button
                key={oi}
                onClick={() => !checked && onAnswer(qIdx, oi)}
                disabled={checked}
                className="w-full text-left px-4 py-3.5 rounded-lg font-geist text-sm flex items-center gap-3 transition-all"
                style={{ background: bg, border: `1px solid ${border}`, color: textColor, cursor: checked ? 'default' : 'pointer' }}
              >
                <span className="flex-shrink-0 flex items-center justify-center font-bold" style={{ width: 20, fontSize: 13, color: markColor }}>
                  {isCorrectOpt ? <Icon name="check" size={15} color="currentColor" />
                    : isWrongChosen ? <Icon name="close" size={15} color="currentColor" />
                    : `${String.fromCharCode(65 + oi)})`}
                </span>
                <span className="break-words min-w-0">{opt}</span>
              </button>
            );
          })}
        </div>

        {checked && (
          // Names the right answer by its letter before explaining it. The
          // box used to carry the explanation alone, which read as a remark
          // about the question rather than the verdict on the attempt.
          <div
            className="mt-4 px-4 py-3.5 rounded-lg font-geist leading-relaxed break-words"
            style={{
              fontSize: 13,
              background: isCorrect ? `${SUCCESS}12` : 'rgba(224,82,82,0.10)',
              border: `1px solid ${isCorrect ? `${SUCCESS}55` : 'rgba(224,82,82,0.5)'}`,
              color: 'rgba(197, 198, 199,0.8)',
            }}
          >
            <p className="font-semibold flex items-center gap-2 mb-1.5" style={{ color: isCorrect ? SUCCESS : ERROR }}>
              <Icon name={isCorrect ? 'check' : 'close'} size={14} color="currentColor" />
              {isCorrect ? 'Верно' : `Правильный ответ: ${String.fromCharCode(65 + reveal.correct_idx)}`}
            </p>
            {reveal.explanation && (
              <p className="break-words"><span className="font-semibold" style={{ color: TEXT_PRIMARY }}>Пояснение:</span> {reveal.explanation}</p>
            )}
          </div>
        )}

        {quizState.error && (
          <p role="alert" className="mt-6 text-xs font-geist break-words" style={{ color: ERROR }}>{quizState.error}</p>
        )}

        <div className="mt-8 flex justify-end">
          {!checked ? (
            <button
              onClick={async () => { setBusy(true); await onCheck(qIdx); setBusy(false); }}
              disabled={chosen === undefined || busy}
              className="px-8 py-3 rounded-lg font-geist font-semibold text-sm transition-all"
              style={{ background: chosen !== undefined && !busy ? `${color}1F` : 'rgba(197, 198, 199,0.06)', border: `1px solid ${chosen !== undefined && !busy ? color : 'rgba(197, 198, 199,0.15)'}`, color: chosen !== undefined && !busy ? color : 'rgba(197, 198, 199,0.3)', letterSpacing: TRACK_WIDE, cursor: chosen !== undefined && !busy ? 'pointer' : 'not-allowed' }}
            >
              {busy ? '...' : 'Ответить'}
            </button>
          ) : (
            <button
              onClick={async () => {
                if (!isLastQuestion) { setQIdx(i => i + 1); return; }
                setBusy(true);
                await onSubmit();
                setBusy(false);
                // Deliberately no auto-advance on the last test. It used to
                // jump straight to the course's pass/fail screen, which threw
                // the reader off their own results before they had read them.
                // The recap below has the button; leaving is their call.
              }}
              disabled={busy}
              className="px-8 py-3 rounded-lg font-geist font-semibold text-sm flex items-center gap-2 transition-all hover:brightness-125 disabled:opacity-60"
              style={{ background: `${color}1F`, border: `1px solid ${color}`, color, letterSpacing: TRACK_WIDE }}
            >
              {busy ? '...' : isLastQuestion ? 'Завершить тест' : <>Следующий вопрос <Icon name="arrowRight" size={20} color="currentColor" /></>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Notes drawer ─────────────────────────────────────────────────────────────

// Server-backed (see the custom_lesson_notes migration in db/schema.js) —
// used to be localStorage-only, keyed by (userId, courseId) with no lesson
// id at all. Moving it server-side is what makes the profile's aggregated
// "Заметки" tab possible (MoyaNora.tsx), including its "jump to lesson"
// links, which need a real lesson_id to work.
function NotesDrawer({ show, onClose, notes, setNotes, currentLessonTitle, currentLessonId, courseId }: {
  show: boolean; onClose: () => void; notes: CourseNote[]; setNotes: (n: CourseNote[]) => void;
  currentLessonTitle: string; currentLessonId: number; courseId: string;
}) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  useEscapeKey(() => { if (show) onClose(); });

  const save = async () => {
    if (!text.trim()) return;
    setSaving(true);
    try {
      const res = await testerApi.addNote({ course_id: parseInt(courseId, 10), lesson_id: currentLessonId, lesson_title: currentLessonTitle, text: text.trim() });
      setNotes([...notes, { id: res.data.id, lesson_id: currentLessonId, lesson_title: currentLessonTitle, module_title: null, text: text.trim(), created_at: new Date().toISOString() }]);
      setText('');
    } catch (e: any) {
      showApiError(e, 'Не удалось сохранить заметку');
    } finally {
      setSaving(false);
    }
  };

  const del = async (nid: number) => {
    setNotes(notes.filter(n => n.id !== nid));
    try {
      await testerApi.deleteNote(nid);
    } catch (e: any) {
      showApiError(e, 'Не удалось удалить заметку');
    }
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
          <button onClick={save} disabled={!text.trim() || saving} className="mt-2 w-full py-2 rounded font-sans text-xs font-semibold" style={{ background: text.trim() ? '#66FCF1' : 'rgba(197, 198, 199,0.06)', color: text.trim() ? '#0B0C10' : 'rgba(197, 198, 199,0.3)', cursor: text.trim() ? 'pointer' : 'not-allowed' }}>
            {saving ? '...' : 'Сохранить'}
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
                    <span className="font-sans text-xs font-semibold truncate pr-4" style={{ color: '#66FCF1', maxWidth: '180px' }}>{n.lesson_title}</span>
                    <span className="text-pixel/55 font-sans text-xs flex-shrink-0">{parseServerDate(n.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <p className="font-sans text-xs leading-relaxed break-words" style={{ color: 'rgba(197, 198, 199,0.65)' }}>{n.text}</p>
                  <button onClick={() => del(n.id)} aria-label="Удалить заметку" className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity text-pixel/55 hover:text-red-400 flex items-center"><Icon name="close" size={16} color="currentColor" /></button>
                </div>
              ))}
            </div>
          )}
        </div>
        {notes.length > 0 && (
          <div className="px-4 py-3 flex-shrink-0" style={{ borderTop: '1px solid rgba(197, 198, 199,0.06)' }}>
            <button onClick={() => navigator.clipboard.writeText(notes.map(n => `[${n.lesson_title}]\n${n.text}`).join('\n\n---\n\n'))} className="w-full py-2 rounded font-sans text-xs" style={{ background: 'rgba(197, 198, 199,0.06)', color: 'rgba(197, 198, 199,0.6)' }}>
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
    // Rides in the course header rather than claiming a column of its own:
    // the page is two columns now, and a 160px third one for a clock pushed
    // the lesson text narrower for everyone in exchange for something only
    // the lead can see.
    <div className="flex items-center gap-3 rounded-lg px-4 py-2.5 flex-shrink-0" style={{ background: 'rgba(11, 12, 16, 0.5)', border: '1px solid rgba(197, 198, 199,0.12)' }}>
      <div>
        <p className="font-geist font-semibold" style={{ fontSize: 10, letterSpacing: TRACK_WIDE, color: TEXT_MUTED }}>ТАЙМЕР</p>
        <p className="font-geist font-bold tabular-nums" style={{ fontSize: 20, color }}>{formatTime(elapsedSeconds)}</p>
      </div>
      <p className="font-geist leading-tight" style={{ fontSize: 10, color: TEXT_MUTED }}>мин:сек<br />виден только лиду</p>
    </div>
  );
}

// ─── Course result screen (pass/fail) ──────────────────────────────────────────

// Shown once the last lesson is completed — always this frog pass/fail
// screen, never a separate plain "Курс завершён!" one (that used to exist
// for reading-only courses with nothing to grade; removed on purpose so
// there's exactly one course-completion screen, not two different ones
// depending on whether the course happened to have a quiz). `score` is
// `null` for a course with no gradable quizzes — coursePassed is forced
// `true` in that case (see the caller), so this renders as a pass with the
// frog and no fabricated percentage, rather than a 100%/0% that was never
// actually measured.
function CourseResultScreen({ course, color, passed, score, weakModules, onRetry, onBackToCourse, onNext, onModuleClick }: {
  course: any; color: string; passed: boolean; score: number | null;
  weakModules: string[]; onRetry: () => void; onBackToCourse: () => void; onNext: () => void;
  onModuleClick: (title: string) => void;
}) {
  return (
    <div className="max-w-2xl mx-auto px-8 py-10">
      {/* Mini course hero — same recipe as CustomCourseDetailPage's hero
          card (icon box + tag pill + title), just without the lesson/module/
          test stat row, which has nothing to add once you've already
          finished. The checkmark on the right only appears when passed. */}
      <div className="rounded-lg p-5 flex items-center gap-4 mb-10" style={{ background: CARD_BG, border: `1px solid ${color}` }}>
        <div className="w-14 h-14 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${color}18`, border: `1.5px solid ${color}55` }}>
          <BookOpenIcon size={26} color={color} />
        </div>
        <div className="min-w-0 flex-1">
          {course.tag && (
            <span className="inline-block px-2 py-0.5 font-geist text-xs font-semibold mb-1.5" style={{ letterSpacing: '0.06em', ...tagChipStyle(color, course.tag) }}>
              {course.tag}
            </span>
          )}
          <h2 className="font-montserrat break-words" style={{ fontSize: 17, color: TEXT_PRIMARY }}>{course.title}</h2>
        </div>
        {passed && <CheckCircleIcon size={28} color={ACCENT} className="flex-shrink-0" />}
      </div>

      <div className="text-center">
        <h1 className="font-montserrat font-bold mb-2" style={{ ...H2 }}>
          {passed ? 'ПОЗДРАВЛЯЕМ!' : 'Результат не засчитан'}
        </h1>
        <p className="font-geist text-sm mb-8" style={{ color: TEXT_MUTED }}>
          {passed ? <>Ты успешно завершил курс <span style={{ color: TEXT_PRIMARY, fontWeight: 600 }}>{course.title}</span></> : 'Но это не провал.'}
        </p>

        <div className="flex items-center justify-center gap-5 mb-5">
          <img src={passed ? successFrogUrl : failedFrogUrl} alt="" style={{ height: 110, width: 'auto' }} />
          {score !== null && (
            <div className="text-left">
              <p className="font-montserrat font-bold tabular-nums" style={{ fontSize: 44, color: passed ? RESULT_PASS_COLOR : RESULT_FAIL_COLOR, lineHeight: 1 }}>{score}%</p>
              <p className="font-geist text-sm mt-1" style={{ color: TEXT_MUTED }}>Правильных ответов</p>
            </div>
          )}
        </div>

        {/* The frog's send-off, in the course's own voice. Set per course in
            the builder; falls back to a default rather than to silence. */}
        <p
          className="font-geist italic mx-auto mb-8 px-4 break-words"
          style={{ fontSize: 15, lineHeight: 1.5, color: passed ? RESULT_PASS_COLOR : RESULT_FAIL_COLOR, maxWidth: 460 }}
        >
          «{resultText(course, passed)}»
        </p>

        {passed ? (
          <p className="font-geist text-sm leading-relaxed mb-10" style={{ color: 'rgba(197, 198, 199,0.75)' }}>
            {score !== null ? (
              <>
                Твой результат говорит о глубоком понимании темы курса<br />
                Новая ачивка уже в твоём профиле<br />
                Ты её заслужил!
              </>
            ) : (
              <>
                Ты прошёл весь материал курса <span style={{ color: TEXT_PRIMARY, fontWeight: 600 }}>{course.title}</span><br />
                Новая ачивка уже в твоём профиле<br />
                Ты её заслужил!
              </>
            )}
          </p>
        ) : (
          <p className="font-geist text-sm leading-relaxed mb-10" style={{ color: 'rgba(197, 198, 199,0.75)' }}>
            Это всего лишь сигнал, что нужно немного подтянуть знания.<br />
            {weakModules.length > 0 && (
              <>
                Рекомендуем заново посмотреть модул{weakModules.length === 1 ? 'ь' : 'и'}{' '}
                {weakModules.map((m, i) => (
                  <span key={m}>
                    <button onClick={() => onModuleClick(m)} className="font-semibold cursor-pointer hover:underline" style={{ color }}>{m}</button>
                    {i < weakModules.length - 1 && (i === weakModules.length - 2 ? ' и ' : ', ')}
                  </span>
                ))}
                <br />
              </>
            )}
            Перед тем как снова проходить тест
          </p>
        )}

        <div className="flex items-center justify-center gap-4">
          {passed ? (
            <SolidPill color={color} onClick={onNext}>Следующий Курс <Icon name="arrowRight" size={16} color="currentColor" /></SolidPill>
          ) : (
            <>
              <SolidPill color="rgba(197, 198, 199,0.12)" textColor={TEXT_PRIMARY} onClick={onBackToCourse}><Icon name="chevronLeft" size={16} color="currentColor" /> Вернуться к курсу</SolidPill>
              <SolidPill color={color} onClick={onRetry}>Пройти тест снова <Icon name="arrowRight" size={16} color="currentColor" /></SolidPill>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Small shared pill button for the result screen — smooth brightness-only
// hover per the site-wide hover convention, no lift.
function SolidPill({ color, textColor = PAGE_BG, onClick, children }: {
  color: string; textColor?: string; onClick: () => void; children: React.ReactNode;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="font-geist font-bold text-sm rounded-lg cursor-pointer flex items-center gap-2"
      style={{ padding: '12px 28px', background: color, color: textColor, transition: 'filter 0.15s', filter: hover ? 'brightness(1.1)' : 'none' }}
    >
      {children}
    </button>
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
    coursesApi.get(id!)
      .then(r => setCourse(r.data))
      .catch((err: any) => {
        // Same distinction as the course's landing page: "not there" wants
        // a way back, "did not arrive" wants a retry.
        const status = err?.response?.status;
        if (status !== 404 && status !== 403) setLoadError(true);
      })
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
  // Best score per quiz lesson. Seeded from the payload's myResult and
  // updated the moment an attempt is graded, so passing a test opens the
  // next module in this session rather than on the next page load.
  const [quizScores, setQuizScores] = useState<Map<number, number>>(new Map());

  useEffect(() => {
    if (!course) return;
    const lessons = (course.modules || []).flatMap((m: any) => m.lessons || []);
    setCompletedLessons(new Set(lessons.filter((l: any) => l.completed).map((l: any) => l.id)));
    setQuizScores(new Map(
      lessons
        .filter((l: any) => l.type === 'quiz' && l.myResult && l.myResult.score != null)
        .map((l: any) => [l.id as number, l.myResult.score as number])
    ));
  }, [course]);

  // Notes are aggregated across every course server-side (see
  // testerApi.getNotes / MoyaNora's "Заметки" tab) — this pulls out just
  // this course's group rather than adding a redundant per-course endpoint.
  useEffect(() => {
    if (!id) return;
    testerApi.getNotes()
      .then(r => setNotes(r.data.find((g: any) => g.course_id === parseInt(id, 10))?.notes || []))
      .catch(() => {});
  }, [id]);

  const [currentIdx, setCurrentIdx] = useState(0);
  const [showCompleted, setShowCompleted] = useState(false);
  // The graded result, straight from the server. Refetched every time the
  // finish screen opens, so a retake shows the new number rather than a
  // stale one from the first pass through.
  const [serverResult, setServerResult] = useState<{ score: number | null; passed: boolean; weakModules: string[] } | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState<CourseNote[]>([]);
  const [quizStates, setQuizStates] = useState<Record<number, any>>({});
  // submitQuiz needs whatever the answers are *at the moment it fires*, and
  // it must not be re-created every time one changes (it is passed down as a
  // callback). A ref mirror is the smallest thing that gives it both.
  const quizStatesRef = useRef<Record<number, any>>({});
  quizStatesRef.current = quizStates;
  const [expandedModules, setExpandedModules] = useState<Set<number>>(new Set());
  // The contents live behind a dropdown at every width now, rather than in
  // a column of their own — a permanent tree beside the lesson took a
  // third of the page to say what the reader had already chosen.
  const [tocOpen, setTocOpen] = useState(false);
  const tocRef = useRef<HTMLDivElement>(null);
  useEscapeKey(() => setTocOpen(false));
  useEffect(() => {
    if (!tocOpen) return;
    const onDown = (e: MouseEvent) => {
      if (tocRef.current && !tocRef.current.contains(e.target as Node)) setTocOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [tocOpen]);

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
  const patchQuiz = useCallback((idx: number, patch: (st: QuizState) => Partial<QuizState>) => {
    setQuizStates(prev => {
      const st: QuizState = prev[idx] || emptyQuizState();
      return { ...prev, [idx]: { ...st, ...patch(st) } };
    });
  }, []);

  // Reveals one question's answer, from the server. The questions in the
  // payload deliberately no longer carry correct_idx, so this round trip is
  // what makes immediate feedback possible without shipping the answer key
  // to the browser — the same trade the seeded lecture track already makes.
  const checkAnswer = useCallback(async (idx: number, lesson: any, qi: number) => {
    const question = (lesson.questions || [])[qi];
    if (!question) return;
    try {
      const res = await coursesApi.getExplanation(lesson.id, question.id);
      patchQuiz(idx, st => ({
        reveal: { ...st.reveal, [qi]: { correct_idx: res.data.correct_idx, explanation: res.data.explanation || '' } },
        error: '',
      }));
    } catch (e: any) {
      patchQuiz(idx, () => ({ error: apiErrorMessage(e, 'Не удалось проверить ответ. Попробуй ещё раз.') }));
    }
  }, [patchQuiz]);

  // Grades the whole attempt server-side and keeps what comes back. Returns
  // whether it landed, so the caller knows not to advance on a failure.
  // When the current quiz was opened, so the attempt can be timed. Only the
  // lead ever sees the number.
  const quizOpenedAtRef = useRef<number>(Date.now());
  useEffect(() => { quizOpenedAtRef.current = Date.now(); }, [currentIdx]);

  const submitQuiz = useCallback(async (idx: number, lesson: any): Promise<boolean> => {
    const questions = lesson.questions || [];
    const state: QuizState = quizStatesRef.current[idx] || emptyQuizState();
    // Keyed by question id, not position — the server grades by id so a
    // course edited mid-attempt can't mark someone against another question.
    const byId: Record<number, number> = {};
    questions.forEach((q: any, qi: number) => {
      if (state.answers[qi] !== undefined) byId[q.id] = state.answers[qi];
    });
    try {
      const seconds = Math.max(0, Math.round((Date.now() - quizOpenedAtRef.current) / 1000));
      const res = await coursesApi.submitQuiz(lesson.id, byId, seconds);
      const breakdown: QuizState['breakdown'] = {};
      for (const b of res.data.breakdown) {
        breakdown[b.id] = { correct_idx: b.correct_idx, isCorrect: b.isCorrect, explanation: b.explanation || '' };
      }
      patchQuiz(idx, () => ({ submitted: true, score: res.data.score, breakdown, error: '' }));
      // The stored record is the best attempt, not the latest one — a worse
      // retake must not close a module that is already open.
      const best = res.data.best?.score ?? res.data.score;
      setQuizScores(prev => new Map(prev).set(lesson.id, Math.max(prev.get(lesson.id) ?? 0, best)));
      return true;
    } catch (e: any) {
      patchQuiz(idx, () => ({ error: apiErrorMessage(e, 'Не удалось отправить ответы. Попробуй ещё раз.') }));
      return false;
    }
  }, [patchQuiz]);

  // How many times each quiz has been restarted. It rides in the quiz view's
  // React key, which is what actually sends it back to question one: the
  // answers live in this component, but *which question is on screen* is the
  // view's own state, and clearing the answers alone left the reader looking
  // at the last question of the attempt they had just finished.
  const [retakeCounts, setRetakeCounts] = useState<Record<number, number>>({});

  // Wipes this quiz's answers so it starts from question one. The stored
  // result is left alone on purpose: the server keeps the best attempt, so a
  // worse retake can never cost someone a pass they already earned.
  const retakeQuiz = useCallback((idx: number) => {
    setQuizStates(prev => {
      const next = { ...prev };
      delete next[idx];
      return next;
    });
    setRetakeCounts(prev => ({ ...prev, [idx]: (prev[idx] || 0) + 1 }));
  }, []);

  const markComplete = useCallback(async (lessonId: number) => {
    setCompleteError(false);
    try {
      await coursesApi.completeLesson(lessonId);
    } catch (err: any) {
      // The server refuses a failed test and a shut module, and says why.
      // Showing that beats the generic "не удалось сохранить прогресс",
      // which described a network problem the reader did not have.
      showApiError(err, 'Не удалось сохранить прогресс. Проверь соединение и попробуй ещё раз.');
      setCompleteError(true);
      return;
    }
    const next = new Set(completedLessons);
    next.add(lessonId);
    setCompletedLessons(next);
    if (currentIdx === allLessons.length - 1) {
      const totalSeconds = Math.round((Date.now() - startTimeRef.current) / 1000);
      // Time-tracking is also what awards the course's coins server-side, so
      // the graded result is only read *after* it lands — otherwise the
      // screen could show a pass while the award had not been decided yet.
      try {
        await coursesApi.trackTime(parseInt(id || '0'), totalSeconds);
      } catch { /* the engagement metric is not worth blocking the screen */ }
      try {
        const res = await coursesApi.myResult(id || '');
        setServerResult(res.data);
      } catch {
        // No result means no verdict to show — the screen falls back to the
        // "finished, nothing graded" rendering rather than inventing a score.
        setServerResult(null);
      }
      setShowCompleted(true);
    } else {
      setCurrentIdx(i => i + 1);
    }
  }, [completedLessons, allLessons, currentIdx, id]);

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: PAGE_GRADIENT }}>
        <Navigation user={user} onLogout={onLogout} />
        <FrogLoader />
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

  const color = course.color || getCourseTagColor(course.tag || '') || '#66FCF1';
  const currentLesson = allLessons[currentIdx];
  const isLastLesson = currentIdx === allLessons.length - 1;
  const prevLesson = currentIdx > 0 ? allLessons[currentIdx - 1] : null;
  const nextLesson = allLessons[currentIdx + 1] || null;
  const totalLessons = allLessons.length;
  const completedCount = completedLessons.size;
  const progressPercent = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;
  // The header card's three counts. Quizzes are lessons too, so the lesson
  // total deliberately includes them — the design puts тесты beside уроков
  // as a breakdown of the same set, not as a fourth thing to add up.
  const quizCount = allLessons.filter((l: any) => l.type === 'quiz').length;
  const moduleCount = (course.modules || []).length;

  // Mirrors the server's two locks (see GET /api/custom-courses/:id and
  // lockedModuleIds beside it) but reactive to this session's progress
  // instead of only reflecting the state at initial page load. The server
  // still decides — every /complete and /submit-quiz re-checks both.
  //
  // A module opens once every graded test in every module before it has been
  // passed. Modules with nothing graded in them gate nothing, or a course
  // with no tests would be locked shut by a rule about tests.
  const lockedModules = (() => {
    const locked = new Set<number>();
    if (course.canManage) return locked;
    let blocked = false;
    for (const mod of course.modules || []) {
      if (blocked) locked.add(mod.id);
      const graded = (mod.lessons || []).filter((l: any) => l.type === 'quiz' && (l.questions || []).length > 0);
      if (graded.some((l: any) => (quizScores.get(l.id) ?? -1) < COURSE_PASS_SCORE)) blocked = true;
    }
    return locked;
  })();

  const isAccessible = (idx: number) => {
    const lesson = allLessons[idx];
    if (!lesson) return false;
    if (lockedModules.has(lesson.module_id)) return false;
    if (lesson.prerequisite_type !== 'mandatory' || lesson.prerequisite_lesson_id == null) return true;
    return completedLessons.has(lesson.prerequisite_lesson_id);
  };

  // Course-level result. This used to be averaged in the browser out of
  // quiz scores the browser had also computed for itself, which meant the
  // pass/fail screen, the completion coins and the lead's dashboard could
  // all disagree with each other and with the truth. The server now grades
  // every attempt and stores it (custom_quiz_results), so this is a read of
  // that, not a second opinion — see GET /api/custom-courses/:id/my-result.
  //
  // `null` score means the course has nothing gradable in it (pure reading
  // material), which the result screen renders as a plain pass rather than
  // fabricating a percentage.
  const modules = course.modules || [];
  const courseScore = serverResult?.score ?? null;
  const coursePassed = serverResult?.passed ?? true;
  const weakModuleTitles: string[] = serverResult?.weakModules || [];

  const jumpToModule = (moduleTitle: string) => {
    let gi = 0;
    for (const mod of modules) {
      const modLessons = mod.lessons || [];
      if (mod.title === moduleTitle) { setCurrentIdx(gi); setShowCompleted(false); return; }
      gi += modLessons.length;
    }
  };

  // "Пройти тест снова" — clears this session's answers and drops the user
  // back at the first quiz. Lesson *completion* is left alone: it is the
  // server-tracked access gate, and passing has never been required to move
  // past a quiz. The stored score is left alone too — the server keeps the
  // best attempt, so a worse retake can't cost someone a result they already
  // earned (same rule as the lecture track).
  const retryQuizzes = () => {
    setQuizStates({});
    setServerResult(null);
    const firstQuizIdx = allLessons.findIndex((l: any) => l.type === 'quiz');
    setCurrentIdx(firstQuizIdx >= 0 ? firstQuizIdx : 0);
    setShowCompleted(false);
  };

  // Find module index for current lesson
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
    // A page that scrolls as one document, not two panes that scroll past
    // each other. The old shell pinned itself to the viewport and gave the
    // lesson its own scrollbar inside a column — which is why the course
    // never had room for a header above it.
    <div className="min-h-screen" style={{ background: PAGE_GRADIENT }}>
      <Navigation user={user} onLogout={onLogout} />

      <div className="max-w-7xl mx-auto px-8 pt-10 pb-16">
        <div className="flex items-start justify-between gap-4 mb-8 flex-wrap">
          <button
            onClick={() => navigate(`/custom-course/${id}`)}
            className="flex items-center gap-2 font-geist cursor-pointer transition-colors py-2"
            style={{ fontSize: 12, color: TEXT_MUTED, letterSpacing: TRACK_WIDE }}
            onMouseEnter={e => (e.currentTarget.style.color = TEXT_PRIMARY)}
            onMouseLeave={e => (e.currentTarget.style.color = TEXT_MUTED)}
          >
            <Icon name="chevronLeft" size={18} color="currentColor" /> ВЕРНУТЬСЯ К КУРСУ
          </button>

          <div className="flex items-center gap-3 flex-wrap justify-end">
            {/* Lead timer — its own component so the once-a-second tick doesn't re-render this whole page */}
            {user.role === 'lead' && (
              <LeadTimer startTimeMs={startTimeRef.current} color={color} />
            )}

            {/* Contents, behind a dropdown rather than a standing column.
                Hidden once the course is finished: a pass/fail screen is
                the endpoint, not a place to keep navigating from. */}
            {!showCompleted && (
            <div className="relative" ref={tocRef}>
              <button
                onClick={() => setTocOpen(o => !o)}
                aria-expanded={tocOpen}
                className="flex items-center justify-between gap-6 rounded-lg font-montserrat cursor-pointer transition-colors"
                style={{ minWidth: 280, height: 56, padding: '0 20px', fontSize: 16, fontWeight: 600, letterSpacing: '2px', color: TEXT_PRIMARY, background: CARD_BG, border: '1px solid rgba(197, 198, 199,0.12)', boxShadow: CARD_SHADOW }}
              >
                Содержание
                <Icon name={tocOpen ? 'chevronUp' : 'chevronDown'} size={22} color={color} />
              </button>

              {tocOpen && (
                <div
                  className="absolute right-0 top-full mt-2 z-30 rounded-lg overflow-y-auto"
                  style={{ width: 440, maxWidth: 'calc(100vw - 4rem)', maxHeight: '70vh', background: CARD_BG_PATTERN, border: `1px solid ${color}55`, boxShadow: '0 12px 28px rgba(0,0,0,0.5)' }}
                >
                  {/* What the standing course header used to say, said here
                      instead — the design gives the lesson the full width,
                      so the course's own name and size move in with the
                      contents rather than being dropped. */}
                  <div className="px-5 pt-5 pb-4" style={{ borderBottom: '1px solid rgba(197, 198, 199,0.08)' }}>
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <p className="font-montserrat break-words min-w-0" style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.3, letterSpacing: '2.2px', color: TEXT_PRIMARY }}>{course.title}</p>
                      {course.tag && (
                        <span className="font-geist font-semibold shrink-0" style={{ fontSize: 11, padding: '2px 8px', letterSpacing: '0.06em', ...tagChipStyle(color, course.tag) }}>{course.tag}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 flex-wrap mb-3 font-geist" style={{ fontSize: 11, color: TEXT_MUTED, letterSpacing: '1.2px' }}>
                      <span className="flex items-center gap-1.5"><BookOpenIcon size={13} color="currentColor" />{counted(totalLessons, ['УРОК', 'УРОКА', 'УРОКОВ'])}</span>
                      <span className="flex items-center gap-1.5"><PagesIcon size={13} color="currentColor" />{counted(moduleCount, ['МОДУЛЬ', 'МОДУЛЯ', 'МОДУЛЕЙ'])}</span>
                      <span className="flex items-center gap-1.5"><CapIcon size={13} color="currentColor" />{counted(quizCount, ['ТЕСТ', 'ТЕСТА', 'ТЕСТОВ'])}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(197, 198, 199,0.08)' }}>
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progressPercent}%`, background: color }} />
                      </div>
                      <span className="font-geist text-xs tabular-nums" style={{ color: TEXT_MUTED }}>{completedCount}/{totalLessons}</span>
                    </div>
                  </div>

                  <div className="py-3">
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
                      onClick={() => setExpandedModules(s => { const n = new Set(s); if (n.has(mi)) n.delete(mi); else n.add(mi); return n; })}
                      className="w-full flex items-start gap-2 px-5 py-2.5 text-left"
                    >
                      <span className="flex-shrink-0 mt-0.5" style={{ color }}><Icon name={isExpanded ? 'chevronUp' : 'chevronDown'} size={18} color="currentColor" /></span>
                      <span
                        className="flex-1 min-w-0 font-geist leading-relaxed break-words"
                        style={{ fontSize: 12, letterSpacing: '1.4px', fontWeight: isCurMod ? 700 : 500, color: isCurMod ? color : `${color}99` }}
                      >
                        {(mod.title || `Модуль ${mi + 1}`).toUpperCase()}
                      </span>
                      <span className="font-geist flex-shrink-0 mt-0.5" style={{ fontSize: 11, color: 'rgba(197, 198, 199,0.45)' }}>
                        {modLessons.filter((l: any) => completedLessons.has(l.id)).length}/{modLessons.length}
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
                          onClick={() => accessible && (setCurrentIdx(gi), setTocOpen(false))}
                          disabled={!accessible}
                          className="w-full flex items-start gap-2.5 pl-9 pr-5 py-1.5 text-left transition-all"
                          style={{ background: isCur ? `${color}15` : 'transparent', cursor: accessible ? 'pointer' : 'not-allowed' }}
                        >
                          <span className="flex-shrink-0 w-4 flex items-center justify-center mt-0.5">
                            {completed ? <DoubleCheckIcon size={15} color={color} /> : isCur ? <span style={{ color, fontSize: 11 }}>▸</span> : !accessible ? <LockIcon size={13} color={color} /> : <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'rgba(197, 198, 199,0.2)' }} />}
                          </span>
                          <span
                            className="font-geist leading-relaxed flex-1 min-w-0 flex items-start gap-1.5 break-words"
                            style={{ fontSize: 12, letterSpacing: '1.2px', color: isCur ? TEXT_PRIMARY : 'rgba(197, 198, 199,0.45)' }}
                          >
                            {lesson.type === 'quiz' && <PagesIcon size={12} color="currentColor" className="flex-shrink-0 mt-0.5" />}
                            {lesson.title}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
                  </div>
                </div>
              )}
            </div>
            )}
          </div>
        </div>

        <div>
          {/* A section, not a <main>: App.tsx marks the routed view as
              the page's main content, and there is only ever one of those. */}
          <section className="min-w-0 w-full">
            {showCompleted ? (
              <CourseResultScreen
                course={course}
                color={color}
                passed={coursePassed}
                score={courseScore}
                weakModules={weakModuleTitles}
                onRetry={retryQuizzes}
                onBackToCourse={() => navigate(`/custom-course/${id}`)}
                onNext={() => navigate('/zhukademia')}
                onModuleClick={jumpToModule}
              />
            ) : currentLesson ? (
              <div>
                {/* A quiz writes its own heading ("Тест: …"), so the page
                    does not put the same words above it a second time. */}
                {currentLesson.type !== 'quiz' && (
                  <h1 className="font-montserrat mb-6 break-words" style={{ ...H2 }}>{currentLesson.title}</h1>
                )}

                {currentLesson.prerequisite_type === 'optional' && currentLesson.prerequisite_note && (
                  <div
                    className="rounded-lg p-3 mb-6 flex items-start gap-2"
                    style={{ background: 'rgba(239,159,39,0.06)', border: '1px solid rgba(239,159,39,0.25)' }}
                  >
                    <Icon name="lightbulb" size={22} color="#EF9F27" style={{ flexShrink: 0 }} />
                    <p className="font-geist text-xs break-words min-w-0" style={{ color: 'rgba(197, 198, 199,0.7)' }}>{currentLesson.prerequisite_note}</p>
                  </div>
                )}

                {currentLesson.type === 'lesson' ? (
                  <>
                    <LessonContent content={currentLesson.content} />

                    {completeError && (
                      <p className="font-geist text-xs mt-4" style={{ color: ERROR }}>
                        Не удалось сохранить прогресс. Проверь соединение и попробуй ещё раз.
                      </p>
                    )}

                    {/* Both directions name the lesson they lead to, per
                        the design. "Назад"/"Далее" said only that something
                        came next, which the reader could already see. */}
                    <div className="flex items-center justify-between gap-4 mt-10 pt-6" style={{ borderTop: '1px solid rgba(197, 198, 199,0.07)' }}>
                      {prevLesson ? (
                        <button
                          onClick={() => isAccessible(currentIdx - 1) && setCurrentIdx(i => i - 1)}
                          className="font-geist flex items-center gap-2 min-w-0 transition-colors cursor-pointer"
                          style={{ fontSize: 13, letterSpacing: '1.2px', color: 'rgba(197, 198, 199,0.6)' }}
                          onMouseEnter={e => (e.currentTarget.style.color = TEXT_PRIMARY)}
                          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(197, 198, 199,0.6)')}
                        >
                          <Icon name="arrowLeft" size={20} color="currentColor" />
                          {/* A neutral label rather than the previous
                              lesson's title: at this width the title was
                              cut mid-word, and half a topic name reads as a
                              glitch rather than as a destination. */}
                          <span>Предыдущая тема</span>
                        </button>
                      ) : <div />}
                      {/* Outlined in the course's own colour rather than
                          filled with it, per the design — a solid block of
                          accent next to a page of body text pulled harder
                          than the thing it leads to deserves. */}
                      <button
                        onClick={() => markComplete(currentLesson.id)}
                        className="px-6 py-3 rounded-lg font-geist font-semibold text-sm transition-all hover:brightness-125 cursor-pointer flex items-center gap-2 min-w-0 shrink-0"
                        style={{ background: `${color}1F`, border: `1px solid ${color}`, color, letterSpacing: '1.2px' }}
                      >
                        {isLastLesson ? (
                          <><CheckCircleIcon size={16} color="currentColor" />Завершить курс</>
                        ) : (
                          <>
                            {nextLesson?.type === 'quiz' && <PagesIcon size={16} color="currentColor" className="shrink-0" />}
                            <span className="truncate" style={{ maxWidth: 260 }}>{nextLesson?.title || 'Далее'}</span>
                            <Icon name="arrowRight" size={20} color="currentColor" />
                          </>
                        )}
                      </button>
                    </div>
                  </>
                ) : (
                  <CustomQuizView
                    key={`${currentLesson.id}:${retakeCounts[currentIdx] || 0}`}
                    lesson={currentLesson}
                    quizState={quizStates[currentIdx] || emptyQuizState()}
                    onAnswer={(qi, oi) => patchQuiz(currentIdx, st => ({ answers: { ...st.answers, [qi]: oi }, error: '' }))}
                    onCheck={qi => checkAnswer(currentIdx, currentLesson, qi)}
                    onSubmit={() => submitQuiz(currentIdx, currentLesson)}
                    onNext={() => markComplete(currentLesson.id)}
                    onRetry={() => retakeQuiz(currentIdx)}
                    isLastLesson={isLastLesson}
                    color={color}
                  />
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center py-24">
                <p className="font-geist text-sm" style={{ color: TEXT_MUTED }}>Выбери урок в оглавлении</p>
              </div>
            )}
          </section>

        </div>

      </div>

      <NotesDrawer show={showNotes} onClose={() => setShowNotes(false)} notes={notes} setNotes={setNotes} currentLessonTitle={currentLesson?.title || ''} currentLessonId={currentLesson?.id} courseId={id || ''} />

      {!showNotes && (
        // Bottom *left*. The right-hand corner already has two tenants — the
        // frog and the toast stack — and squeezing a third in beside them
        // meant it sat over the lesson's own controls. The left corner is
        // empty on every page.
        <button onClick={() => setShowNotes(true)} className="fixed bottom-6 left-6 z-30 flex items-center gap-2 px-4 py-2.5 rounded-full font-sans text-sm font-semibold shadow-lg transition-all hover:brightness-110" style={{ background: CARD_BG, border: '1px solid rgba(197, 198, 199,0.12)', color: 'rgba(197, 198, 199,0.6)', boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>
          <Icon name="memo" size={22} color="currentColor" /> <span className="text-xs">Заметки</span>
          {notes.length > 0 && <span className="rounded-full w-4 h-4 flex items-center justify-center text-xs" style={{ background: color, color: '#0B0C10', fontSize: '0.6rem' }}>{notes.length}</span>}
        </button>
      )}
    </div>
  );
}
