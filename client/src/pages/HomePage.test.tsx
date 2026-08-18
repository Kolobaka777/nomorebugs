// The landing page. It fetches a different set of things for a tester than
// for a lead, and every one of those calls is optional — a failure must not
// take the page down with it.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import HomePage from './HomePage';
import { statsApi, testerApi, leadApi, teamApi } from '../api';

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => vi.fn() };
});
vi.mock('../components/Navigation', () => ({ default: () => <div data-testid="nav" /> }));
vi.mock('../api', () => ({
  statsApi: { getGlobal: vi.fn() },
  testerApi: { getMetrics: vi.fn(), getMyActivity: vi.fn() },
  leadApi: { getTeam: vi.fn(), getActivity: vi.fn() },
  teamApi: { getNews: vi.fn() },
}));

const tester = { id: 2, name: 'Nazariy', role: 'tester' };
const lead = { id: 1, name: 'Lead', role: 'lead' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(statsApi.getGlobal).mockResolvedValue({ data: { users: 5, lectures: 10 } } as any);
  vi.mocked(testerApi.getMetrics).mockResolvedValue({ data: { completedLectures: 2, totalLectures: 10, averageScore: 80 } } as any);
  vi.mocked(testerApi.getMyActivity).mockResolvedValue({ data: { rows: [], hasMore: false } } as any);
  vi.mocked(leadApi.getTeam).mockResolvedValue({ data: [] } as any);
  vi.mocked(leadApi.getActivity).mockResolvedValue({ data: { rows: [], hasMore: false } } as any);
  vi.mocked(teamApi.getNews).mockResolvedValue({ data: { rows: [], hasMore: false } } as any);
});

const renderFor = (user: any) => render(<HomePage user={user} onLogout={vi.fn()} />);

describe('HomePage', () => {
  it('greets the person by name', async () => {
    renderFor(tester);
    expect(await screen.findByText(/Nazariy/)).toBeInTheDocument();
  });

  it('asks for a tester\'s own metrics, and not for the team roster', async () => {
    renderFor(tester);
    await waitFor(() => expect(testerApi.getMetrics).toHaveBeenCalled());
    expect(leadApi.getTeam).not.toHaveBeenCalled();
  });

  it('asks for the team, and not for personal metrics, when a lead opens it', async () => {
    renderFor(lead);
    await waitFor(() => expect(leadApi.getTeam).toHaveBeenCalled());
    expect(testerApi.getMetrics).not.toHaveBeenCalled();
  });

  it('still renders when every optional fetch fails — none of them is load-bearing', async () => {
    vi.mocked(statsApi.getGlobal).mockRejectedValue(new Error('down'));
    vi.mocked(testerApi.getMetrics).mockRejectedValue(new Error('down'));
    vi.mocked(testerApi.getMyActivity).mockRejectedValue(new Error('down'));
    vi.mocked(teamApi.getNews).mockRejectedValue(new Error('down'));
    renderFor(tester);
    expect(await screen.findByText(/Nazariy/)).toBeInTheDocument();
  });
});
