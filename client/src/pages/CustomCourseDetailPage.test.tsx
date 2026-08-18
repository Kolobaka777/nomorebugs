// A custom course's landing page. It talks to the API through authFetch
// rather than the api module, so that is what gets stubbed here.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import CustomCourseDetailPage from './CustomCourseDetailPage';
import { authFetch } from '../auth';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate, useParams: () => ({ id: '3' }) };
});
vi.mock('../components/Navigation', () => ({ default: () => <div data-testid="nav" /> }));
vi.mock('../auth', () => ({ authFetch: vi.fn() }));
vi.mock('../api', () => ({ leadApi: { setDeadlineOverride: vi.fn(), removeDeadlineOverride: vi.fn() } }));

const tester = { id: 2, name: 'Nazariy', role: 'tester' };
const lead = { id: 1, name: 'Lead', role: 'lead' };

const course = (o = {}) => ({
  id: 3, title: 'Основы вёрстки', description: '', tag: 'Custom', color: '#66FCF1',
  is_published: 1, proposal_status: null, created_by: 1, modules: [], effectiveDeadline: null, ...o,
});

const respond = (body: any) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as any);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authFetch).mockImplementation(() => respond(course()));
});

const renderFor = (user: any) => render(<CustomCourseDetailPage user={user} onLogout={vi.fn()} />);

describe('CustomCourseDetailPage', () => {
  it('shows the course it fetched', async () => {
    renderFor(tester);
    expect(await screen.findByText('Основы вёрстки')).toBeInTheDocument();
  });

  it('offers a retry when the request itself failed, instead of claiming the course does not exist', async () => {
    vi.mocked(authFetch).mockRejectedValue(new Error('offline'));
    renderFor(tester);
    expect(await screen.findByText(/Не удалось загрузить курс/)).toBeInTheDocument();
    expect(screen.getByText(/Повторить/)).toBeInTheDocument();
  });

  it('says the course is missing — not that the network failed — when the server answers with an error', async () => {
    vi.mocked(authFetch).mockImplementation(() => respond({ error: 'Не найдено' }));
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
    vi.mocked(authFetch).mockImplementation(() => respond(course({ is_published: 0 })));
    renderFor(lead);
    await screen.findByText('Основы вёрстки');
    expect(screen.getByText(/Опубликовать/)).toBeInTheDocument();
  });

  it('frames a pending proposal as a review decision, not an ordinary publish', async () => {
    vi.mocked(authFetch).mockImplementation(() => respond(course({ is_published: 0, proposal_status: 'pending', created_by: 2 })));
    renderFor(lead);
    await screen.findByText('Основы вёрстки');
    expect(screen.getByText(/Одобрить и опубликовать/)).toBeInTheDocument();
    expect(screen.getByText(/Отклонить предложение/)).toBeInTheDocument();
  });
});
