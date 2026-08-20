// Where a custom course is actually consumed: lessons, notes, and the
// completion write-up.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

  it('names the course above the lesson, and counts what is in it', async () => {
    // A lesson opened on its own used to say nothing about which course it
    // belonged to — the only mention was a truncated line in the sidebar.
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

    expect(await screen.findByText('11 УРОКОВ')).toBeInTheDocument();
    expect(screen.getByText('1 МОДУЛЬ')).toBeInTheDocument();
    expect(screen.getByText('0 ТЕСТОВ')).toBeInTheDocument();
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
