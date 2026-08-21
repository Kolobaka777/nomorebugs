import { useState } from 'react';
import { testerApi } from '../api';
import Icon from '../components/Icon';
import logoUrl from '../assets/logo.svg';
import { PAGE_GRADIENT, PAGE_BG, CARD_BG, TEXT_MUTED, ACCENT, ERROR, H3 } from '../utils/theme';

interface BaselineSurveyProps {
  onComplete: () => void;
}

const RATING_LABELS = ['Не знаком', 'Базово', 'Уверен', 'Профи', 'Эксперт'];

// Muted stand-in for ACCENT on a disabled solid pill — same teal family,
// just dimmed, instead of the generic opacity-fade every other disabled
// control in the app uses. Not in theme.ts since this exact pairing is
// specific to this pill component.
const ACCENT_MUTED = '#45A29E';

// The "Назад"/"Далее" pill per spec: solid ACCENT when enabled, solid
// ACCENT_MUTED when disabled — a plain color swap, not the opacity-fade
// .btn-primary/.btn-secondary use elsewhere. Hover is a smooth brightness
// shift only (no lift), matching the site-wide hover convention.
function SurveyPillButton({ children, onClick, disabled, style }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean; style?: React.CSSProperties;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="font-geist font-semibold text-sm"
      style={{
        display: 'flex',
        height: 44,
        padding: '14px 39px 14px 32px',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 10,
        borderRadius: 8,
        border: 'none',
        color: PAGE_BG,
        background: disabled ? ACCENT_MUTED : ACCENT,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'filter 0.15s',
        filter: !disabled && hover ? 'brightness(1.1)' : 'none',
        ...style,
      }}
    >
      {children}
    </button>
  );
}

// The 1-5 rating buttons' own pill shape — default/unselected state per
// spec (bordered, 60%-opacity ACCENT fill); selected flips to the same
// solid-ACCENT/dark-text look as SurveyPillButton so "this is the chosen
// answer" reads with the same visual weight as "this is the primary
// action" elsewhere on the page. Hover is a smooth brightness shift only.
function RatingPill({ children, onClick, selected }: {
  children: React.ReactNode; onClick: () => void; selected: boolean;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="flex flex-col items-center cursor-pointer"
      style={{
        display: 'flex',
        padding: '12px 32px',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 10,
        borderRadius: 8,
        border: `1px solid ${ACCENT}`,
        background: selected ? ACCENT : 'rgba(102, 252, 241,0.60)',
        color: PAGE_BG,
        minWidth: 78,
        transition: 'filter 0.15s, background-color 0.15s',
        filter: hover ? 'brightness(1.1)' : 'none',
      }}
    >
      {children}
    </button>
  );
}

export default function BaselineSurvey({ onComplete }: BaselineSurveyProps) {
  const [scores, setScores] = useState({
    html_structure: 3,
    css_reading: 3,
    devtools: 3,
    console_errors: 3,
    bug_report_quality: 3,
  });
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const skills: { key: keyof typeof scores; label: string; desc: string }[] = [
    { key: 'html_structure', label: 'HTML структура', desc: 'Понимание тегов, семантики, атрибутов' },
    { key: 'css_reading', label: 'Чтение CSS', desc: 'Чтение и понимание стилей' },
    { key: 'devtools', label: 'DevTools', desc: 'Работа с инструментами разработчика' },
    { key: 'console_errors', label: 'Ошибки консоли', desc: 'Чтение и понимание ошибок JS' },
    { key: 'bug_report_quality', label: 'Баг-репорты', desc: 'Умение описывать дефекты' },
  ];
  const current = skills[step];
  const isLast = step === skills.length - 1;
  const progress = ((step + 1) / skills.length) * 100;

  const handleChange = (value: number) => {
    setScores(prev => ({ ...prev, [current.key]: value }));
  };

  const handleSubmit = async () => {
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

  const handleNext = () => {
    if (isLast) { handleSubmit(); return; }
    setStep(s => s + 1);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: PAGE_GRADIENT }}>
      <div className="w-full max-w-lg relative z-10 fade-in">
        <div className="text-center mb-8">
          <img src={logoUrl} alt="baganet" style={{ height: 40, width: 'auto', margin: '0 auto' }} />
        </div>

        <div className="p-8 rounded-lg" style={{ background: CARD_BG, boxShadow: '0 6px 12px 0 rgba(0, 0, 0, 0.25)' }}>
          {error && (
            <div className="px-4 py-3 rounded-lg text-sm font-geist mb-5" style={{ background: 'rgba(224,82,82,0.1)', color: ERROR, border: `1px solid ${ERROR}` }}>
              {error}
            </div>
          )}

          {/* Progress */}
          <div className="flex items-center gap-3 mb-8">
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(197, 198, 199,0.1)' }}>
              <div className="h-full rounded-full transition-all duration-300" style={{ width: `${progress}%`, background: ACCENT }} />
            </div>
            <span className="font-geist text-xs shrink-0" style={{ color: TEXT_MUTED }}>Вопрос {step + 1} из {skills.length}</span>
          </div>

          {/* Question */}
          <div className="text-center mb-8">
            <h1 className="font-montserrat mb-2" style={{ ...H3 }}>{current.label}</h1>
            <p className="font-geist text-sm" style={{ color: TEXT_MUTED }}>{current.desc}</p>
          </div>

          {/* Rating scale — default/unselected state is the outline pill per
              spec (border ACCENT, 60%-opacity ACCENT fill); selected reuses
              the solid-pill look so "confirmed choice" reads the same
              language as the primary Далее button below. */}
          <div className="flex flex-wrap gap-2 mb-8 justify-center">
            {[1, 2, 3, 4, 5].map(num => {
              const isSelected = scores[current.key] === num;
              return (
                <RatingPill key={num} selected={isSelected} onClick={() => handleChange(num)}>
                  <span className="font-geist" style={{ fontSize: 11 }}>{RATING_LABELS[num - 1]}</span>
                  <span className="font-montserrat font-bold" style={{ fontSize: 18 }}>{num}</span>
                </RatingPill>
              );
            })}
          </div>

          {/* Nav */}
          <div className="flex items-center justify-between gap-3">
            <SurveyPillButton onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}>
              Назад
            </SurveyPillButton>
            <SurveyPillButton onClick={handleNext} disabled={loading} style={{ flex: 1 }}>
              {loading
                ? <span className="pixel-pulse flex items-center justify-center gap-1"><Icon name="frog" size={13} color="currentColor" /> сохраняем...</span>
                : isLast ? 'Начать обучение' : 'Далее'}
            </SurveyPillButton>
          </div>
        </div>
      </div>
    </div>
  );
}
