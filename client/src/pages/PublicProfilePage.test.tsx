import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import PublicProfilePage from './PublicProfilePage';
import { usersApi } from '../api';

let currentId = '5';
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate, useParams: () => ({ id: currentId }) };
});

// Navigation pulls in TelegramLinkWidget/ChangePasswordModal, which make
// their own API calls unrelated to what this file tests.
vi.mock('../components/Navigation', () => ({ default: () => <div data-testid="nav" /> }));

vi.mock('../api', () => ({
  usersApi: { getProfile: vi.fn() },
}));

const viewer = { id: 1, name: 'Viewer', role: 'tester' };

function renderPage() {
  return render(<PublicProfilePage user={viewer} onLogout={vi.fn()} />);
}

function fullProfile(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 5, email: 'a@b.com', name: 'Alex Alexeev', avatar_initials: 'AA', created_at: '2026-01-15T00:00:00Z',
    nickname: 'BugHunter', status_quote: 'Ищу баги днём и ночью', specialization: 'Frontend QA',
    info_box: 'Люблю чай', snail_joke: '', avatar_id: 'bug1', avatar_frame: 'default', profile_bg: 'default',
    showcase_badges: [], favorite_lecture_id: null, is_public: true, custom_avatar: null, gender: null,
    bug_coins: 100, purchased_items: [], streak: 3, craftable: [],
    favLecture: null,
    stats: { int: 5, per: 4, spd: 6, def: 3, bug_pwr: 12 },
    cards: [{ id: 1, user_id: 5, lecture_id: 1, skill_area: 'HTML', rarity: 'common', earned_at: '2026-01-01' }],
    badges: [{ id: 1, user_id: 5, badge_id: 'html', earned_at: '2026-01-01' }],
    workStart: '09:00', workEnd: '18:00', workDays: '1,2,3,4,5', timezone: 'Europe/Moscow',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  currentId = '5';
});

describe('PublicProfilePage', () => {
  it('renders the full profile when public', async () => {
    vi.mocked(usersApi.getProfile).mockResolvedValue({ data: fullProfile() } as any);

    renderPage();

    expect(await screen.findByText('BugHunter')).toBeInTheDocument();
    expect(screen.getByText('Frontend QA')).toBeInTheDocument();
    expect(screen.getByText('«Ищу баги днём и ночью»')).toBeInTheDocument();
    expect(screen.getByText(/09:00–18:00/)).toBeInTheDocument();
    expect(screen.getByText(/Москва/)).toBeInTheDocument();
    expect(screen.getByText(/Значков: 1/)).toBeInTheDocument();
    expect(screen.getByText(/Карточек: 1/)).toBeInTheDocument();
    expect(screen.getByText('Люблю чай')).toBeInTheDocument();
    expect(usersApi.getProfile).toHaveBeenCalledWith(5);
  });

  it('renders only avatar/name and "Профиль скрыт" for a private profile, hiding stats/quote/hours', async () => {
    vi.mocked(usersApi.getProfile).mockResolvedValue({
      data: { id: 5, name: 'Alex Alexeev', avatar_initials: 'AA', avatar_id: 'bug1', avatar_frame: 'default', custom_avatar: null, is_public: false },
    } as any);

    renderPage();

    expect(await screen.findByText('Профиль скрыт')).toBeInTheDocument();
    expect(screen.getByText('Alex Alexeev')).toBeInTheDocument(); // falls back to name (no nickname on the hidden shape)
    expect(screen.queryByText(/09:00/)).toBeNull();
    expect(screen.queryByText(/Значков/)).toBeNull();
  });

  it('shows an error message with a way back when the fetch fails', async () => {
    vi.mocked(usersApi.getProfile).mockRejectedValue({ response: { data: { error: 'Пользователь не найден' } } });

    renderPage();

    expect(await screen.findByText('Пользователь не найден')).toBeInTheDocument();
    expect(screen.getByText('← Назад')).toBeInTheDocument();
  });

  it('re-fetches the profile when the :id in the URL changes', async () => {
    vi.mocked(usersApi.getProfile).mockResolvedValue({ data: fullProfile() } as any);
    const { rerender } = renderPage();
    await waitFor(() => expect(usersApi.getProfile).toHaveBeenCalledWith(5));

    currentId = '7';
    vi.mocked(usersApi.getProfile).mockResolvedValue({ data: fullProfile({ id: 7, nickname: 'Someone Else' }) } as any);
    rerender(<PublicProfilePage user={viewer} onLogout={vi.fn()} />);

    await waitFor(() => expect(usersApi.getProfile).toHaveBeenCalledWith(7));
    expect(await screen.findByText('Someone Else')).toBeInTheDocument();
  });
});
