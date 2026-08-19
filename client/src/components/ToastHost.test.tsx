// The corner of the screen where the app tells you something went wrong.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import ToastHost from './ToastHost';
import { showToast } from '../utils/toast';

const say = (message: string, kind: 'error' | 'success' = 'error') => act(() => showToast(message, kind));

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => vi.useRealTimers());

describe('ToastHost', () => {
  it('shows one row per distinct problem', () => {
    render(<ToastHost />);
    say('Нет связи с сервером');
    say('Что-то другое');
    expect(screen.getAllByRole('alert')).toHaveLength(2);
  });

  it('collapses repeats of the same message instead of stacking them', () => {
    render(<ToastHost />);
    // A backend going quiet is noticed by every widget on the page at once.
    // Three reports of one outage used to be three tall red boxes.
    say('Нет связи с сервером');
    say('Нет связи с сервером');
    say('Нет связи с сервером');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByText('Нет связи с сервером')).toBeInTheDocument();
  });

  it('gives a repeated message a fresh countdown rather than letting the first one expire', () => {
    render(<ToastHost />);
    say('Нет связи с сервером');
    act(() => { vi.advanceTimersByTime(5000); });   // 5s into a 7s life
    say('Нет связи с сервером');                     // reported again
    act(() => { vi.advanceTimersByTime(4000); });   // 9s from the first
    expect(screen.getByText('Нет связи с сервером')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(4000); });
    expect(screen.queryByText('Нет связи с сервером')).not.toBeInTheDocument();
  });

  it('keeps two different messages apart even when one repeats', () => {
    render(<ToastHost />);
    say('Первая');
    say('Вторая');
    say('Первая');
    expect(screen.getAllByRole('alert')).toHaveLength(2);
  });

  it('does not treat an error and a success with the same text as one toast', () => {
    render(<ToastHost />);
    say('Готово', 'error');
    say('Готово', 'success');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('dismisses on click and stays dismissed', () => {
    render(<ToastHost />);
    say('Нет связи с сервером');
    fireEvent.click(screen.getByLabelText('Закрыть уведомление'));
    expect(screen.queryByText('Нет связи с сервером')).not.toBeInTheDocument();
    // The dismissal timer must not fire against an id that is already gone.
    act(() => { vi.advanceTimersByTime(10000); });
    expect(screen.queryByText('Нет связи с сервером')).not.toBeInTheDocument();
  });

  it('reappears after being dismissed, if the problem happens again', () => {
    render(<ToastHost />);
    say('Нет связи с сервером');
    fireEvent.click(screen.getByLabelText('Закрыть уведомление'));
    say('Нет связи с сервером');
    expect(screen.getByText('Нет связи с сервером')).toBeInTheDocument();
  });

  it('leaves room for the frog in the same corner', () => {
    const { container } = render(<ToastHost />);
    // FrogCompanion is fixed at bottom:54 with a 72px sprite, so it reaches
    // about 126px up the right edge. Burying the help mascot under the
    // errors is backwards — it is what you would click when something
    // breaks. It is hidden below `sm`, so only the wider layout backs off.
    const host = container.firstElementChild!;
    expect(host.className).toContain('sm:bottom-36');
  });
});
