// The lead/admin's own profile page. Unlike the tester cabinet it doubles as
// a small dashboard, and what it asks for depends on the role.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ProfilePage from './ProfilePage';
import { testerApi, leadApi, adminApi } from '../api';

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => vi.fn() };
});
vi.mock('../components/Navigation', () => ({ default: () => <div data-testid="nav" /> }));
vi.mock('../api', () => ({
  testerApi: { getProfileFull: vi.fn() },
  leadApi: { getTeam: vi.fn(), getActivity: vi.fn(), getBonusAwards: vi.fn() },
  adminApi: { getUsers: vi.fn(), getOverview: vi.fn() },
}));

const lead = { id: 1, name: 'Alex Lead', email: 'lead@qa.com', role: 'lead' };
const admin = { ...lead, id: 9, name: 'Root', role: 'admin' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(testerApi.getProfileFull).mockResolvedValue({
    data: { id: 1, name: 'Alex Lead', email: 'lead@qa.com', role: 'lead', avatar_initials: 'AL', created_at: '2026-01-01' },
  } as any);
  vi.mocked(leadApi.getTeam).mockResolvedValue({ data: [] } as any);
  vi.mocked(leadApi.getActivity).mockResolvedValue({ data: { rows: [], hasMore: false } } as any);
  vi.mocked(leadApi.getBonusAwards).mockResolvedValue({ data: [] } as any);
  vi.mocked(adminApi.getUsers).mockResolvedValue({ data: [] } as any);
  vi.mocked(adminApi.getOverview).mockResolvedValue({ data: { totalUsers: 1, byRole: { lead: 1 } } } as any);
});

const renderFor = (user: any) => render(<ProfilePage user={user} onLogout={vi.fn()} />);

describe('ProfilePage', () => {
  it('shows the profile it fetched', async () => {
    renderFor(lead);
    expect(await screen.findByText('Alex Lead')).toBeInTheDocument();
  });

  it('pulls the team for a lead', async () => {
    renderFor(lead);
    await waitFor(() => expect(leadApi.getTeam).toHaveBeenCalled());
  });

  it('still renders when every dashboard request fails — the profile itself is the point', async () => {
    vi.mocked(leadApi.getTeam).mockRejectedValue(new Error('down'));
    vi.mocked(leadApi.getActivity).mockRejectedValue(new Error('down'));
    vi.mocked(leadApi.getBonusAwards).mockRejectedValue(new Error('down'));
    renderFor(lead);
    expect(await screen.findByText('Alex Lead')).toBeInTheDocument();
  });

  it('renders for an admin too', async () => {
    vi.mocked(testerApi.getProfileFull).mockResolvedValue({
      data: { id: 9, name: 'Root', email: 'root@qa.com', role: 'admin', avatar_initials: 'RT', created_at: '2026-01-01' },
    } as any);
    renderFor(admin);
    expect(await screen.findByText('Root')).toBeInTheDocument();
  });
});
