import { useEffect, useState } from 'react';

interface Step {
  selector: string;
  title: string;
  body: string;
}

const TESTER_STEPS: Step[] = [
  { selector: '[data-tour="nav-home"]', title: 'Главная', body: 'Стартовая страница — сводка активности и полезные ссылки.' },
  { selector: '[data-tour="nav-courses"]', title: 'Курсы', body: 'Все лекции и курсы. Начни отсюда, чтобы прокачать навыки QA.' },
  { selector: '[data-tour="nav-checklists"]', title: 'Чеклисты', body: 'Проверка реальных задач по готовым чек-листам — сохраняется и видно команде.' },
  { selector: '[data-tour="nav-shop"]', title: 'Багодельня', body: 'Магазин — трать баг-коины на украшения профиля.' },
  { selector: '[data-tour="nav-help"]', title: 'Помощь', body: 'Если что-то непонятно — здесь ответы на частые вопросы. Доступно в любой момент.' },
  { selector: '[data-tour="nav-account"]', title: 'Аккаунт', body: 'Профиль, настройки и выход из приложения.' },
];

const LEAD_STEPS: Step[] = [
  { selector: '[data-tour="nav-home"]', title: 'Главная', body: 'Стартовая страница команды.' },
  { selector: '[data-tour="nav-courses"]', title: 'Курсы', body: 'Каталог курсов — здесь же можно создавать свои через "Создать курс".' },
  { selector: '[data-tour="nav-team"]', title: 'Команда', body: 'Дашборд с прогрессом, аналитикой по лекциям и активностью команды.' },
  { selector: '[data-tour="nav-checklists"]', title: 'Чеклисты', body: 'Проверки задач от тестировщиков и статистика по ним.' },
  { selector: '[data-tour="nav-shop"]', title: 'Багодельня', body: 'Магазин косметики для профилей команды.' },
  { selector: '[data-tour="nav-help"]', title: 'Помощь', body: 'Ответы на частые вопросы — доступно в любой момент.' },
  { selector: '[data-tour="nav-account"]', title: 'Аккаунт', body: 'Профиль, настройки и выход из приложения.' },
];

interface Props {
  user: any;
}

export default function OnboardingTour({ user }: Props) {
  const storageKey = `onboarding_seen_${user.id}`;
  const [stepIndex, setStepIndex] = useState(0);
  const [active, setActive] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const steps = user.role === 'lead' ? LEAD_STEPS : TESTER_STEPS;

  useEffect(() => {
    if (localStorage.getItem(storageKey)) return;
    // Small delay so Navigation (and the rest of the page) has mounted
    // before we start measuring element positions.
    const t = setTimeout(() => setActive(true), 500);
    return () => clearTimeout(t);
  }, [storageKey]);

  useEffect(() => {
    if (!active) return;
    const step = steps[stepIndex];
    if (!step) return;
    const el = document.querySelector(step.selector);
    if (!el) {
      // Target isn't on this page/role — skip straight to the next step
      // rather than showing a tooltip pointing at nothing.
      if (stepIndex < steps.length - 1) setStepIndex(i => i + 1);
      else finish();
      return;
    }
    setRect(el.getBoundingClientRect());
  }, [active, stepIndex, steps]);

  const finish = () => {
    localStorage.setItem(storageKey, 'true');
    setActive(false);
  };

  const next = () => {
    if (stepIndex < steps.length - 1) setStepIndex(i => i + 1);
    else finish();
  };

  if (!active || !rect) return null;

  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;
  const tooltipTop = rect.bottom + 12;
  const tooltipLeft = Math.max(12, Math.min(rect.left, window.innerWidth - 300));

  return (
    <>
      <div
        className="fixed inset-0"
        style={{ background: 'rgba(0,0,0,0.55)', zIndex: 200 }}
        onClick={finish}
      />
      {/* Highlight ring around the current target */}
      <div
        className="fixed pointer-events-none"
        style={{
          top: rect.top - 4,
          left: rect.left - 4,
          width: rect.width + 8,
          height: rect.height + 8,
          border: '2px solid #EF9F27',
          borderRadius: 4,
          boxShadow: '0 0 0 4000px rgba(0,0,0,0.55)',
          zIndex: 201,
          transition: 'all 0.2s ease-out',
        }}
      />
      <div
        role="dialog"
        aria-label={step.title}
        className="fixed rounded p-4"
        style={{
          top: tooltipTop, left: tooltipLeft, width: 280,
          background: '#1a1a2e', border: '2px solid #EF9F27',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)', zIndex: 202,
        }}
        onClick={e => e.stopPropagation()}
      >
        <p className="font-pixel text-amber mb-2" style={{ fontSize: '0.6rem', lineHeight: 1.7 }}>{step.title}</p>
        <p className="font-sans text-xs mb-4" style={{ color: 'rgba(232,232,208,0.75)' }}>{step.body}</p>
        <div className="flex items-center justify-between">
          <button onClick={finish} className="font-sans text-xs cursor-pointer" style={{ color: 'rgba(232,232,208,0.6)' }}>
            Пропустить всё
          </button>
          <div className="flex items-center gap-3">
            <span className="font-sans text-xs" style={{ color: 'rgba(232,232,208,0.6)' }}>{stepIndex + 1}/{steps.length}</span>
            <button
              onClick={next}
              className="font-sans text-xs font-bold px-3 py-1.5 rounded cursor-pointer"
              style={{ background: '#EF9F27', color: '#0f0f1a' }}
            >
              {isLast ? 'Готово' : 'Далее →'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
