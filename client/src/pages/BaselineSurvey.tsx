import { useState } from 'react';
import { testerApi } from '../api';
import PixelIcon, { IconName } from '../components/PixelIcon';

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
    } catch {
      setError('Ошибка при отправке анкеты');
    } finally {
      setLoading(false);
    }
  };

  const skills: { key: string; label: string; icon: IconName; desc: string }[] = [
    { key: 'html_structure', label: 'HTML структура', icon: 'construction', desc: 'Понимание тегов, семантики, атрибутов' },
    { key: 'css_reading', label: 'Чтение CSS', icon: 'palette', desc: 'Чтение и понимание стилей' },
    { key: 'devtools', label: 'DevTools', icon: 'wrench', desc: 'Работа с инструментами разработчика' },
    { key: 'console_errors', label: 'Ошибки консоли', icon: 'warning', desc: 'Чтение и понимание ошибок JS' },
    { key: 'bug_report_quality', label: 'Баг-репорты', icon: 'bug', desc: 'Умение описывать дефекты' },
  ];

  const LABELS = ['1 — новичок', '2 — знаком', '3 — понимаю', '4 — уверен', '5 — эксперт'];

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: '#0f0f1a' }}
    >
      {/* Background grid */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: 'linear-gradient(#1D9E75 1px, transparent 1px), linear-gradient(90deg, #1D9E75 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      <div className="w-full max-w-2xl relative z-10 fade-in">
        {/* Header */}
        <div className="text-center mb-8">
          <p className="font-pixel text-primary text-xs mb-3 pixel-pulse" style={{ lineHeight: 1.8 }}>
            baga-net
          </p>
          <h1
            className="font-pixel text-pixel mb-2"
            style={{ fontSize: '0.75rem', lineHeight: 1.8 }}
          >
            НАЧАЛЬНАЯ ОЦЕНКА
          </h1>
          <p className="text-pixel/60 text-sm font-sans">
            Оцени текущий уровень — это поможет отследить твой рост
          </p>
        </div>

        {/* Card */}
        <div
          className="p-8 rounded"
          style={{
            background: '#1a1a2e',
            boxShadow: '4px 0 0 0 #EF9F27, -4px 0 0 0 #EF9F27, 0 4px 0 0 #EF9F27, 0 -4px 0 0 #EF9F27',
          }}
        >
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div
                className="px-4 py-3 rounded text-sm font-sans"
                style={{
                  background: 'rgba(224,82,82,0.1)',
                  color: '#e05252',
                  boxShadow: '1px 0 0 0 #e05252, -1px 0 0 0 #e05252, 0 1px 0 0 #e05252, 0 -1px 0 0 #e05252',
                }}
              >
                {error}
              </div>
            )}

            {skills.map(skill => (
              <div key={skill.key}>
                <div className="flex items-center gap-2 mb-3">
                  <PixelIcon name={skill.icon} size={14} color="#EF9F27" />
                  <div>
                    <p className="text-pixel font-sans font-semibold text-sm">{skill.label}</p>
                    <p className="text-pixel/60 text-xs font-sans">{skill.desc}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map(num => {
                    const isSelected = scores[skill.key as keyof typeof scores] === num;
                    return (
                      <button
                        key={num}
                        type="button"
                        onClick={() => handleChange(skill.key as keyof typeof scores, num)}
                        className="flex-1 py-2 rounded transition-all cursor-pointer relative group"
                        style={{
                          background: isSelected ? '#EF9F27' : '#0f0f1a',
                          boxShadow: isSelected
                            ? '2px 0 0 0 #EF9F27, -2px 0 0 0 #EF9F27, 0 2px 0 0 #EF9F27, 0 -2px 0 0 #EF9F27'
                            : '2px 0 0 0 rgba(239,159,39,0.2), -2px 0 0 0 rgba(239,159,39,0.2), 0 2px 0 0 rgba(239,159,39,0.2), 0 -2px 0 0 rgba(239,159,39,0.2)',
                          color: isSelected ? '#0f0f1a' : 'rgba(239,159,39,0.4)',
                        }}
                        title={LABELS[num - 1]}
                      >
                        <span className="font-pixel text-xs" style={{ lineHeight: 1.8 }}>{num}</span>
                      </button>
                    );
                  })}
                </div>
                {/* Selected label */}
                <p className="text-pixel/55 text-xs font-sans mt-1.5 text-right">
                  {LABELS[scores[skill.key as keyof typeof scores] - 1]}
                </p>
              </div>
            ))}

            <button
              type="submit"
              disabled={loading}
              className="btn-amber w-full disabled:opacity-50 mt-4"
              style={{ padding: '14px', fontSize: '14px' }}
            >
              {loading
                ? <span className="pixel-pulse flex items-center justify-center gap-1"><PixelIcon name="snail" size={13} color="currentColor" /> сохраняем...</span>
                : <span className="flex items-center justify-center gap-1"><PixelIcon name="bug" size={13} color="currentColor" /> Начать обучение →</span>
              }
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
