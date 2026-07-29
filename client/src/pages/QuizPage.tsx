import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { testerApi } from '../api';
import { Question, QuestionExplanation } from '../types';
import SnailLoader from '../components/SnailLoader';
import PixelIcon from '../components/PixelIcon';

interface QuizPageProps {
  user: any;
  onLogout: () => void;
}

export default function QuizPage({ user, onLogout }: QuizPageProps) {
  const { id: lectureId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const progressKey = `quiz_progress_${user.id}_${lectureId}`;

  const [questions, setQuestions] = useState<Question[]>([]);
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

  useEffect(() => {
    loadQuestions();
  }, [lectureId]);

  const loadQuestions = async () => {
    setLoadError(false);
    try {
      const res = await testerApi.getQuestions(parseInt(lectureId!));
      setQuestions(res.data);

      // Resume an interrupted attempt (e.g. connection drop, accidental
      // navigation, browser crash) instead of silently discarding it.
      try {
        const saved = localStorage.getItem(progressKey);
        if (saved) {
          const savedAnswers: Record<number, string> = JSON.parse(saved);
          setAnswers(savedAnswers);
          const firstUnanswered = res.data.findIndex((q: Question) => !(q.id in savedAnswers));
          setCurrentQuestionIdx(firstUnanswered === -1 ? res.data.length - 1 : firstUnanswered);
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

  const handleSelectAnswer = async (answer: string, retrying = false) => {
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
      const res = await testerApi.submitTest(parseInt(lectureId!), answers);
      setResult(res.data);
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

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: '#0f0f1a' }}>
        {/* Mini header */}
        <header
          className="sticky top-0 z-50 px-6 py-3 flex justify-between items-center"
          style={{ background: '#1a1a2e', borderBottom: '2px solid #1D9E75' }}
        >
          <span className="font-pixel text-primary text-xs pixel-pulse">baga-net</span>
          <button onClick={onLogout} className="btn-secondary text-xs px-2 py-1">Выход</button>
        </header>
        <SnailLoader />
      </div>
    );
  }

  // ===== RESULT SCREEN =====
  if (result) {
    const score = Math.round(result.score);
    const passed = result.passed;
    return (
      <div className="min-h-screen flex flex-col" style={{ background: '#0f0f1a' }}>
        <header
          className="sticky top-0 z-50 px-6 py-3 flex justify-between items-center"
          style={{ background: '#1a1a2e', borderBottom: '2px solid #1D9E75' }}
        >
          <span className="font-pixel text-primary text-xs">baga-net</span>
          <button onClick={onLogout} className="btn-secondary text-xs px-2 py-1">Выход</button>
        </header>

        <div className="flex-1 flex items-center justify-center p-6">
          <div
            className="w-full max-w-md p-8 rounded text-center fade-in"
            style={{
              background: '#1a1a2e',
              boxShadow: passed
                ? '4px 0 0 0 #1D9E75, -4px 0 0 0 #1D9E75, 0 4px 0 0 #1D9E75, 0 -4px 0 0 #1D9E75'
                : '4px 0 0 0 #e05252, -4px 0 0 0 #e05252, 0 4px 0 0 #e05252, 0 -4px 0 0 #e05252',
            }}
          >
            <div className="mb-4 flex justify-center">
              <PixelIcon name={passed ? 'trophy' : 'warning'} size={52} color={passed ? '#EF9F27' : '#e05252'} />
            </div>
            <p
              className="font-pixel mb-2"
              style={{
                color: passed ? '#1D9E75' : '#e05252',
                fontSize: '0.65rem',
                lineHeight: 1.8,
              }}
            >
              {passed ? 'ТЕСТ ПРОЙДЕН!' : 'ТЕСТ НЕ СДАН'}
            </p>
            <p
              className="font-pixel mb-6"
              style={{
                color: passed ? '#1D9E75' : '#e05252',
                fontSize: '2.5rem',
                lineHeight: 1.4,
              }}
            >
              {score}%
            </p>
            <p className="text-pixel/60 text-sm font-sans mb-8">
              {passed
                ? 'Следующая лекция разблокирована!'
                : 'Нужно минимум 60%. Попробуй ещё раз!'}
            </p>

            <div className="flex gap-3 justify-center">
              <button
                onClick={() => navigate('/cabinet')}
                className="btn-primary"
              >
                Моя нора
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
                  <span className="flex items-center gap-1"><PixelIcon name="wrench" size={12} color="currentColor" /> Реанимация</span>
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
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: '#0f0f1a' }}>
        <p className="text-pixel/60 font-sans">
          {loadError ? 'Не удалось загрузить вопросы. Проверь соединение.' : 'Вопросы не найдены'}
        </p>
        {loadError && (
          <button onClick={() => { setLoading(true); loadQuestions(); }} className="btn-primary text-xs px-4 py-2">
            Попробовать снова
          </button>
        )}
      </div>
    );
  }

  const progPercent = ((currentQuestionIdx + 1) / questions.length) * 100;

  const optionsArray = [
    { key: 'a', text: currentQuestion.option_a },
    { key: 'b', text: currentQuestion.option_b },
    { key: 'c', text: currentQuestion.option_c },
    { key: 'd', text: currentQuestion.option_d },
  ];

  const isCorrect = explanation && selectedAnswer === explanation.correctAnswer;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#0f0f1a' }}>
      {/* Header */}
      <header
        className="sticky top-0 z-50 px-6 py-3 flex justify-between items-center"
        style={{ background: '#1a1a2e', borderBottom: '2px solid #1D9E75' }}
      >
        <span className="font-pixel text-primary text-xs">baga-net</span>
        <div className="flex items-center gap-3">
          <span className="text-pixel/60 text-xs font-sans">
            {currentQuestionIdx + 1}/{questions.length}
          </span>
          <button onClick={onLogout} className="btn-secondary text-xs px-2 py-1">Выход</button>
        </div>
      </header>

      {/* Progress bar */}
      <div style={{ background: '#0f0f1a', height: '6px' }}>
        <div
          className="h-full transition-all duration-300"
          style={{ width: `${progPercent}%`, background: '#1D9E75' }}
        />
      </div>

      {/* Content */}
      <div className="flex-1 max-w-3xl mx-auto w-full px-6 py-8">
        {/* Question number */}
        <div className="flex items-center justify-between mb-4">
          <p
            className="font-pixel text-pixel/55"
            style={{ fontSize: '0.55rem', lineHeight: 1.8 }}
          >
            ВОПРОС {currentQuestionIdx + 1}
          </p>
          <div className="xp-bar-track" style={{ width: '120px' }}>
            <div className="xp-bar-fill" style={{ width: `${progPercent}%` }} />
          </div>
        </div>

        {/* Question card */}
        <div
          className="p-6 rounded mb-6 fade-in"
          style={{
            background: '#1a1a2e',
            boxShadow: '2px 0 0 0 #1D9E75, -2px 0 0 0 #1D9E75, 0 2px 0 0 #1D9E75, 0 -2px 0 0 #1D9E75',
          }}
        >
          <h2 className="text-pixel font-sans font-semibold text-base leading-relaxed mb-6">
            {currentQuestion.question_text}
          </h2>

          {/* Options */}
          <div className="space-y-3">
            {optionsArray.map(option => {
              const isSelected = selectedAnswer === option.key;
              const isCorrectAnswer = showExplanation && explanation?.correctAnswer === option.key;
              const isWrongAnswer = showExplanation && isSelected && !isCorrect;

              let borderColor = 'rgba(232,232,208,0.15)';
              let bgColor = 'transparent';
              if (isCorrectAnswer && showExplanation) {
                borderColor = '#1D9E75';
                bgColor = 'rgba(29,158,117,0.1)';
              } else if (isWrongAnswer) {
                borderColor = '#e05252';
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
                  className="w-full p-4 rounded text-left transition-all cursor-pointer disabled:cursor-default"
                  style={{
                    background: bgColor,
                    boxShadow: `1px 0 0 0 ${borderColor}, -1px 0 0 0 ${borderColor}, 0 1px 0 0 ${borderColor}, 0 -1px 0 0 ${borderColor}`,
                  }}
                >
                  <div className="flex gap-3 items-start">
                    <span
                      className="shrink-0 w-7 h-7 rounded flex items-center justify-center text-xs font-pixel"
                      style={{
                        background: isCorrectAnswer && showExplanation ? '#1D9E75' : isWrongAnswer ? '#e05252' : isSelected ? '#EF9F27' : 'rgba(232,232,208,0.08)',
                        color: (isCorrectAnswer && showExplanation) || isWrongAnswer || isSelected ? '#0f0f1a' : 'rgba(232,232,208,0.4)',
                        fontSize: '0.62rem',
                        lineHeight: 1.8,
                      }}
                    >
                      {option.key.toUpperCase()}
                    </span>
                    <span className="text-pixel font-sans text-sm leading-relaxed">
                      {option.text}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Explanation failed to load — don't block progress, just say so */}
          {showExplanation && explanationFailed && (
            <div
              className="mt-6 p-4 rounded fade-in"
              style={{ background: 'rgba(232,232,208,0.04)', boxShadow: '1px 0 0 0 rgba(232,232,208,0.15), -1px 0 0 0 rgba(232,232,208,0.15), 0 1px 0 0 rgba(232,232,208,0.15), 0 -1px 0 0 rgba(232,232,208,0.15)' }}
            >
              <p className="text-pixel/60 text-sm font-sans">
                Не удалось загрузить объяснение — но можно двигаться дальше, ответ уже сохранён.
              </p>
            </div>
          )}

          {/* Explanation */}
          {showExplanation && explanation && (
            <div
              className="mt-6 p-4 rounded fade-in"
              style={{
                background: isCorrect ? 'rgba(29,158,117,0.08)' : 'rgba(224,82,82,0.08)',
                boxShadow: `1px 0 0 0 ${isCorrect ? '#1D9E75' : '#e05252'}, -1px 0 0 0 ${isCorrect ? '#1D9E75' : '#e05252'}, 0 1px 0 0 ${isCorrect ? '#1D9E75' : '#e05252'}, 0 -1px 0 0 ${isCorrect ? '#1D9E75' : '#e05252'}`,
              }}
            >
              <p
                className="font-pixel mb-2"
                style={{
                  color: isCorrect ? '#1D9E75' : '#e05252',
                  fontSize: '0.5rem',
                  lineHeight: 1.8,
                }}
              >
                {isCorrect ? '✓ ВЕРНО!' : '✗ НЕВЕРНО'}
              </p>
              <p className="text-pixel/70 text-sm font-sans mb-2">{explanation.explanation}</p>
              <p className="text-pixel/60 text-xs font-sans">
                Правильный ответ:{' '}
                <span className="text-primary font-semibold">
                  {explanation.correctAnswer.toUpperCase()}. {explanation.correctOption}
                </span>
              </p>
            </div>
          )}

          {/* Submit error — answers stay saved, retry doesn't lose anything */}
          {submitError && (
            <div
              className="mt-4 p-4 rounded fade-in"
              style={{ background: 'rgba(239,159,39,0.08)', boxShadow: '1px 0 0 0 #EF9F27, -1px 0 0 0 #EF9F27, 0 1px 0 0 #EF9F27, 0 -1px 0 0 #EF9F27' }}
            >
              <p className="text-sm font-sans" style={{ color: '#EF9F27' }}>{submitError}</p>
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
                ? <span className="pixel-pulse flex items-center justify-center gap-1"><PixelIcon name="snail" size={13} color="currentColor" /> ползём...</span>
                : submitError
                ? 'Попробовать снова'
                : currentQuestionIdx === questions.length - 1
                ? 'Завершить тест'
                : 'Следующий →'
              }
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
