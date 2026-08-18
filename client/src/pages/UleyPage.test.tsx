// The lead's control room: team progress, lecture analytics, ratings and the
// activity feed, plus the actions that only a lead may take.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import UleyPage from './UleyPage';
import { leadApi, permissionsApi, presenceApi, adminApi } from '../api';

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => vi.fn() };
});
vi.mock('../components/Navigation', () => ({ default: () => <div data-testid="nav" /> }));
vi.mock('../api', () => ({
  leadApi: {
    getTeam: vi.fn(), getLectureStats: vi.fn(), getActivity: vi.fn(), getBeforeAfter: vi.fn(),
    getBeforeAfterByTester: vi.fn(), getInternalRatings: vi.fn(), getArchivedTesters: vi.fn(),
    updateTeamNote: vi.fn(),
  },
  permissionsApi: { list: vi.fn(), grant: vi.fn(), revoke: vi.fn() },
  presenceApi: { getTeam: vi.fn() },
  adminApi: { archiveUser: vi.fn(), restoreUser: vi.fn(), resetPassword: vi.fn() },
}));

const lead = { id: 1, name: 'Lead', role: 'lead' };

const member = (o = {}) => ({
  id: 2, name: 'Nazariy', avatar_initials: 'NZ', progress: 40, averageScore: 75,
  completedLectures: 4, totalLectures: 10, note: '', gender: null, ...o,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(leadApi.getTeam).mockResolvedValue({ data: [member()] } as any);
  vi.mocked(leadApi.getLectureStats).mockResolvedValue({ data: [] } as any);
  vi.mocked(leadApi.getActivity).mockResolvedValue({ data: { rows: [], hasMore: false } } as any);
  vi.mocked(leadApi.getBeforeAfter).mockResolvedValue({ data: [] } as any);
  vi.mocked(leadApi.getBeforeAfterByTester).mockResolvedValue({ data: [] } as any);
  vi.mocked(leadApi.getInternalRatings).mockResolvedValue({ data: [] } as any);
  vi.mocked(leadApi.getArchivedTesters).mockResolvedValue({ data: [] } as any);
  vi.mocked(permissionsApi.list).mockResolvedValue({ data: [] } as any);
  vi.mocked(presenceApi.getTeam).mockResolvedValue({ data: [] } as any);
});

const renderPage = (user = lead) => render(<UleyPage user={user} onLogout={vi.fn()} />);

describe('UleyPage', () => {
  it('shows the team it fetched', async () => {
    renderPage();
    expect(await screen.findByText('Nazariy')).toBeInTheDocument();
  });

  it('says the load failed instead of showing an empty team', async () => {
    vi.mocked(leadApi.getTeam).mockRejectedValue(new Error('down'));
    renderPage();
    expect(await screen.findByText('Не удалось загрузить данные команды')).toBeInTheDocument();
  });

  it('summarises the team above the tabs', async () => {
    vi.mocked(leadApi.getTeam).mockResolvedValue({ data: [member(), member({ id: 3, name: 'Gleb' })] } as any);
    renderPage();
    await screen.findByText('Nazariy');
    expect(screen.getByText('Человек в команде')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('switches to the lecture analytics tab and loads its data', async () => {
    vi.mocked(leadApi.getLectureStats).mockResolvedValue({
      data: [{ id: 1, title: 'HTML', averageScore: 82, passRate: 90, attempts: 10 }],
    } as any);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Лекции/ }));
    expect(await screen.findByText('HTML')).toBeInTheDocument();
  });

  it('loads the hidden internal ratings only when that tab is opened', async () => {
    renderPage();
    await screen.findByText('Nazariy');
    expect(leadApi.getInternalRatings).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Рейтинг/ }));
    await waitFor(() => expect(leadApi.getInternalRatings).toHaveBeenCalled());
  });

  it('reports a ratings failure in place rather than blanking the tab', async () => {
    vi.mocked(leadApi.getInternalRatings).mockRejectedValue({ response: { data: { error: 'Нет доступа' } } });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Рейтинг/ }));
    expect(await screen.findByText('Нет доступа')).toBeInTheDocument();
  });

  it('opens the activity feed tab', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Лягушачье болото/ }));
    await waitFor(() => expect(leadApi.getActivity).toHaveBeenCalled());
  });

  it('shows the before/after tab', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /До\/После/ }));
    await waitFor(() => expect(leadApi.getBeforeAfter).toHaveBeenCalled());
  });
});
