import { useState } from 'react';
import { testerApi } from '../api';

interface BaselineSurveyProps {
  onComplete: () => void;
}

export default function BaselineSurvey({ onComplete }: BaselineSurveyProps) {
  const [scores, setScores] = useState({
    html_structure: 3,
    css_reading: 3,
    devtools: 3,
    console_errors: 3,
    bug_report_quality: 3,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (key: keyof typeof scores, value: number) => {
    setScores(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await testerApi.submitBaselineSurvey(scores);
      onComplete();
    } catch (err: any) {
      setError('Ошибка при отправке анкеты');
    } finally {
      setLoading(false);
    }
  };

  const skills = [
    { key: 'html_structure', label: 'HTML структура' },
    { key: 'css_reading', label: 'Чтение CSS' },
    { key: 'devtools', label: 'DevTools' },
    { key: 'console_errors', label: 'Ошибки консоли' },
    { key: 'bug_report_quality', label: 'Качество отчётов об ошибках' },
  ];

  return (
    <div className="flex justify-center items-center bg-gradient-to-br from-primary to-teal-900 p-4 min-h-screen">
      <div className="bg-white shadow-lg p-8 rounded-lg w-full max-w-2xl">
        <h1 className="mb-2 font-bold text-gray-900 text-3xl">Начальная оценка навыков</h1>
        <p className="mb-8 text-gray-600">
          Оцените ваши текущие знания по шкале от 1 до 5. Это поможет отследить ваш прогресс.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-100 p-3 rounded text-red-700">
              {error}
            </div>
          )}

          {skills.map(skill => (
            <div key={skill.key}>
              <label className="block mb-3 font-medium text-gray-900">
                {skill.label}
              </label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map(num => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => handleChange(skill.key as keyof typeof scores, num)}
                    className={`w-12 h-12 rounded-lg font-semibold transition ${
                      scores[skill.key as keyof typeof scores] === num
                        ? 'bg-primary text-white'
                        : 'bg-gray-200 text-gray-900 hover:bg-gray-300'
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>
          ))}

          <button
            type="submit"
            disabled={loading}
            className="disabled:opacity-50 mt-8 w-full font-semibold btn-primary"
          >
            {loading ? 'Сохранение...' : 'Начать обучение'}
          </button>
        </form>
      </div>
    </div>
  );
}
