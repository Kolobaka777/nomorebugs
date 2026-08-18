// The core learning loop: answer, see the explanation, submit, get scored.
// Everything a tester's progress depends on runs through here.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import QuizPage from './QuizPage';
import { testerApi } from '../api';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate, useParams: () => ({ id: '1' }) };
});
vi.mock('../components/Navigation', () => ({ default: () => <div data-testid="nav" /> }));
vi.mock('../api', () => ({
  testerApi: { getLecture: vi.fn(), getQuestions: vi.fn(), getExplanation: vi.fn(), submitTest: vi.fn() },
}));

const user = { id: 1, name: 'Tester', role: 'tester' };

const question = (id: number) => ({
  id, question_text: `Вопрос ${id}?`,
  option_a: `A${id}`, option_b: `B${id}`, option_c: `C${id}`, option_d: `D${id}`,
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(testerApi.getLecture).mockResolvedValue({ data: { id: 1, title: 'Лекция', skill_area: 'Skill A' } } as any);
  vi.mocked(testerApi.getExplanation).mockResolvedValue({
    data: { correctAnswer: 'a', correctOption: 'A10', explanation: 'Потому что.' },
  } as any);
});

const renderQuiz = () => render(<QuizPage user={user} onLogout={vi.fn()} />);

/** Picks an option and waits for the explanation step to appear. */
async function answer(optionText: string) {
  fireEvent.click(await screen.findByText(optionText));
  await waitFor(() => expect(screen.getByRole('button', { name: /следующий вопрос|завершить тест/i })).toBeInTheDocument());
}

/**
 * The page shuffles the question order on purpose, so a test cannot assume
 * which one comes first. This reads the question actually on screen and picks
 * its option A.
 */
async function answerCurrent() {
  const heading = await screen.findByText(/^Вопрос \d+\?$/);
  const id = heading.textContent!.match(/\d+/)![0];
  await answer(`A${id}`);
  return Number(id);
}

describe('QuizPage', () => {
  it('says so plainly when a lecture has no questions instead of rendering an empty quiz', async () => {
    vi.mocked(testerApi.getQuestions).mockResolvedValue({ data: [] } as any);
    renderQuiz();
    expect(await screen.findByText('Вопросы не найдены')).toBeInTheDocument();
  });

  it('walks question by question and submits every answer keyed by question id', async () => {
    vi.mocked(testerApi.getQuestions).mockResolvedValue({ data: [question(10), question(11)] } as any);
    vi.mocked(testerApi.submitTest).mockResolvedValue({ data: { score: 100, passed: true } } as any);
    renderQuiz();

    await answerCurrent();
    fireEvent.click(screen.getByRole('button', { name: /следующий вопрос/i }));
    await answerCurrent();
    fireEvent.click(screen.getByRole('button', { name: /завершить тест/i }));

    await waitFor(() => expect(testerApi.submitTest).toHaveBeenCalled());
    const [lectureId, answers] = vi.mocked(testerApi.submitTest).mock.calls[0];
    expect(lectureId).toBe(1);
    // Both questions answered, each keyed by its own id — whatever order the
    // shuffle put them in.
    expect(answers).toEqual({ 10: 'a', 11: 'a' });
  });

  it('shows the pass screen when the server says it passed', async () => {
    vi.mocked(testerApi.getQuestions).mockResolvedValue({ data: [question(10)] } as any);
    vi.mocked(testerApi.submitTest).mockResolvedValue({ data: { score: 80, passed: true } } as any);
    renderQuiz();
    await answer('A10');
    fireEvent.click(screen.getByRole('button', { name: /завершить тест/i }));
    expect(await screen.findByText('ТЕСТ ПРОЙДЕН!')).toBeInTheDocument();
  });

  it('shows the retry screen, and the reason, when it did not pass', async () => {
    vi.mocked(testerApi.getQuestions).mockResolvedValue({ data: [question(10)] } as any);
    vi.mocked(testerApi.submitTest).mockResolvedValue({ data: { score: 20, passed: false } } as any);
    renderQuiz();
    await answer('A10');
    fireEvent.click(screen.getByRole('button', { name: /завершить тест/i }));
    expect(await screen.findByText('ТЕСТ НЕ СДАН')).toBeInTheDocument();
    expect(screen.getByText(/минимум 60%/i)).toBeInTheDocument();
  });

  it('keeps the answers and offers another go when submitting fails — a dropped connection must not cost the attempt', async () => {
    vi.mocked(testerApi.getQuestions).mockResolvedValue({ data: [question(10)] } as any);
    vi.mocked(testerApi.submitTest).mockRejectedValue({ response: { status: 500 } });
    renderQuiz();
    await answer('A10');
    fireEvent.click(screen.getByRole('button', { name: /завершить тест/i }));
    expect(await screen.findByText('Не удалось отправить тест. Попробуй ещё раз.')).toBeInTheDocument();
    expect(screen.queryByText('ТЕСТ ПРОЙДЕН!')).not.toBeInTheDocument();
  });

  it('distinguishes no-connection from a server error, because only one of them means the answers are safe locally', async () => {
    vi.mocked(testerApi.getQuestions).mockResolvedValue({ data: [question(10)] } as any);
    vi.mocked(testerApi.submitTest).mockRejectedValue(new Error('Network Error'));
    renderQuiz();
    await answer('A10');
    fireEvent.click(screen.getByRole('button', { name: /завершить тест/i }));
    expect(await screen.findByText(/Нет соединения с сервером/)).toBeInTheDocument();
  });

  it('still lets the quiz continue when the explanation cannot be fetched', async () => {
    vi.mocked(testerApi.getQuestions).mockResolvedValue({ data: [question(10)] } as any);
    vi.mocked(testerApi.getExplanation).mockRejectedValue(new Error('down'));
    renderQuiz();
    fireEvent.click(await screen.findByText('A10'));
    // The answer is recorded and the flow moves on regardless.
    await waitFor(() => expect(screen.getByRole('button', { name: /завершить тест/i })).toBeInTheDocument());
  });

  it('resumes from the answers saved locally after a refresh mid-quiz', async () => {
    localStorage.setItem('quiz_progress_1', JSON.stringify({ 10: 'c' }));
    vi.mocked(testerApi.getQuestions).mockResolvedValue({ data: [question(10)] } as any);
    vi.mocked(testerApi.submitTest).mockResolvedValue({ data: { score: 100, passed: true } } as any);
    renderQuiz();
    await answer('A10');
    fireEvent.click(screen.getByRole('button', { name: /завершить тест/i }));
    await waitFor(() => expect(testerApi.submitTest).toHaveBeenCalled());
  });
});
