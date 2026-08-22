// The admin panel: user roles, the archive, the trash. The role dropdown is
// the single most destructive control in the app, so gating and confirmation
// matter more here than layout.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import AdminPage from './AdminPage';
import { adminApi, leadApi } from '../api';

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => vi.fn() };
});
vi.mock('../components/Navigation', () => ({ default: () => <div data-testid="nav" /> }));
vi.mock('../api', () => ({
  adminApi: {
    getUsers: vi.fn(), setUserRole: vi.fn(), resetPassword: vi.fn(), archiveUser: vi.fn(), restoreUser: vi.fn(),
    getOverview: vi.fn(),
    getBonusCandidates: vi.fn(), getTrash: vi.fn(), restoreTrash: vi.fn(), purgeTrash: vi.fn(),
  },
  leadApi: { getActivity: vi.fn(), getLectures: vi.fn(), setLectureVideo: vi.fn() },
}));

const admin = { id: 1, name: 'Admin', role: 'admin' };
const row = (o = {}) => ({
  id: 2, email: 'nazar@qa.com', name: 'Nazariy', role: 'tester', avatar_initials: 'NZ',
  created_at: '2026-01-01', archived_at: null, has_telegram: 0, must_change_password: 0, ...o,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(adminApi.getUsers).mockResolvedValue({ data: [row()] } as any);
  vi.mocked(adminApi.getOverview).mockResolvedValue({
    data: {
      totalUsers: 5, byRole: { tester: 3, lead: 1, admin: 1 }, viaEmail: 5, viaTelegram: 0,
      active7d: 2, active30d: 4, pendingPasswordResets: 0, coursesCreated: 0, guidesCreated: 0,
    },
  } as any);
  vi.mocked(adminApi.getTrash).mockResolvedValue({ data: [] } as any);
  vi.mocked(adminApi.getBonusCandidates).mockResolvedValue({ data: [] } as any);
  vi.mocked(leadApi.getActivity).mockResolvedValue({ data: { rows: [], hasMore: false } } as any);
  vi.mocked(leadApi.getLectures).mockResolvedValue({ data: [] } as any);
});

const renderPage = () => render(<AdminPage user={admin} onLogout={vi.fn()} />);

describe('AdminPage', () => {
  it('lists the users it fetched', async () => {
    renderPage();
    expect(await screen.findByText('Nazariy')).toBeInTheDocument();
  });

  it('says the list failed to load rather than showing an empty roster', async () => {
    vi.mocked(adminApi.getUsers).mockRejectedValue(new Error('down'));
    renderPage();
    expect(await screen.findByText(/Не удалось загрузить список пользователей/)).toBeInTheDocument();
  });

  it('filters by the search box', async () => {
    vi.mocked(adminApi.getUsers).mockResolvedValue({ data: [row(), row({ id: 3, name: 'Gleb', email: 'gleb@qa.com' })] } as any);
    renderPage();
    await screen.findByText('Nazariy');
    const search = screen.getByRole('textbox');
    fireEvent.change(search, { target: { value: 'Gleb' } });
    await waitFor(() => expect(screen.queryByText('Nazariy')).not.toBeInTheDocument());
    expect(screen.getByText('Gleb')).toBeInTheDocument();
  });

  it('sends a role change once it is confirmed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(adminApi.setUserRole).mockResolvedValue({ data: { ok: true } } as any);
    renderPage();
    await screen.findByText('Nazariy');
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'lead' } });
    await waitFor(() => expect(adminApi.setUserRole).toHaveBeenCalledWith(2, 'lead'));
  });

  it('does nothing when the role change is declined — the most destructive control here must not fire on a stray click', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPage();
    await screen.findByText('Nazariy');
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'admin' } });
    await waitFor(() => expect(window.confirm).toHaveBeenCalled());
    expect(adminApi.setUserRole).not.toHaveBeenCalled();
  });

  it('opens the trash tab and asks for it only then', async () => {
    renderPage();
    await screen.findByText('Nazariy');
    fireEvent.click(screen.getByRole('button', { name: 'Корзина' }));
    await waitFor(() => expect(adminApi.getTrash).toHaveBeenCalled());
  });

  it('opens the analytics tab', async () => {
    renderPage();
    await screen.findByText('Nazariy');
    fireEvent.click(screen.getByRole('button', { name: 'Аналитика' }));
    await waitFor(() => expect(adminApi.getOverview).toHaveBeenCalled());
  });

  it('opens the activity tab', async () => {
    renderPage();
    await screen.findByText('Nazariy');
    fireEvent.click(screen.getByRole('button', { name: 'Активность' }));
    await waitFor(() => expect(leadApi.getActivity).toHaveBeenCalled());
  });
});
