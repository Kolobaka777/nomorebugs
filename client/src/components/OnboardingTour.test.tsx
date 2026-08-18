import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OnboardingTour from './OnboardingTour';
import { tourStepsFor } from '../utils/frogLines';

// The steps come from the database in real life (frog_lines, kind 'tour').
// Mocking the module keeps this about the tour's own behaviour rather than
// about the fetch and its session-level cache.
vi.mock('../utils/frogLines', () => ({
  loadFrogLines: vi.fn(() => Promise.resolve([])),
  tourStepsFor: vi.fn(() => []),
}));

const user = { id: 42, role: 'tester' };

function step(target: string, title: string) {
  return { id: target.length, kind: 'tour', text: `Про ${title}`, title, target, role: null, order_num: 0 };
}

// jsdom gives every element a 0x0 box, which is exactly what a display:none
// element looks like — so every target has to be measured explicitly, and
// "hidden" is just the ones left at the default.
function mountTarget(target: string, { hidden = false } = {}) {
  const el = document.createElement('div');
  el.setAttribute('data-tour', target);
  document.body.appendChild(el);
  if (!hidden) {
    el.getBoundingClientRect = () =>
      ({ top: 100, left: 100, bottom: 140, right: 260, width: 160, height: 40, x: 100, y: 100, toJSON: () => ({}) }) as DOMRect;
  }
  return el;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

afterEach(() => {
  document.body.querySelectorAll('[data-tour]').forEach(el => el.remove());
});

describe('OnboardingTour', () => {
  // The bug this guards: the first seeded step points at the burger menu,
  // which only exists below the lg breakpoint. On a desktop it used to be
  // skipped after the tour had already started, so the counter opened at
  // "2/3" — the user was shown two steps and told they were on the second.
  it('numbers from 1 and counts only the steps this viewer can actually be shown', async () => {
    mountTarget('nav-menu', { hidden: true });
    mountTarget('nav-courses');
    mountTarget('frog-companion');
    vi.mocked(tourStepsFor).mockReturnValue([
      step('nav-menu', 'Меню'), step('nav-courses', 'Курсы'), step('frog-companion', 'Лягух'),
    ] as any);

    render(<OnboardingTour user={user} />);

    expect(await screen.findByText('Курсы')).toBeInTheDocument();
    expect(screen.getByText('1/2')).toBeInTheDocument();
    expect(screen.queryByText('Меню')).toBeNull();
  });

  it('walks every reachable step and remembers it finished', async () => {
    mountTarget('nav-courses');
    mountTarget('frog-companion');
    vi.mocked(tourStepsFor).mockReturnValue([
      step('nav-courses', 'Курсы'), step('frog-companion', 'Лягух'),
    ] as any);

    render(<OnboardingTour user={user} />);

    expect(await screen.findByText('1/2')).toBeInTheDocument();
    await userEvent.click(screen.getByText(/Далее/));

    expect(await screen.findByText('Лягух')).toBeInTheDocument();
    expect(screen.getByText('2/2')).toBeInTheDocument();

    // Last step offers "Готово", not another "Далее".
    await userEvent.click(screen.getByText('Готово'));
    await waitFor(() => expect(screen.queryByText('Лягух')).toBeNull());
    expect(localStorage.getItem(`onboarding_seen_${user.id}`)).toBe('true');
  });

  it('skipping counts as seen, so it does not come back next visit', async () => {
    mountTarget('nav-courses');
    vi.mocked(tourStepsFor).mockReturnValue([step('nav-courses', 'Курсы')] as any);

    render(<OnboardingTour user={user} />);
    await userEvent.click(await screen.findByText('Пропустить'));

    await waitFor(() => expect(screen.queryByText('Курсы')).toBeNull());
    expect(localStorage.getItem(`onboarding_seen_${user.id}`)).toBe('true');
  });

  it('stays away entirely once seen — no fetch, no flash of a panel', async () => {
    localStorage.setItem(`onboarding_seen_${user.id}`, 'true');
    mountTarget('nav-courses');
    vi.mocked(tourStepsFor).mockReturnValue([step('nav-courses', 'Курсы')] as any);

    render(<OnboardingTour user={user} />);

    await new Promise(r => setTimeout(r, 600));
    expect(screen.queryByText('Курсы')).toBeNull();
    expect(tourStepsFor).not.toHaveBeenCalled();
  });

  // A team can empty the step list in Багодельня → «Лягух»; so can a viewer
  // for whom nothing on the list is on screen. Either way: no empty panel.
  it('shows nothing when no step has a target this viewer can see', async () => {
    mountTarget('nav-admin', { hidden: true });
    vi.mocked(tourStepsFor).mockReturnValue([step('nav-admin', 'Админка')] as any);

    render(<OnboardingTour user={user} />);

    await new Promise(r => setTimeout(r, 600));
    expect(screen.queryByText('Админка')).toBeNull();
    expect(localStorage.getItem(`onboarding_seen_${user.id}`)).toBeNull();
  });
});
