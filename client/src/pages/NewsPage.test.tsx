import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import NewsPage from './NewsPage';
import { teamApi, presenceApi } from '../api';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

// Navigation pulls in TelegramLinkWidget/ChangePasswordModal, which make
// their own API calls unrelated to what this file tests — mocked out so
// this suite only exercises NewsPage's own fetching/rendering logic.
vi.mock('../components/Navigation', () => ({ default: () => <div data-testid="nav" /> }));

vi.mock('../api', () => ({
  teamApi: { getNews: vi.fn() },
  presenceApi: { getTeam: vi.fn() },
}));

const user = { id: 1, name: 'Tester', role: 'tester' };

function renderPage() {
  return render(<NewsPage user={user} onLogout={vi.fn()} />);
}

function newsItem(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 1, event_type: 'member_joined', created_at: '2026-08-01T00:00:00Z',
    user_id: 2, name: 'New Person', avatar_initials: 'NP', gender: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('NewsPage', () => {
  it('renders the fetched news feed once loading finishes', async () => {
    vi.mocked(teamApi.getNews).mockResolvedValue({ data: { rows: [newsItem()], hasMore: false } } as any);
    vi.mocked(presenceApi.getTeam).mockResolvedValue({ data: [] } as any);

    renderPage();
    await waitFor(() => expect(screen.getByText(/New Person/)).toBeInTheDocument());
  });

  it('shows the empty state when there is no news and nothing failed', async () => {
    vi.mocked(teamApi.getNews).mockResolvedValue({ data: { rows: [], hasMore: false } } as any);
    vi.mocked(presenceApi.getTeam).mockResolvedValue({ data: [] } as any);

    renderPage();
    await waitFor(() => expect(screen.getByText('Пока новостей нет.')).toBeInTheDocument());
  });

  it('shows the server error message when the news feed fails to load', async () => {
    vi.mocked(teamApi.getNews).mockRejectedValue({ response: { data: { error: 'Сервер недоступен' } } });
    vi.mocked(presenceApi.getTeam).mockResolvedValue({ data: [] } as any);

    renderPage();
    await waitFor(() => expect(screen.getByText('Сервер недоступен')).toBeInTheDocument());
  });

  it('renders "Работают сейчас" from presence data, with hours or leave status as the subtitle', async () => {
    vi.mocked(teamApi.getNews).mockResolvedValue({ data: { rows: [], hasMore: false } } as any);
    vi.mocked(presenceApi.getTeam).mockResolvedValue({
      data: [
        { id: 5, name: 'Rabotnik', isWorkingNow: true, currentLeave: null, workStart: '09:00', workEnd: '18:00' },
        { id: 6, name: 'Otdyhaet', isWorkingNow: false, currentLeave: { id: 1, type: 'vacation', end_date: '2026-08-10', note: '' }, workStart: null, workEnd: null },
      ],
    } as any);

    renderPage();
    await waitFor(() => expect(screen.getByText('Работают сейчас')).toBeInTheDocument());
    expect(screen.getByText('Rabotnik')).toBeInTheDocument();
    expect(screen.getByText('09:00–18:00')).toBeInTheDocument();
    expect(screen.getByText('Otdyhaet')).toBeInTheDocument();
    expect(screen.getByText(/Отпуск до 2026-08-10/)).toBeInTheDocument();
  });

  it('omits the presence block entirely when nobody has presence data', async () => {
    vi.mocked(teamApi.getNews).mockResolvedValue({ data: { rows: [], hasMore: false } } as any);
    vi.mocked(presenceApi.getTeam).mockResolvedValue({ data: [] } as any);

    renderPage();
    await waitFor(() => expect(screen.getByText('Пока новостей нет.')).toBeInTheDocument());
    expect(screen.queryByText('Работают сейчас')).toBeNull();
  });

  it('clicking a teammate in the presence block navigates to their profile', async () => {
    vi.mocked(teamApi.getNews).mockResolvedValue({ data: { rows: [], hasMore: false } } as any);
    vi.mocked(presenceApi.getTeam).mockResolvedValue({
      data: [{ id: 5, name: 'Rabotnik', isWorkingNow: true, currentLeave: null, workStart: '09:00', workEnd: '18:00' }],
    } as any);

    renderPage();
    const chip = await screen.findByText('Rabotnik');
    fireEvent.click(chip);
    expect(mockNavigate).toHaveBeenCalledWith('/profile/5');
  });

  it('"Показать ещё" only appears when hasMore, and loading more appends without replacing existing items', async () => {
    vi.mocked(teamApi.getNews)
      .mockResolvedValueOnce({ data: { rows: [newsItem({ id: 1, name: 'First' })], hasMore: true, storedCount: 1 } } as any)
      .mockResolvedValueOnce({ data: { rows: [newsItem({ id: 2, name: 'Second' })], hasMore: false, storedCount: 1 } } as any);
    vi.mocked(presenceApi.getTeam).mockResolvedValue({ data: [] } as any);

    renderPage();
    await waitFor(() => expect(screen.getByText(/First/)).toBeInTheDocument());
    const loadMoreBtn = screen.getByText('Показать ещё');

    fireEvent.click(loadMoreBtn);

    await waitFor(() => expect(screen.getByText(/Second/)).toBeInTheDocument());
    expect(screen.getByText(/First/)).toBeInTheDocument();
    expect(screen.queryByText('Показать ещё')).toBeNull();
    expect(teamApi.getNews).toHaveBeenNthCalledWith(2, { offset: 1 });
  });
});
