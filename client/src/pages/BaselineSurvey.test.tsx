// The gate every new tester hits before the app proper — nothing else is
// reachable until it is submitted, and it had no test at all.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BaselineSurvey from './BaselineSurvey';
import { testerApi } from '../api';

vi.mock('../api', () => ({ testerApi: { submitBaselineSurvey: vi.fn() } }));

beforeEach(() => vi.clearAllMocks());

const next = () => fireEvent.click(screen.getByRole('button', { name: /далее|начать обучение/i }));
// Each pill's accessible name is its word plus its number ('Уверен 3'), so
// match on the label rather than the bare digit.
const RATING_LABELS = ['Не знаком', 'Базово', 'Уверен', 'Профи', 'Эксперт'];
const rate = (n: number) =>
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`${RATING_LABELS[n - 1]}\\s*${n}`) }));

/** Answers every question, so the last click is the real submit. */
async function walkThrough(score = 3) {
  for (let i = 0; i < 5; i++) {
    rate(score);
    next();
    await waitFor(() => {});
  }
}

describe('BaselineSurvey', () => {
  it('does not submit until the last question — every step before it just advances', async () => {
    vi.mocked(testerApi.submitBaselineSurvey).mockResolvedValue({ data: { success: true } } as any);
    render(<BaselineSurvey onComplete={vi.fn()} />);
    rate(3);
    next();
    await waitFor(() => expect(screen.getByText(/Вопрос 2 из 5/i)).toBeInTheDocument());
    expect(testerApi.submitBaselineSurvey).not.toHaveBeenCalled();
  });

  it('can go back without losing the answer already given', async () => {
    render(<BaselineSurvey onComplete={vi.fn()} />);
    rate(5);
    next();
    await waitFor(() => expect(screen.getByText(/Вопрос 2 из 5/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /назад/i }));
    await waitFor(() => expect(screen.getByText(/Вопрос 1 из 5/i)).toBeInTheDocument());
    // The chosen pill is still on screen and still the selected one.
    expect(screen.getByRole('button', { name: /Эксперт\s*5/ })).toBeInTheDocument();
  });

  it('submits all five scores at once and lets the app move on', async () => {
    const onComplete = vi.fn();
    vi.mocked(testerApi.submitBaselineSurvey).mockResolvedValue({ data: { success: true } } as any);
    render(<BaselineSurvey onComplete={onComplete} />);
    await walkThrough(4);
    await waitFor(() => expect(testerApi.submitBaselineSurvey).toHaveBeenCalledTimes(1));
    const sent = vi.mocked(testerApi.submitBaselineSurvey).mock.calls[0][0] as Record<string, number>;
    expect(Object.keys(sent)).toHaveLength(5);
    expect(Object.values(sent).every(v => v >= 1 && v <= 5)).toBe(true);
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
  });

  it('keeps the user on the survey when submitting fails, instead of stranding them outside the app', async () => {
    const onComplete = vi.fn();
    vi.mocked(testerApi.submitBaselineSurvey).mockRejectedValue(new Error('offline'));
    render(<BaselineSurvey onComplete={onComplete} />);
    await walkThrough();
    await waitFor(() => expect(testerApi.submitBaselineSurvey).toHaveBeenCalled());
    expect(onComplete).not.toHaveBeenCalled();
  });
});
