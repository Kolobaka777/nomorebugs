// A custom course's landing page.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import CustomCourseDetailPage from './CustomCourseDetailPage';
import { coursesApi } from '../api';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate, useParams: () => ({ id: '3' }) };
});
vi.mock('../components/Navigation', () => ({ default: () => <div data-testid="nav" /> }));
vi.mock('../api', () => ({
  leadApi: { setDeadlineOverride: vi.fn(), removeDeadlineOverride: vi.fn() },
  coursesApi: { get: vi.fn(), togglePublish: vi.fn(), remove: vi.fn() },
}));

const tester = { id: 2, name: 'Nazariy', role: 'tester' };
const lead = { id: 1, name: 'Lead', role: 'lead' };

const course = (o = {}) => ({
  id: 3, title: 'Основы вёрстки', description: '', tag: 'Custom', color: '#66FCF1',
  is_published: 1, proposal_status: null, created_by: 1, modules: [], effectiveDeadline: null, ...o,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(coursesApi.get).mockResolvedValue({ data: course() } as any);
});

const renderFor = (user: any) => render(<CustomCourseDetailPage user={user} onLogout={vi.fn()} />);

describe('CustomCourseDetailPage', () => {
  it('shows the course it fetched', async () => {
    renderFor(tester);
    expect(await screen.findByText('Основы вёрстки')).toBeInTheDocument();
  });

  it('offers a retry when the request itself failed, instead of claiming the course does not exist', async () => {
    vi.mocked(coursesApi.get).mockRejectedValue(new Error('offline'));
    renderFor(tester);
    expect(await screen.findByText(/Не удалось загрузить курс/)).toBeInTheDocument();
    expect(screen.getByText(/Повторить/)).toBeInTheDocument();
  });

  it('says the course is missing — not that the network failed — on a 404', async () => {
    vi.mocked(coursesApi.get).mockRejectedValue({ response: { status: 404, data: { error: 'Не найдено' } } });
    renderFor(tester);
    expect(await screen.findByText('Курс не найден')).toBeInTheDocument();
    expect(screen.queryByText(/Повторить/)).not.toBeInTheDocument();
  });

  it('keeps publishing controls away from a tester', async () => {
    renderFor(tester);
    await screen.findByText('Основы вёрстки');
    expect(screen.queryByText(/Опубликовать/)).not.toBeInTheDocument();
  });

  it('offers the author a publish control for an unpublished course', async () => {
    vi.mocked(coursesApi.get).mockResolvedValue({ data: course({ is_published: 0 }) } as any);
    renderFor(lead);
    await screen.findByText('Основы вёрстки');
    expect(screen.getByText(/Опубликовать/)).toBeInTheDocument();
  });

  it('frames a pending proposal as a review decision, not an ordinary publish', async () => {
    vi.mocked(coursesApi.get).mockResolvedValue({ data: course({ is_published: 0, proposal_status: 'pending', created_by: 2 }) } as any);
    renderFor(lead);
    await screen.findByText('Основы вёрстки');
    expect(screen.getByText(/Одобрить и опубликовать/)).toBeInTheDocument();
    expect(screen.getByText(/Отклонить предложение/)).toBeInTheDocument();
  });
});
