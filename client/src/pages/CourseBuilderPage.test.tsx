// The course editor. What matters here is the difference between saving a
// course outright and submitting one for review — the same screen does both,
// and which one it is depends on a permission.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CourseBuilderPage from './CourseBuilderPage';
import { knowledgeApi, coursesApi } from '../api';
import { DEFAULT_SUCCESS_TEXT, DEFAULT_FAIL_TEXT } from '../utils/courseResult';

const mockNavigate = vi.fn();
let params: Record<string, string> = {};
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate, useParams: () => params };
});
vi.mock('../components/Navigation', () => ({ default: () => <div data-testid="nav" /> }));
vi.mock('../api', () => ({
  knowledgeApi: { getMyPermissions: vi.fn() },
  coursesApi: { get: vi.fn(), create: vi.fn(), update: vi.fn(), getSections: vi.fn() },
}));

const tester = { id: 2, name: 'Nazariy', role: 'tester' };
const lead = { id: 1, name: 'Lead', role: 'lead' };

beforeEach(() => {
  vi.clearAllMocks();
  params = {};
  vi.mocked(knowledgeApi.getMyPermissions).mockResolvedValue({ data: [] } as any);
  vi.mocked(coursesApi.getSections).mockResolvedValue({ data: [] } as any);
  vi.mocked(coursesApi.get).mockResolvedValue({ data: {} } as any);
});

const renderFor = (user: any) => render(<CourseBuilderPage user={user} onLogout={vi.fn()} />);

describe('CourseBuilderPage', () => {
  it('titles itself «Предложить курс» for a tester — the screen is a submission, not a publish', async () => {
    renderFor(tester);
    expect(await screen.findByText('Предложить курс')).toBeInTheDocument();
    expect(screen.queryByText('Новый курс')).not.toBeInTheDocument();
  });

  it('titles itself «Новый курс» for a lead, who publishes directly', async () => {
    renderFor(lead);
    expect(await screen.findByText('Новый курс')).toBeInTheDocument();
    expect(screen.queryByText('Предложить курс')).not.toBeInTheDocument();
  });

  it('upgrades a granted tester to direct publishing without a role change', async () => {
    vi.mocked(knowledgeApi.getMyPermissions).mockResolvedValue({ data: ['manage_courses'] } as any);
    renderFor(tester);
    expect(await screen.findByText('Новый курс')).toBeInTheDocument();
  });

  it('loads an existing course for editing when the route carries an id', async () => {
    params = { id: '7' };
    vi.mocked(coursesApi.get).mockResolvedValue({
      data: { id: 7, title: 'Курс про баги', description: '', tag: 'Custom', color: '#66FCF1', modules: [] },
    } as any);
    renderFor(lead);
    expect(await screen.findByText('Редактировать курс')).toBeInTheDocument();
    expect(await screen.findByDisplayValue('Курс про баги')).toBeInTheDocument();
  });

  it('reports a failed load rather than silently opening a blank editor over a real course', async () => {
    params = { id: '7' };
    vi.mocked(coursesApi.get).mockRejectedValue(new Error('offline'));
    renderFor(lead);
    expect(await screen.findByText('Ошибка загрузки курса')).toBeInTheDocument();
  });
});

// The frog's closing lines. Optional, with the defaults shown as
// placeholders so it's clear nothing is missing when they're left empty.
describe('CourseBuilderPage — what the frog says at the end', () => {
  it('offers both fields, with the defaults visible as placeholders', async () => {
    renderFor(lead);
    expect(await screen.findByLabelText('Фраза при успешном прохождении')).toBeInTheDocument();
    expect(screen.getByLabelText('Фраза при неудачном прохождении')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(new RegExp(DEFAULT_SUCCESS_TEXT.slice(0, 20)))).toBeInTheDocument();
    expect(screen.getByPlaceholderText(new RegExp(DEFAULT_FAIL_TEXT.slice(0, 20)))).toBeInTheDocument();
  });

  it('keeps what the author types in both fields', async () => {
    renderFor(lead);
    await screen.findByLabelText('Фраза при успешном прохождении');

    fireEvent.change(screen.getByLabelText('Фраза при успешном прохождении'), { target: { value: 'Ну всё, ты свой.' } });
    fireEvent.change(screen.getByLabelText('Фраза при неудачном прохождении'), { target: { value: 'Перечитай.' } });

    expect(screen.getByLabelText('Фраза при успешном прохождении')).toHaveValue('Ну всё, ты свой.');
    expect(screen.getByLabelText('Фраза при неудачном прохождении')).toHaveValue('Перечитай.');
  });
});
