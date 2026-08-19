import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState, useRef, useMemo } from 'react';
import { testerApi } from '../api';
import { Question, QuestionExplanation, Lecture } from '../types';
import FrogLoader from '../components/FrogLoader';
import Icon from '../components/Icon';
import Navigation from '../components/Navigation';
import { BookOpenIcon, CheckCircleIcon } from '../components/CatalogIcons';
import { getTopicTag, getCourseTagColor } from '../utils/topics';
import { celebrateAchievements } from '../utils/achievements';
import { PAGE_GRADIENT, PAGE_BG, CARD_BG, TEXT_PRIMARY, TEXT_MUTED, ACCENT, TRACK_WIDE, ERROR } from '../utils/theme';

interface QuizPageProps {
  user: any;
  onLogout: () => void;
}

// Fisher-Yates — used to shuffle question and answer-option display order
// per attempt. Scoring is untouched by this: answers are always recorded
// against the option's original key ('a'/'b'/'c'/'d'), never its display
// position, so shuffling can't affect correctness — it only makes a
// memorized "answer sequence" (shared between testers) useless.
// YouTube/Drive embed reliably cross-domain; VK/Яндекс.Диск links don't
// have a dependable universal iframe pattern, so those just get an
// external "open" link instead of a possibly-broken embed.
function toEmbedUrl(url: string): string | null {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const drive = url.match(/drive\.google\.com\/file\/d\/([\w-]+)/);
  if (drive) return `https://drive.google.com/file/d/${drive[1]}/preview`;
  return null;
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default function QuizPage({ user, onLogout }: QuizPageProps) {
  const { id: lectureId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const progressKey = `quiz_progress_${user.id}_${lectureId}`;

  const [questions, setQuestions] = useState<Question[]>([]);
  const [lecture, setLecture] = useState<Lecture | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [showExplanation, setShowExplanation] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<QuestionExplanation | null>(null);
  const [explanationFailed, setExplanationFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [loadError, setLoadError] = useState(false);

  // Anti-cheat / review signals — never block submission, just give a lead
  // something to look at. questionTimes: seconds spent per question id.
  // tabSwitches: how many times the tab lost focus during the attempt
  // (e.g. looking up an answer elsewhere). Both are soft signals shown next
  // to the result, not an accusation — fast or tab-switching testers aren't
  // necessarily cheating.
  const questionTimesRef = useRef<Record<number, number>>({});
  const questionStartRef = useRef<number>(Date.now());
  const tabSwitchesRef = useRef(0);

  useEffect(() => {
    loadQuestions();
  }, [lectureId]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) tabSwitchesRef.current += 1;
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const loadQuestions = async () => {
    setLoadError(false);
    try {
      // Kept as a separate request from getQuestions (whose response is a
      // bare question array, not an object) rather than folding video_url
      // into it — reshaping that response would be a breaking change for
      // every existing caller. Also powers the course-card header above the
      // quiz (title/tag), so the whole lecture row is kept, not just video_url.
      testerApi.getLecture(parseInt(lectureId!)).then(r => { setLecture(r.data); setVideoUrl(r.data.video_url || null); }).catch(() => {});
      const res = await testerApi.getQuestions(parseInt(lectureId!));
      const shuffled = shuffle<Question>(res.data);
      setQuestions(shuffled);
      questionStartRef.current = Date.now();

      // Resume an interrupted attempt (e.g. connection drop, accidental
      // navigation, browser crash) instead of silently discarding it.
      try {
        const saved = localStorage.getItem(progressKey);
        if (saved) {
          const savedAnswers: Record<number, string> = JSON.parse(saved);
          setAnswers(savedAnswers);
          const firstUnanswered = shuffled.findIndex((q: Question) => !(q.id in savedAnswers));
          setCurrentQuestionIdx(firstUnanswered === -1 ? shuffled.length - 1 : firstUnanswered);
        }
      } catch {
        // Corrupted saved progress shouldn't block starting a fresh attempt.
        localStorage.removeItem(progressKey);
      }
    } catch (err) {
      console.error(err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const currentQuestion = questions[currentQuestionIdx];

  // Shuffled once per question (stable across re-renders of the same
  // question via useMemo keyed on its id) — see the shuffle() comment above
  // for why this can't affect scoring. Must be called unconditionally
  // (before the loading/result/no-question early returns below) per the
  // rules of hooks — guards internally instead of skipping the call.
  const optionsArray = useMemo(() => currentQuestion ? shuffle([
    { key: 'a', text: currentQuestion.option_a },
    { key: 'b', text: currentQuestion.option_b },
    { key: 'c', text: currentQuestion.option_c },
    { key: 'd', text: currentQuestion.option_d },
  ]) : [], [currentQuestion?.id]);

  const handleSelectAnswer = async (answer: string, retrying = false) => {
    if (!retrying) {
      const elapsed = Math.round((Date.now() - questionStartRef.current) / 1000);
      questionTimesRef.current[currentQuestion.id] = (questionTimesRef.current[currentQuestion.id] || 0) + elapsed;
    }
    setSelectedAnswer(answer);
    setExplanationFailed(false);
    const nextAnswers = { ...answers, [currentQuestion.id]: answer };
    setAnswers(nextAnswers);
    // Save immediately so a refresh/crash right after answering still resumes correctly.
    localStorage.setItem(progressKey, JSON.stringify(nextAnswers));

    try {
      const res = await testerApi.getExplanation(parseInt(lectureId!), currentQuestion.id);
      setExplanation(res.data);
      setShowExplanation(true);
    } catch (err) {
      console.error(err);
      if (!retrying) {
        // One silent retry handles a transient blip without bothering the user.
        return handleSelectAnswer(answer, true);
      }
      // The explanation is supplementary — don't let it block progress through the quiz.
      setExplanation(null);
      setExplanationFailed(true);
      setShowExplanation(true);
    }
  };

  const handleNext = () => {
    if (currentQuestionIdx < questions.length - 1) {
      setCurrentQuestionIdx(prev => prev + 1);
      questionStartRef.current = Date.now();
      setShowExplanation(false);
      setSelectedAnswer(null);
      setExplanation(null);
      setExplanationFailed(false);
    } else {
      handleSubmitTest();
    }
  };

  const handleSubmitTest = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await testerApi.submitTest(parseInt(lectureId!), answers, {
        questionTimes: questionTimesRef.current,
        tabSwitches: tabSwitchesRef.current,
      });
      setResult(res.data);
      celebrateAchievements(res.data.newAchievements);
      localStorage.removeItem(progressKey);
    } catch (err: any) {
      console.error(err);
      setSubmitError(
        err.response
          ? 'Не удалось отправить тест. Попробуй ещё раз.'
          : 'Нет соединения с сервером. Ответы сохранены — попробуй ещё раз, когда связь восстановится.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const tag = lecture ? getTopicTag(lecture.skill_area) : null;
  const tagColor = tag ? getCourseTagColor(tag) : ACCENT;

  // Small course-context card + back link shown above the quiz — same
  // hero language as the course catalog/detail pages, just compact, so the
  // quiz doesn't feel like a separate mini-app bolted onto the site.
  function CourseHeader() {
    if (!lecture) return null;
    return (
      <div className="mb-6">
        <button
          onClick={() => navigate('/zhukademia')}
          className="flex items-center gap-2 font-geist text-sm mb-4 transition-colors cursor-pointer"
          style={{ color: 'rgba(197, 198, 199,0.6)' }}
          onMouseEnter={e => (e.currentTarget.style.color = TEXT_PRIMARY)}
          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(197, 198, 199,0.6)')}
        >
          <Icon name="chevronLeft" size={22} color="currentColor" /> Вернуться к курсу
        </button>
        <div
          className="rounded-lg px-5 py-4 flex items-center gap-3"
          style={{ background: CARD_BG, border: `1px solid ${tagColor}`, boxShadow: '0 6px 12px 0 rgba(0, 0, 0, 0.25)' }}
        >
          <BookOpenIcon size={20} color={tagColor} />
          {tag && (
            <span className="font-geist font-semibold rounded px-2 py-0.5 shrink-0" style={{ fontSize: 11, background: `${tagColor}20`, color: tagColor, border: `1px solid ${tagColor}55` }}>
              {tag}
            </span>
          )}
          <span className="font-montserrat font-semibold truncate" style={{ fontSize: 16, color: TEXT_PRIMARY }}>{lecture.title}</span>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: PAGE_GRADIENT }}>
        <Navigation user={user} onLogout={onLogout} />
        <FrogLoader />
      </div>
    );
  }

  // ===== RESULT SCREEN =====
  if (result) {
    const score = Math.round(result.score);
    const passed = result.passed;
    return (
      <div className="min-h-screen flex flex-col" style={{ background: PAGE_GRADIENT }}>
        <Navigation user={user} onLogout={onLogout} />

        <div className="flex-1 flex items-center justify-center p-6">
          <div
            className="w-full max-w-md p-8 rounded-lg text-center fade-in"
            style={{
              background: CARD_BG,
              border: passed ? `1px solid ${ACCENT}` : `1px solid ${ERROR}`,
              boxShadow: '0 8px 12px 0 rgba(0, 0, 0, 0.25)',
            }}
          >
            <div className="mb-4 flex justify-center">
              <Icon name={passed ? 'trophy' : 'warning'} size={52} color={passed ? '#EF9F27' : ERROR} />
            </div>
            <p className="font-montserrat font-bold mb-2" style={{ color: passed ? ACCENT : ERROR, fontSize: 20, letterSpacing: TRACK_WIDE }}>
              {passed ? 'ТЕСТ ПРОЙДЕН!' : 'ТЕСТ НЕ СДАН'}
            </p>
            <p className="font-montserrat font-extrabold mb-6" style={{ color: passed ? ACCENT : ERROR, fontSize: 44 }}>
              {score}%
            </p>
            <p className="font-geist text-sm mb-8" style={{ color: TEXT_MUTED }}>
              {passed
                ? 'Следующая лекция разблокирована!'
                : 'Нужно минимум 60%. Попробуй ещё раз!'}
            </p>

            <div className="flex gap-3 justify-center">
              <button
                onClick={() => navigate('/cabinet')}
                className="btn-primary"
              >
                Моё болото
              </button>
              {!passed && (
                <button
                  onClick={() => {
                    localStorage.removeItem(progressKey);
                    setResult(null);
                    setCurrentQuestionIdx(0);
                    setAnswers({});
                    setShowExplanation(false);
                    setSelectedAnswer(null);
                    setExplanation(null);
                  }}
                  className="btn-secondary"
                >
                  <span className="flex items-center gap-1"><Icon name="wrench" size={22} color="currentColor" /> Реанимация</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!currentQuestion) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: PAGE_GRADIENT }}>
        <Navigation user={user} onLogout={onLogout} />
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <p className="font-geist" style={{ color: TEXT_MUTED }}>
            {loadError ? 'Не удалось загрузить вопросы. Проверь соединение.' : 'Вопросы не найдены'}
          </p>
          {loadError && (
            <button onClick={() => { setLoading(true); loadQuestions(); }} className="btn-primary text-xs px-4 py-2">
              Попробовать снова
            </button>
          )}
        </div>
      </div>
    );
  }

  const progPercent = ((currentQuestionIdx + 1) / questions.length) * 100;

  const isCorrect = explanation && selectedAnswer === explanation.correctAnswer;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: PAGE_GRADIENT }}>
      <Navigation user={user} onLogout={onLogout} />

      {/* Progress bar */}
      <div style={{ background: 'rgba(197, 198, 199,0.08)', height: '4px' }}>
        <div className="h-full transition-all duration-300" style={{ width: `${progPercent}%`, background: ACCENT }} />
      </div>

      {/* Content */}
      <div className="flex-1 max-w-3xl mx-auto w-full px-8 py-10">
        <CourseHeader />

        {/* Video — shown once, above the first question */}
        {currentQuestionIdx === 0 && videoUrl && (() => {
          const embed = toEmbedUrl(videoUrl);
          return (
            <div className="mb-6 rounded-lg overflow-hidden" style={{ border: `1px solid ${ACCENT}`, boxShadow: '0 6px 12px 0 rgba(0, 0, 0, 0.25)' }}>
              {embed ? (
                <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0 }}>
                  <iframe
                    src={embed}
                    title="Видео лекции"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
                  />
                </div>
              ) : (
                <a
                  href={videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 p-4 font-geist"
                  style={{ background: CARD_BG, color: ACCENT }}
                >
                  <Icon name="camera" size={22} color="currentColor" /> Открыть видео лекции <Icon name="chevronRight" size={22} color="currentColor" />
                </a>
              )}
            </div>
          );
        })()}

        {/* Question number */}
        <div className="flex items-center justify-between mb-4">
          <p className="font-montserrat font-bold" style={{ fontSize: 18, color: TEXT_PRIMARY, letterSpacing: TRACK_WIDE }}>
            Тест: Итоговый тест
          </p>
          <span className="font-geist text-sm shrink-0" style={{ color: TEXT_MUTED }}>{currentQuestionIdx + 1}/{questions.length}</span>
        </div>

        {/* Question card */}
        <div
          className="p-6 rounded-lg mb-6 fade-in"
          style={{ background: CARD_BG, border: `1px solid ${ACCENT}`, boxShadow: '0 6px 12px 0 rgba(0, 0, 0, 0.25)' }}
        >
          <h2 className="font-geist font-semibold text-base leading-relaxed mb-6 flex gap-2" style={{ color: TEXT_PRIMARY }}>
            <span className="shrink-0 w-6 h-6 rounded flex items-center justify-center font-geist font-bold" style={{ fontSize: 12, background: ACCENT, color: PAGE_BG }}>{currentQuestionIdx + 1}</span>
            <span className="break-words min-w-0">{currentQuestion.question_text}</span>
          </h2>

          {/* Options */}
          <div className="space-y-3">
            {optionsArray.map(option => {
              const isSelected = selectedAnswer === option.key;
              const isCorrectAnswer = showExplanation && explanation?.correctAnswer === option.key;
              const isWrongAnswer = showExplanation && isSelected && !isCorrect;

              let borderColor = 'rgba(197, 198, 199,0.15)';
              let bgColor = 'transparent';
              if (isCorrectAnswer && showExplanation) {
                borderColor = ACCENT;
                bgColor = 'rgba(102, 252, 241,0.1)';
              } else if (isWrongAnswer) {
                borderColor = ERROR;
                bgColor = 'rgba(224,82,82,0.1)';
              } else if (isSelected) {
                borderColor = '#EF9F27';
                bgColor = 'rgba(239,159,39,0.1)';
              }

              return (
                <button
                  key={option.key}
                  onClick={() => !showExplanation && handleSelectAnswer(option.key)}
                  disabled={showExplanation}
                  className="w-full p-4 rounded-lg text-left transition-all cursor-pointer disabled:cursor-default"
                  style={{ background: bgColor, border: `1px solid ${borderColor}` }}
                >
                  <div className="flex gap-3 items-center">
                    <span
                      className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-geist font-bold"
                      style={{
                        background: 'transparent',
                        border: `1.5px solid ${(isCorrectAnswer && showExplanation) || isWrongAnswer || isSelected ? borderColor : 'rgba(197, 198, 199,0.3)'}`,
                        color: (isCorrectAnswer && showExplanation) || isWrongAnswer || isSelected ? borderColor : 'rgba(197, 198, 199,0.5)',
                      }}
                    >
                      {isCorrectAnswer && showExplanation ? <CheckCircleIcon size={14} color={ACCENT} /> : isWrongAnswer ? '✗' : option.key.toUpperCase()}
                    </span>
                    <span className="font-geist text-sm leading-relaxed break-words min-w-0" style={{ color: TEXT_PRIMARY }}>
                      {option.text}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Explanation failed to load — don't block progress, just say so */}
          {showExplanation && explanationFailed && (
            <div className="mt-6 p-4 rounded-lg fade-in" style={{ background: 'rgba(197, 198, 199,0.04)', border: '1px solid rgba(197, 198, 199,0.15)' }}>
              <p className="font-geist text-sm" style={{ color: TEXT_MUTED }}>
                Не удалось загрузить объяснение — но можно двигаться дальше, ответ уже сохранён.
              </p>
            </div>
          )}

          {/* Explanation */}
          {showExplanation && explanation && (
            <div
              className="mt-6 p-4 rounded-lg fade-in"
              style={{
                background: isCorrect ? 'rgba(102, 252, 241,0.08)' : 'rgba(224,82,82,0.08)',
                border: `1px solid ${isCorrect ? ACCENT : ERROR}`,
              }}
            >
              <p className="font-montserrat font-bold mb-2" style={{ color: isCorrect ? ACCENT : ERROR, fontSize: 14, letterSpacing: TRACK_WIDE }}>
                {isCorrect ? '✓ Верно!' : `✗ Правильный ответ: ${explanation.correctAnswer.toUpperCase()}`}
              </p>
              <p className="font-geist text-sm mb-2 break-words" style={{ color: 'rgba(197, 198, 199,0.85)' }}>{explanation.explanation}</p>
              <p className="font-geist text-xs" style={{ color: TEXT_MUTED }}>
                Правильный ответ:{' '}
                <span className="font-semibold break-words" style={{ color: ACCENT }}>
                  {explanation.correctAnswer.toUpperCase()}. {explanation.correctOption}
                </span>
              </p>
            </div>
          )}

          {/* Submit error — answers stay saved, retry doesn't lose anything */}
          {submitError && (
            <div className="mt-4 p-4 rounded-lg fade-in" style={{ background: 'rgba(239,159,39,0.08)', border: '1px solid #EF9F27' }}>
              <p className="font-geist text-sm" style={{ color: '#EF9F27' }}>{submitError}</p>
            </div>
          )}

          {/* Next button */}
          {showExplanation && (
            <button
              onClick={handleNext}
              disabled={submitting}
              className="btn-primary w-full mt-6 disabled:opacity-50"
            >
              {submitting
                ? <span className="pixel-pulse flex items-center justify-center gap-1"><Icon name="frog" size={13} color="currentColor" /> скачем...</span>
                : submitError
                ? 'Попробовать снова'
                : currentQuestionIdx === questions.length - 1
                ? 'Завершить тест'
                : <span className="flex items-center justify-center gap-1">Следующий вопрос <Icon name="chevronRight" size={22} color="currentColor" /></span>
              }
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
