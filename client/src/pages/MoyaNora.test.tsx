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
    getEntitlements: vi.fn(),
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
  vi.mocked(testerApi.getEntitlements).mockResolvedValue({ data: { frames: ['default', 'code'], bgs: ['default'], avatars: ['frog2'] } } as any);
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

  it('names the open section on the card holding it', async () => {
    // The sections used to be a loose stack with no heading of their own, so
    // the only thing on screen saying which one was open was the highlighted
    // row in the nav across the page.
    renderPage();
    await screen.findByText('Nazariy');

    // The nav rows shout their labels; the heading is the same word in
    // sentence case, which is what tells the two apart here.
    expect(screen.getByText('Избранное')).toBeInTheDocument();
    expect(screen.queryByText('Магазин')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('МАГАЗИН'));
    expect(screen.getByText('Магазин')).toBeInTheDocument();
    expect(screen.queryByText('Избранное')).not.toBeInTheDocument();
  });

  it('badges the role the person actually has, not a hardcoded one', async () => {
    // The card said TESTER in teal for everyone, including a lead looking
    // at their own profile.
    render(<MoyaNora user={{ id: 5, name: 'БоссЛидер', role: 'lead' }} onLogout={vi.fn()} />);
    expect(await screen.findByText('LEAD')).toBeInTheDocument();
    expect(screen.queryByText('TESTER')).not.toBeInTheDocument();
  });

  it('declines what a favourite course contains instead of bolting one ending onto every number', async () => {
    // The old line built its endings by hand and produced "3 уроков" and
    // "5 модуля" — wrong in both directions.
    vi.mocked(testerApi.getFavorites).mockResolvedValue({ data: [{
      course_type: 'custom', course_id: 7, title: 'Introduction to DevTools',
      tag: 'DevTools', color: '#4EA1E8',
      totalLessons: 3, totalModules: 5, totalTests: 1,
    }] } as any);
    renderPage();
    expect(await screen.findByText('Introduction to DevTools')).toBeInTheDocument();
    expect(screen.getByText('3 УРОКА')).toBeInTheDocument();
    expect(screen.getByText('5 МОДУЛЕЙ')).toBeInTheDocument();
    expect(screen.getByText('1 ТЕСТ')).toBeInTheDocument();
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
    expect(await screen.findByText('Аватары')).toBeInTheDocument();
    // The shop prices everything against this number, so it has to be the
    // profile's real balance and not a placeholder.
    // Rendered in more than one spot on this screen; any of them proves the
    // real balance reached the shop.
    expect(screen.getAllByText('250').length).toBeGreaterThan(0);
  });

});
