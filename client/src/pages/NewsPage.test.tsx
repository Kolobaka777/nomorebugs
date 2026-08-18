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
  teamApi: { getNews: vi.fn(), postNews: vi.fn(), removeNews: vi.fn() },
  presenceApi: { getTeam: vi.fn() },
}));

const user = { id: 1, name: 'Tester', role: 'tester' };
const lead = { id: 9, name: 'Lead', role: 'lead', avatar_initials: 'L' };

function renderPage(as = user) {
  return render(<NewsPage user={as} onLogout={vi.fn()} />);
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

// Writing into the feed and clearing items out of it — the only two things
// here anyone does on purpose. Both lead-only.
describe('NewsPage — a lead posting and deleting', () => {
  beforeEach(() => {
    vi.mocked(presenceApi.getTeam).mockResolvedValue({ data: [] } as any);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('offers the compose box and the delete buttons to a lead only', async () => {
    vi.mocked(teamApi.getNews).mockResolvedValue({ data: { rows: [newsItem()], hasMore: false, storedCount: 1 } } as any);

    const { unmount } = renderPage();
    await screen.findByText(/New Person/);
    expect(screen.queryByLabelText('Текст новости')).toBeNull();
    expect(screen.queryByLabelText('Удалить новость')).toBeNull();
    unmount();

    renderPage(lead);
    await screen.findByText(/New Person/);
    expect(screen.getByLabelText('Текст новости')).toBeInTheDocument();
    expect(screen.getByLabelText('Удалить новость')).toBeInTheDocument();
  });

  it('posts a trimmed announcement and shows it without refetching the whole feed', async () => {
    vi.mocked(teamApi.getNews).mockResolvedValue({ data: { rows: [], hasMore: false, storedCount: 0 } } as any);
    vi.mocked(teamApi.postNews).mockResolvedValue({ data: { id: 77 } } as any);

    renderPage(lead);
    await waitFor(() => expect(teamApi.getNews).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText('Текст новости'), { target: { value: '  В пятницу ретро  ' } });
    fireEvent.click(screen.getByText('Опубликовать'));

    await waitFor(() => expect(teamApi.postNews).toHaveBeenCalledWith('В пятницу ретро'));
    expect(await screen.findByText('В пятницу ретро')).toBeInTheDocument();
    // A refetch would re-run the birthday/leave computation and reset the
    // paging cursor, throwing away pages already loaded.
    expect(teamApi.getNews).toHaveBeenCalledTimes(1);
  });

  it('refuses to post an empty announcement', async () => {
    vi.mocked(teamApi.getNews).mockResolvedValue({ data: { rows: [], hasMore: false, storedCount: 0 } } as any);

    renderPage(lead);
    await waitFor(() => expect(teamApi.getNews).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('Текст новости'), { target: { value: '   ' } });
    fireEvent.click(screen.getByText('Опубликовать'));

    expect(await screen.findByText('Напиши текст новости')).toBeInTheDocument();
    expect(teamApi.postNews).not.toHaveBeenCalled();
  });

  it('never offers to delete a birthday or leave item — there is no row behind them', async () => {
    vi.mocked(teamApi.getNews).mockResolvedValue({ data: {
      rows: [
        newsItem({ id: 'birthday-4', event_type: 'birthday', name: 'Именинник' }),
        newsItem({ id: 5, event_type: 'member_joined', name: 'Обычный' }),
      ], hasMore: false, storedCount: 1,
    } } as any);

    renderPage(lead);
    await screen.findByText(/Именинник/);
    // One button for the stored row, none for the computed one.
    expect(screen.getAllByLabelText('Удалить новость')).toHaveLength(1);
  });

  it('puts the item back if the delete fails, rather than leaving the feed lying', async () => {
    vi.mocked(teamApi.getNews).mockResolvedValue({ data: { rows: [newsItem()], hasMore: false, storedCount: 1 } } as any);
    vi.mocked(teamApi.removeNews).mockRejectedValue(new Error('нет сети'));

    renderPage(lead);
    await screen.findByText(/New Person/);
    fireEvent.click(screen.getByLabelText('Удалить новость'));

    await waitFor(() => expect(teamApi.removeNews).toHaveBeenCalledWith(1));
    expect(await screen.findByText(/New Person/)).toBeInTheDocument();
  });
});
