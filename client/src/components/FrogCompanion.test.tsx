// The mascot's two visible behaviours: the hop, and the label that names
// what clicking it does.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import FrogCompanion from './FrogCompanion';
import { ACHIEVEMENT_EARNED_EVENT } from '../utils/achievements';

// The component primes the shared frog-line cache on mount; the network is
// not the subject here.
vi.mock('../utils/frogLines', () => ({
  loadFrogLines: () => Promise.resolve([]),
  randomFrogLine: () => 'подсказка',
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => vi.fn() };
});

const user = { id: 1, name: 'Тестер', role: 'tester' };

const frog = () => screen.getByRole('button', { name: 'Спросить лягуха' });

function earnAchievement() {
  act(() => {
    window.dispatchEvent(new CustomEvent(ACHIEVEMENT_EARNED_EVENT, { detail: ['HTML structure'] }));
  });
}

// jsdom runs no animations, so `animationend` never arrives on its own —
// which is the point: the component must wait for it rather than assume a
// duration, and a test can therefore say exactly when the hop ends.
function finishHop(target: Element = frog()) {
  // bubbles: true because a real animationend does — testing-library's
  // default init for this event does not.
  fireEvent.animationEnd(target, { bubbles: true });
}

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => vi.useRealTimers());

describe('the hop', () => {
  it('lasts until the browser says the animation ended, not until a timer says so', () => {
    render(<FrogCompanion user={user} />);
    expect(frog()).toHaveClass('frog-companion-idle');

    earnAchievement();
    expect(frog()).toHaveClass('frog-companion-hop');

    // The old code cleared the class 600ms after asking React to render,
    // which is not the same moment the animation actually started.
    act(() => { vi.advanceTimersByTime(1000); });
    expect(frog()).toHaveClass('frog-companion-hop');

    finishHop();
    expect(frog()).toHaveClass('frog-companion-idle');
  });

  it('ignores a second request while one is still in the air', () => {
    render(<FrogCompanion user={user} />);
    earnAchievement();
    const started = frog();
    expect(started).toHaveClass('frog-companion-hop');

    // Two hop sources used to each arm their own end-timer against one
    // shared flag, so the earlier timer cut the later hop short.
    earnAchievement();
    expect(frog()).toHaveClass('frog-companion-hop');

    finishHop();
    expect(frog()).toHaveClass('frog-companion-idle');
  });

  it('is not ended by an animation belonging to the sprite inside it', () => {
    render(<FrogCompanion user={user} />);
    earnAchievement();

    // The knight sprite animates its sword, mount and flies; those events
    // bubble up through the button.
    const sprite = frog().querySelector('svg');
    expect(sprite).not.toBeNull();
    finishHop(sprite!);
    expect(frog()).toHaveClass('frog-companion-hop');

    finishHop();
    expect(frog()).toHaveClass('frog-companion-idle');
  });

  it('unsticks itself if the animation event never arrives', () => {
    render(<FrogCompanion user={user} />);
    earnAchievement();
    expect(frog()).toHaveClass('frog-companion-hop');

    // Belt and braces: a frog frozen mid-air is worse than one that hops
    // slightly late.
    act(() => { vi.advanceTimersByTime(1600); });
    expect(frog()).toHaveClass('frog-companion-idle');
  });
});

describe('the label', () => {
  it('is rendered next to the frog rather than as a native tooltip over it', () => {
    render(<FrogCompanion user={user} />);
    // A `title` is drawn by the browser at the cursor — on top of the very
    // thing it labels.
    expect(frog()).not.toHaveAttribute('title');
    expect(screen.getByText('Спросить лягуха')).toBeInTheDocument();
  });

  it('appears on hover and on keyboard focus alike', () => {
    render(<FrogCompanion user={user} />);
    const label = screen.getByText('Спросить лягуха');
    expect(label).toHaveAttribute('data-visible', 'false');

    fireEvent.mouseEnter(frog());
    expect(label).toHaveAttribute('data-visible', 'true');
    fireEvent.mouseLeave(frog());
    expect(label).toHaveAttribute('data-visible', 'false');

    fireEvent.focus(frog());
    expect(label).toHaveAttribute('data-visible', 'true');
  });

  it('is hidden from assistive tech, which reads the button instead', () => {
    render(<FrogCompanion user={user} />);
    expect(screen.getByText('Спросить лягуха')).toHaveAttribute('aria-hidden', 'true');
    expect(frog()).toHaveAccessibleName('Спросить лягуха');
  });

  it('goes away once the chat is open, so it cannot sit over the panel', () => {
    render(<FrogCompanion user={user} />);
    fireEvent.click(frog());
    expect(screen.queryByText('Спросить лягуха')).not.toBeInTheDocument();
  });
});
