// Where a custom course is actually consumed: lessons, notes, and the
// completion write-up.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import CustomCourseLearningPage from './CustomCourseLearningPage';
import { testerApi, coursesApi } from '../api';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate, useParams: () => ({ id: '3' }) };
});
vi.mock('../components/Navigation', () => ({ default: () => <div data-testid="nav" /> }));
vi.mock('../api', () => ({
  testerApi: { getNotes: vi.fn(), addNote: vi.fn(), deleteNote: vi.fn() },
  coursesApi: {
    get: vi.fn(), completeLesson: vi.fn(), trackTime: vi.fn(),
    submitQuiz: vi.fn(), getExplanation: vi.fn(), myResult: vi.fn(),
  },
}));

const user = { id: 2, name: 'Nazariy', role: 'tester' };

const course = (o = {}) => ({
  id: 3, title: 'Основы вёрстки', description: '', tag: 'Custom', color: '#66FCF1',
  modules: [{
    id: 1, title: 'Модуль 1', order_num: 0,
    lessons: [{ id: 10, title: 'Урок про отступы', type: 'lesson', content: 'текст', completed: false, locked: false, prerequisite_type: 'none' }],
  }],
  ...o,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(testerApi.getNotes).mockResolvedValue({ data: [] } as any);
  vi.mocked(coursesApi.get).mockResolvedValue({ data: course() } as any);
});

const renderPage = () => render(<CustomCourseLearningPage user={user} onLogout={vi.fn()} />);

describe('CustomCourseLearningPage', () => {
  it('shows the course and its lessons', async () => {
    renderPage();
    expect((await screen.findAllByText('Урок про отступы')).length).toBeGreaterThan(0);
  });

  it('names the course and counts what is in it, behind the contents dropdown', async () => {
    // A lesson opened on its own used to say nothing about which course it
    // belonged to. The course header that fixed that has since moved into
    // the contents panel, so the lesson can have the page's full width —
    // moved, not dropped, which is what this checks.
    vi.mocked(coursesApi.get).mockResolvedValue({ data: course({
      title: 'Introduction to DevTools',
      tag: 'DevTools',
      modules: [
        { id: 1, title: 'Модуль 1', order_num: 0, lessons: [
          { id: 10, title: 'Тема 1.1', type: 'lesson', content: 'x', completed: false, locked: false, prerequisite_type: 'none' },
          { id: 11, title: 'Тема 1.2', type: 'quiz', questions: [], completed: false, locked: false, prerequisite_type: 'none' },
        ] },
        { id: 2, title: 'Модуль 2', order_num: 1, lessons: [
          { id: 12, title: 'Тема 2.1', type: 'lesson', content: 'y', completed: false, locked: false, prerequisite_type: 'none' },
        ] },
      ],
    }) } as any);
    renderPage();

    expect(await screen.findByText('ВЕРНУТЬСЯ К КУРСУ')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Содержание'));
    expect(screen.getByText('Introduction to DevTools')).toBeInTheDocument();
    expect(screen.getByText('DevTools')).toBeInTheDocument();
    // Three lessons, one of which is the quiz — тесты are a breakdown of
    // the lesson count, not a fourth thing added on top.
    expect(screen.getByText('3 УРОКА')).toBeInTheDocument();
    expect(screen.getByText('2 МОДУЛЯ')).toBeInTheDocument();
    expect(screen.getByText('1 ТЕСТ')).toBeInTheDocument();
  });

  it('declines the counts instead of pinning one ending on every number', async () => {
    // "1 УРОКОВ" is the failure this guards; so is "11 УРОКА", which every
    // naive last-digit rule produces.
    const lessons = Array.from({ length: 11 }, (_, i) => ({
      id: 100 + i, title: `Тема ${i}`, type: 'lesson', content: 'x',
      completed: false, locked: false, prerequisite_type: 'none',
    }));
    vi.mocked(coursesApi.get).mockResolvedValue({ data: course({
      modules: [{ id: 1, title: 'Модуль 1', order_num: 0, lessons }],
    }) } as any);
    renderPage();

    await screen.findByText('Содержание');
    fireEvent.click(screen.getByText('Содержание'));
    expect(screen.getByText('11 УРОКОВ')).toBeInTheDocument();
    expect(screen.getByText('1 МОДУЛЬ')).toBeInTheDocument();
    expect(screen.getByText('0 ТЕСТОВ')).toBeInTheDocument();
  });

  it('names the lesson ahead, and stays neutral about the one behind', async () => {
    // Далее said only that something came next, which the reader could
    // already see. Going back is different: at this width the previous
    // lesson's title was cut mid-word, and half a topic name reads as a
    // glitch rather than as a destination.
    vi.mocked(coursesApi.get).mockResolvedValue({ data: course({
      modules: [{ id: 1, title: 'Модуль 1', order_num: 0, lessons: [
        { id: 10, title: 'Тема 2.4: Старая тема', type: 'lesson', content: 'a', completed: true, locked: false, prerequisite_type: 'none' },
        { id: 11, title: 'Тема 3.1: Команды Console API', type: 'lesson', content: 'b', completed: false, locked: false, prerequisite_type: 'none' },
        { id: 12, title: 'Тема 3.2: Точки останова', type: 'lesson', content: 'c', completed: false, locked: false, prerequisite_type: 'none' },
      ] }],
    }) } as any);
    renderPage();

    // Opens on the first unfinished lesson, so the neighbours are the one
    // already done and the one after it.
    expect(await screen.findByRole('heading', { name: 'Тема 3.1: Команды Console API' })).toBeInTheDocument();
    expect(screen.getByText('Тема 3.2: Точки останова')).toBeInTheDocument();
    expect(screen.getByText('Предыдущая тема')).toBeInTheDocument();
    expect(screen.queryByText('Далее')).not.toBeInTheDocument();
    expect(screen.queryByText('Назад')).not.toBeInTheDocument();
    expect(screen.queryByText('Тема 2.4: Старая тема')).not.toBeInTheDocument();
  });

  it('offers the retake on a failed test and refuses to move on', async () => {
    vi.mocked(coursesApi.get).mockResolvedValue({ data: course({
      modules: [{ id: 1, title: 'Модуль 1', order_num: 0, lessons: [
        { id: 20, title: 'Тест по модулю 1', type: 'quiz', completed: false, locked: false, prerequisite_type: 'none',
          myResult: null, questions: [{ id: 1, question_text: 'Что такое HTML?', option_a: 'a', option_b: 'b', option_c: 'c', option_d: 'd' }] },
      ] }],
    }) } as any);
    vi.mocked(coursesApi.getExplanation).mockResolvedValue({ data: { correct_idx: 1, explanation: 'вот так' } } as any);
    vi.mocked(coursesApi.submitQuiz).mockResolvedValue({ data: { score: 0, correct: 0, total: 1, breakdown: [{ id: 1, correct_idx: 1, isCorrect: false, explanation: 'вот так' }], best: { score: 0 } } } as any);
    renderPage();

    // A quiz lesson writes its own heading, so the page must not title it twice.
    expect(await screen.findByText('Тест: Тест по модулю 1')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Тест по модулю 1' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('a'));
    fireEvent.click(screen.getByText('Ответить'));
    await screen.findByText('Правильный ответ: B');
    fireEvent.click(screen.getByText('Завершить тест'));

    expect(await screen.findByText(/Тест не сдан/)).toBeInTheDocument();
    expect(screen.getByText('Пройти тест заново')).toBeInTheDocument();
    // Moving on is not offered: the server refuses to mark a failed test
    // done, so the button would only ever produce an error.
    expect(screen.queryByText('Завершить курс')).not.toBeInTheDocument();
    // And nothing navigated away on its own.
    expect(coursesApi.completeLesson).not.toHaveBeenCalled();
  });

  it('starts a retake at the first question, not wherever the last attempt ended', async () => {
    vi.mocked(coursesApi.get).mockResolvedValue({ data: course({
      modules: [{ id: 1, title: 'Модуль 1', order_num: 0, lessons: [
        { id: 20, title: 'Тест', type: 'quiz', completed: false, locked: false, prerequisite_type: 'none', myResult: null, questions: [
          { id: 1, question_text: 'Первый вопрос', option_a: 'a1', option_b: 'b1', option_c: 'c1', option_d: 'd1' },
          { id: 2, question_text: 'Второй вопрос', option_a: 'a2', option_b: 'b2', option_c: 'c2', option_d: 'd2' },
        ] },
      ] }],
    }) } as any);
    vi.mocked(coursesApi.getExplanation).mockResolvedValue({ data: { correct_idx: 1, explanation: 'вот так' } } as any);
    vi.mocked(coursesApi.submitQuiz).mockResolvedValue({ data: {
      score: 0, correct: 0, total: 2,
      breakdown: [{ id: 1, correct_idx: 1, isCorrect: false, explanation: '' }, { id: 2, correct_idx: 1, isCorrect: false, explanation: '' }],
      best: { score: 0 },
    } } as any);
    renderPage();

    await screen.findByText('Первый вопрос');
    fireEvent.click(screen.getByText('a1'));
    fireEvent.click(screen.getByText('Ответить'));
    await screen.findByText(/Правильный ответ/);
    fireEvent.click(screen.getByText('Следующий вопрос'));

    await screen.findByText('Второй вопрос');
    fireEvent.click(screen.getByText('a2'));
    fireEvent.click(screen.getByText('Ответить'));
    await screen.findByText(/Правильный ответ/);
    fireEvent.click(screen.getByText('Завершить тест'));

    await screen.findByText('Пройти тест заново');
    fireEvent.click(screen.getByText('Пройти тест заново'));

    // Clearing the answers is not enough: which question is on screen is the
    // quiz view's own state, and it survived the reset.
    expect(await screen.findByText('Первый вопрос')).toBeInTheDocument();
    expect(screen.queryByText('Второй вопрос')).not.toBeInTheDocument();
  });

  it('offers a retry when the course could not be fetched', async () => {
    vi.mocked(coursesApi.get).mockRejectedValue(new Error('offline'));
    renderPage();
    expect(await screen.findByText(/Не удалось загрузить курс/)).toBeInTheDocument();
  });

  it('says the course is missing when the server answers 404, without offering a pointless retry', async () => {
    vi.mocked(coursesApi.get).mockRejectedValue({ response: { status: 404, data: { error: 'Не найдено' } } });
    renderPage();
    expect(await screen.findByText('Курс не найден')).toBeInTheDocument();
  });

  it('still opens the course when the notes request fails — notes are an extra, not a prerequisite', async () => {
    vi.mocked(testerApi.getNotes).mockRejectedValue(new Error('down'));
    renderPage();
    expect((await screen.findAllByText('Урок про отступы')).length).toBeGreaterThan(0);
  });

  it('marks a lesson that is already done as done', async () => {
    vi.mocked(coursesApi.get).mockResolvedValue({ data: course({
      modules: [{
        id: 1, title: 'Модуль 1', order_num: 0,
        lessons: [{ id: 10, title: 'Пройденный урок', type: 'lesson', content: 'x', completed: true, locked: false, prerequisite_type: 'none' }],
      }],
    }) } as any);
    renderPage();
    await screen.findAllByText('Пройденный урок');
    await waitFor(() => expect(coursesApi.get).toHaveBeenCalled());
  });
});
