// Pure rendering, no API — but the whole point of the page is that a tester
// and a lead see different things, and that the points tables are lead-only.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import HelpPage from './HelpPage';
import { PREMIUM_POINT_GUIDE } from '../utils/coins';
import { faqFor, howToFor } from '../utils/helpContent';
import { leadApi } from '../api';

// The bug-coin table is served, not hard-coded — this page used to render a
// copy that had gone stale against the server. The rows below are
// deliberately not the real numbers: the test passes only if what renders
// came from the response.
vi.mock('../api', () => ({ leadApi: { getCoinRules: vi.fn() } }));

const SERVED_RULES = [
  { key: 'moduleCompleted', amount: 10, label: 'Модуль пройден — тестовая подпись' },
  { key: 'quizFirstTry', amount: 5, label: 'Сдан с первого раза — тестовая подпись' },
];

vi.mock('../components/Navigation', () => ({ default: () => <div data-testid="nav" /> }));

// The «Частые вопросы» tab embeds TeamQuestions, which fetches the team's
// asked questions. That component has its own file — here it only needs to
// not make a real request. See components/TeamQuestions.test.tsx.
vi.mock('../components/TeamQuestions', () => ({ default: () => <div data-testid="team-questions" /> }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(leadApi.getCoinRules).mockResolvedValue({ data: { rules: SERVED_RULES, passScore: 60, streakLength: 3 } } as any);
});

const renderFor = (role: string) => render(<HelpPage user={{ id: 1, name: 'X', role }} onLogout={vi.fn()} />);

// The FAQ moved behind the second tab when asking the team moved in beside
// it — everything reference-ish stayed on the first.
const openQuestions = () => fireEvent.click(screen.getByText('Частые вопросы'));

describe('HelpPage', () => {
  it('shows a tester everything they can do, and none of the lead material', () => {
    renderFor('tester');
    for (const item of howToFor('tester')) expect(screen.getByText(item.question)).toBeInTheDocument();
    expect(screen.queryByText(/Баг-коины: за что начисляет сервис/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Премиальные баллы: сколько начислять/)).not.toBeInTheDocument();
  });

  it('gives a lead both points tables, with every row', async () => {
    renderFor('lead');
    expect(screen.getByText(/Баг-коины: за что начисляет сервис/)).toBeInTheDocument();
    expect(screen.getByText(/Премиальные баллы: сколько начислять/)).toBeInTheDocument();
    for (const rule of SERVED_RULES) expect(await screen.findByText(rule.label)).toBeInTheDocument();
    for (const row of PREMIUM_POINT_GUIDE) expect(screen.getByText(row.action)).toBeInTheDocument();
  });

  it('shows the coin rows the server serves, not a copy kept in the client', async () => {
    renderFor('lead');
    expect(await screen.findByText('Модуль пройден — тестовая подпись')).toBeInTheDocument();
    // The scheme this page used to describe from memory.
    expect(screen.queryByText(/Тест сдан на 90% и выше/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Тест не сдан/)).not.toBeInTheDocument();
  });

  it('says so plainly when the breakdown cannot be loaded, instead of showing an empty table', async () => {
    // A request that never got an answer reports the connection, not the
    // generic fallback — see apiErrorMessage.
    vi.mocked(leadApi.getCoinRules).mockRejectedValue(new Error('down'));
    renderFor('lead');
    expect(await screen.findByText(/Нет связи с сервером/)).toBeInTheDocument();
  });

  it('does not ask for the breakdown at all for a tester, who cannot see it', () => {
    renderFor('tester');
    expect(leadApi.getCoinRules).not.toHaveBeenCalled();
  });

  it('treats an admin as a lead here, the way every server route does', () => {
    renderFor('admin');
    expect(screen.getByText(/Баг-коины: за что начисляет сервис/)).toBeInTheDocument();
    for (const item of howToFor('admin')) expect(screen.getByText(item.question)).toBeInTheDocument();
  });

  it('opens on the platform tab, with the FAQ one click away rather than gone', () => {
    renderFor('tester');
    expect(screen.getByText('Что тут можно делать')).toBeInTheDocument();
    expect(screen.queryByText(faqFor('tester')[0].q)).toBeNull();

    openQuestions();
    expect(screen.getByText(faqFor('tester')[0].q)).toBeInTheDocument();
    expect(screen.getByTestId('team-questions')).toBeInTheDocument();
    // ...and the reference material steps aside rather than stacking up.
    expect(screen.queryByText('Что тут можно делать')).toBeNull();
  });

  // Someone who read the FAQ and didn't find their answer should not have to
  // discover that asking happens on a different page. It's on this one.
  it('puts asking the team on the same tab as the FAQ', () => {
    renderFor('tester');
    openQuestions();
    expect(screen.getByText('Вопросы команды')).toBeInTheDocument();
    expect(screen.getByTestId('team-questions')).toBeInTheDocument();
  });

  it('opens the first FAQ answer by default and swaps to another on click', () => {
    renderFor('tester');
    openQuestions();
    const faq = faqFor('tester');
    expect(screen.getByText(faq[0].a)).toBeInTheDocument();
    fireEvent.click(screen.getByText(faq[1].q));
    expect(screen.getByText(faq[1].a)).toBeInTheDocument();
    expect(screen.queryByText(faq[0].a)).not.toBeInTheDocument();
  });

  it('shows the tester FAQ to a tester and the lead FAQ to a lead — not both', () => {
    const { unmount } = renderFor('tester');
    openQuestions();
    for (const item of faqFor('tester')) expect(screen.getByText(item.q)).toBeInTheDocument();
    expect(screen.queryByText(faqFor('lead')[0].q)).not.toBeInTheDocument();
    unmount();

    renderFor('lead');
    openQuestions();
    for (const item of faqFor('lead')) expect(screen.getByText(item.q)).toBeInTheDocument();
  });
});
