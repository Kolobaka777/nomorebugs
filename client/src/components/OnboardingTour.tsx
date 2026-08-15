import { useEffect, useState } from 'react';
import Icon from './Icon';
import PixelFrogSprite from './PixelFrogSprite';
import { ACCENT, CARD_BG, CARD_SHADOW_TALL, TEXT_PRIMARY, TEXT_MUTED, TRACK_WIDE, PAGE_BG } from '../utils/theme';

interface Step {
  selector: string;
  title: string;
  body: string;
}

// A step whose selector never resolves (target isn't on the page/role) gets
// silently auto-skipped below — but that's exactly the bug: while it's
// resolving, the tour's full-viewport dark overlay is already up and
// intercepts clicks meant for the actual page underneath, so a user who
// clicks something real (e.g. Guides' "+ Новый гайд") right as the tour
// passes through a dead step can have that click silently eaten with no
// feedback. 'Чеклисты' was exactly that dead step -- the nav link it
// pointed at was commented out (see Navigation.tsx) when checklists got
// pulled pending rework, so this step could never resolve for anyone.
// Removed instead of relying on the skip logic to paper over it.
const TESTER_STEPS: Step[] = [
  { selector: '[data-tour="nav-home"]', title: 'Главная', body: 'Стартовая страница — сводка активности и полезные ссылки.' },
  { selector: '[data-tour="nav-courses"]', title: 'Курсы', body: 'Все лекции и курсы. Начни отсюда, чтобы прокачать навыки QA.' },
  { selector: '[data-tour="nav-shop"]', title: 'Багодельня', body: 'Магазин — трать баг-коины на украшения профиля.' },
  { selector: '[data-tour="nav-help"]', title: 'Помощь', body: 'Если что-то непонятно — здесь ответы на частые вопросы. Доступно в любой момент.' },
  { selector: '[data-tour="nav-account"]', title: 'Аккаунт', body: 'Профиль, настройки и выход из приложения.' },
];

const LEAD_STEPS: Step[] = [
  { selector: '[data-tour="nav-home"]', title: 'Главная', body: 'Стартовая страница команды.' },
  { selector: '[data-tour="nav-courses"]', title: 'Курсы', body: 'Каталог курсов — здесь же можно создавать свои через "Создать курс".' },
  { selector: '[data-tour="nav-team"]', title: 'Команда', body: 'Дашборд с прогрессом, аналитикой по лекциям и активностью команды.' },
  { selector: '[data-tour="nav-shop"]', title: 'Багодельня', body: 'Магазин косметики для профилей команды.' },
  { selector: '[data-tour="nav-help"]', title: 'Помощь', body: 'Ответы на частые вопросы — доступно в любой момент.' },
  { selector: '[data-tour="nav-account"]', title: 'Аккаунт', body: 'Профиль, настройки и выход из приложения.' },
];

const ADMIN_STEPS: Step[] = [
  { selector: '[data-tour="nav-home"]', title: 'Главная', body: 'Стартовая страница команды.' },
  { selector: '[data-tour="nav-courses"]', title: 'Курсы', body: 'Каталог курсов — здесь же можно создавать свои через "Создать курс".' },
  { selector: '[data-tour="nav-team"]', title: 'Команда', body: 'Дашборд с прогрессом, аналитикой по лекциям и активностью команды.' },
  { selector: '[data-tour="nav-shop"]', title: 'Багодельня', body: 'Магазин косметики для профилей команды.' },
  { selector: '[data-tour="nav-admin"]', title: 'Админка', body: 'Управление пользователями и ролями — доступно только администраторам.' },
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

  const steps = user.role === 'admin' ? ADMIN_STEPS : user.role === 'lead' ? LEAD_STEPS : TESTER_STEPS;

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
    const updateRect = () => setRect(el.getBoundingClientRect());
    updateRect();
    // Keep the highlight aligned with its target if the user resizes the
    // window or scrolls while this step is showing.
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);
    return () => {
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
    };
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
          border: `2px solid ${ACCENT}`,
          borderRadius: 8,
          boxShadow: `0 0 0 4000px rgba(0,0,0,0.55), 0 0 16px 0 ${ACCENT}80`,
          zIndex: 201,
          transition: 'all 0.2s ease-out',
        }}
      />
      <div
        role="dialog"
        aria-label={step.title}
        className="fixed rounded-lg p-5"
        style={{
          top: tooltipTop, left: tooltipLeft, width: 320,
          background: CARD_BG, border: `1px solid ${ACCENT}`,
          boxShadow: CARD_SHADOW_TALL, zIndex: 202,
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-3">
          {/* The site's mascot pokes in to deliver the tip — same sprite
              as the loading screens, so it reads as one consistent
              character rather than a generic help-icon. */}
          <PixelFrogSprite size={40} className="shrink-0" />
          <p
            className="font-montserrat font-semibold"
            style={{ fontSize: 19, lineHeight: '24px', letterSpacing: TRACK_WIDE, color: TEXT_PRIMARY, paddingTop: 4 }}
          >
            {step.title}
          </p>
        </div>
        <p className="font-geist mb-5" style={{ fontSize: 15, lineHeight: 1.6, color: TEXT_MUTED }}>{step.body}</p>
        <div className="flex items-center justify-between">
          <button onClick={finish} className="font-geist cursor-pointer" style={{ fontSize: 13, color: TEXT_MUTED }}>
            Пропустить всё
          </button>
          <div className="flex items-center gap-4">
            <span className="font-geist" style={{ fontSize: 13, color: TEXT_MUTED, letterSpacing: TRACK_WIDE }}>{stepIndex + 1}/{steps.length}</span>
            <button
              onClick={next}
              className="font-geist font-semibold px-4 py-2 rounded-lg cursor-pointer"
              style={{ fontSize: 14, background: ACCENT, color: PAGE_BG }}
            >
              {isLast ? 'Готово' : (
                <span className="inline-flex items-center gap-1.5">Далее <Icon name="arrowRight" size={15} color="currentColor" /></span>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
