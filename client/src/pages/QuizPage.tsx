import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { testerApi } from '../api';
import { Question, QuestionExplanation } from '../types';

interface QuizPageProps {
  user: any;
  onLogout: () => void;
}

export default function QuizPage({ user, onLogout }: QuizPageProps) {
  const { id: lectureId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [showExplanation, setShowExplanation] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<QuestionExplanation | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    loadQuestions();
  }, [lectureId]);

  const loadQuestions = async () => {
    try {
      const res = await testerApi.getQuestions(parseInt(lectureId!));
      setQuestions(res.data);
      setLoading(false);
    } catch (err) {
      console.error('Error loading questions:', err);
      setLoading(false);
    }
  };

  const currentQuestion = questions[currentQuestionIdx];

  const handleSelectAnswer = async (answer: string) => {
    setSelectedAnswer(answer);
    setAnswers(prev => ({ ...prev, [currentQuestion.id]: answer }));

    // Get explanation
    try {
      const res = await testerApi.getExplanation(parseInt(lectureId!), currentQuestion.id);
      setExplanation(res.data);
      setShowExplanation(true);
    } catch (err) {
      console.error('Error loading explanation:', err);
    }
  };

  const handleNext = () => {
    if (currentQuestionIdx < questions.length - 1) {
      setCurrentQuestionIdx(prev => prev + 1);
      setShowExplanation(false);
      setSelectedAnswer(null);
      setExplanation(null);
    } else {
      handleSubmitTest();
    }
  };

  const handleSubmitTest = async () => {
    setSubmitting(true);
    try {
      const res = await testerApi.submitTest(parseInt(lectureId!), answers);
      setResult(res.data);
    } catch (err) {
      console.error('Error submitting test:', err);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-screen">Загрузка...</div>;
  }

  if (result) {
    return (
      <div className="flex justify-center items-center bg-gradient-to-br from-primary to-teal-900 p-4 min-h-screen">
        <div className="bg-white shadow-lg p-8 rounded-lg w-full max-w-md">
          <h1 className="mb-4 font-bold text-3xl text-center">
            {result.passed ? '✓ Тест пройден!' : '✗ Тест не пройден'}
          </h1>
          <p className="mb-2 font-bold text-primary text-6xl text-center">
            {Math.round(result.score)}%
          </p>
          <p className="mb-8 text-gray-600 text-center">
            Нужно 60% для прохождения лекции{result.passed ? '' : ' (нужно еще уточнить)'}
          </p>

          <button
            onClick={() => navigate('/cabinet')}
            className="w-full font-semibold btn-primary"
          >
            Вернуться в кабинет
          </button>
        </div>
      </div>
    );
  }

  if (!currentQuestion) {
    return <div className="flex justify-center items-center h-screen">Нет вопросов</div>;
  }

  const optionsArray = [
    { key: 'a', text: currentQuestion.option_a },
    { key: 'b', text: currentQuestion.option_b },
    { key: 'c', text: currentQuestion.option_c },
    { key: 'd', text: currentQuestion.option_d },
  ];

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Header */}
      <header className="bg-white border-gray-200 border-b">
        <div className="flex justify-between items-center mx-auto px-6 py-4 max-w-4xl">
          <h1 className="font-bold text-gray-900 text-xl">QA Learning Hub</h1>
          <button
            onClick={onLogout}
            className="text-sm btn-secondary"
          >
            Выход
          </button>
        </div>
      </header>

      {/* Quiz Content */}
      <div className="mx-auto px-6 py-8 max-w-4xl">
        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-2">
            <span className="font-medium text-gray-900 text-sm">
              Вопрос {currentQuestionIdx + 1} из {questions.length}
            </span>
            <span className="font-medium text-gray-600 text-sm">
              {Math.round(((currentQuestionIdx + 1) / questions.length) * 100)}%
            </span>
          </div>
          <div className="bg-gray-300 rounded-full h-2 overflow-hidden">
            <div
              className="bg-primary h-full transition-all"
              style={{
                width: `${((currentQuestionIdx + 1) / questions.length) * 100}%`,
              }}
            />
          </div>
        </div>

        {/* Question Card */}
        <div className="card">
          <h2 className="mb-6 font-bold text-gray-900 text-xl">
            {currentQuestion.question_text}
          </h2>

          {/* Options */}
          <div className="space-y-3 mb-6">
            {optionsArray.map(option => (
              <button
                key={option.key}
                onClick={() => !showExplanation && handleSelectAnswer(option.key)}
                disabled={showExplanation}
                className={`w-full p-4 text-left border-2 rounded-lg transition ${
                  selectedAnswer === option.key
                    ? 'border-primary bg-primary/10'
                    : 'border-gray-200 hover:border-gray-300'
                } disabled:opacity-50`}
              >
                <div className="font-semibold text-gray-900">
                  {option.key.toUpperCase()}.
                </div>
                <div className="text-gray-700">
                  {option.text}
                </div>
              </button>
            ))}
          </div>

          {/* Explanation */}
          {showExplanation && explanation && (
            <div className="bg-blue-50 mb-6 p-4 border border-blue-200 rounded-lg">
              <p className="mb-2 font-semibold text-blue-900 text-sm">Объяснение:</p>
              <p className="text-blue-800 text-sm">
                {explanation.explanation}
              </p>
              <p className="mt-2 text-blue-800 text-sm">
                <strong>Правильный ответ:</strong> {explanation.correctAnswer.toUpperCase()} - {explanation.correctOption}
              </p>
            </div>
          )}

          {/* Navigation */}
          {showExplanation && (
            <button
              onClick={handleNext}
              disabled={submitting}
              className="disabled:opacity-50 w-full font-semibold btn-primary"
            >
              {submitting ? 'Загрузка...' : currentQuestionIdx === questions.length - 1 ? 'Завершить тест' : 'Далее'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
