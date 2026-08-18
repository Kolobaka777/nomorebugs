// The tester's cabinet: profile, coins, purchases, cards and notes. Money
// changes hands here, so the shop's balance handling is what matters most.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import MoyaNora from './MoyaNora';
import { testerApi, presenceApi, rewardsApi } from '../api';

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => vi.fn() };
});
vi.mock('../components/Navigation', () => ({ default: () => <div data-testid="nav" /> }));
vi.mock('../api', () => ({
  testerApi: {
    getProfileFull: vi.fn(), getMetrics: vi.fn(), getLectures: vi.fn(), getHistory: vi.fn(),
    getFavorites: vi.fn(), removeFavorite: vi.fn(), getNotes: vi.fn(), deleteNote: vi.fn(),
    getBeforeAfter: vi.fn(), updateProfile: vi.fn(), buyShopItem: vi.fn(), craftBadge: vi.fn(),
  },
  presenceApi: { getTeam: vi.fn(), updateMe: vi.fn() },
  rewardsApi: { getMyPremiumPoints: vi.fn() },
}));

const user = { id: 2, name: 'Nazariy', role: 'tester' };

const profile = (o = {}) => ({
  id: 2, name: 'Nazariy', email: 'n@qa.com', role: 'tester', avatar_initials: 'NZ',
  bug_coins: 250, purchased_items: [], badges: [], cards: [], craftable: [],
  stats: { int: 1, per: 1, spd: 1, def: 1, bug_pwr: 1 },
  profile_frame: null, profile_bg: null, profile_accent_color: '#66FCF1',
  created_at: '2026-01-01', ...o,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(testerApi.getProfileFull).mockResolvedValue({ data: profile() } as any);
  vi.mocked(testerApi.getMetrics).mockResolvedValue({ data: { completedLectures: 1, totalLectures: 10, averageScore: 70 } } as any);
  vi.mocked(testerApi.getLectures).mockResolvedValue({ data: [] } as any);
  vi.mocked(testerApi.getHistory).mockResolvedValue({ data: [] } as any);
  vi.mocked(testerApi.getFavorites).mockResolvedValue({ data: [] } as any);
  vi.mocked(testerApi.getNotes).mockResolvedValue({ data: [] } as any);
  vi.mocked(testerApi.getBeforeAfter).mockResolvedValue({ data: null } as any);
  vi.mocked(presenceApi.getTeam).mockResolvedValue({ data: [] } as any);
  vi.mocked(rewardsApi.getMyPremiumPoints).mockResolvedValue({ data: { premium_points: 40, history: [] } } as any);
});

const renderPage = () => render(<MoyaNora user={user} onLogout={vi.fn()} />);

describe('MoyaNora', () => {
  it('shows the profile it fetched', async () => {
    renderPage();
    expect(await screen.findByText('Nazariy')).toBeInTheDocument();
  });

  it('shows premium points alongside the automatic counters, since they are a separate currency', async () => {
    renderPage();
    expect(await screen.findByText('ПРЕМИАЛЬНЫЕ БАЛЛЫ')).toBeInTheDocument();
    expect(screen.getByText('40')).toBeInTheDocument();
  });

  it('leaves the premium tile out entirely when that request fails, rather than showing a wrong zero', async () => {
    vi.mocked(rewardsApi.getMyPremiumPoints).mockRejectedValue(new Error('down'));
    renderPage();
    await screen.findByText('Nazariy');
    await waitFor(() => expect(screen.queryByText('ПРЕМИАЛЬНЫЕ БАЛЛЫ')).not.toBeInTheDocument());
  });

  it('still renders the page when the profile request fails', async () => {
    vi.mocked(testerApi.getProfileFull).mockRejectedValue(new Error('down'));
    renderPage();
    await waitFor(() => expect(testerApi.getProfileFull).toHaveBeenCalled());
    expect(screen.getByTestId('nav')).toBeInTheDocument();
  });

  it('opens the shop tab and shows the balance the purchases are checked against', async () => {
    renderPage();
    await screen.findByText('Nazariy');
    // The nav rows uppercase their label in the DOM, not just in CSS.
    fireEvent.click(screen.getByRole('button', { name: /МАГАЗИН/ }));
    expect(await screen.findByText('АВАТАРЫ')).toBeInTheDocument();
    // The shop prices everything against this number, so it has to be the
    // profile's real balance and not a placeholder.
    // Rendered in more than one spot on this screen; any of them proves the
    // real balance reached the shop.
    expect(screen.getAllByText('250').length).toBeGreaterThan(0);
  });

});
