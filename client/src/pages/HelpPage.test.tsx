// Pure rendering, no API — but the whole point of the page is that a tester
// and a lead see different things, and that the points tables are lead-only.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import HelpPage from './HelpPage';
import { COIN_REWARDS, PREMIUM_POINT_GUIDE } from '../utils/coins';
import { faqFor, howToFor } from '../utils/helpContent';

vi.mock('../components/Navigation', () => ({ default: () => <div data-testid="nav" /> }));

// The «Частые вопросы» tab embeds TeamQuestions, which fetches the team's
// asked questions. That component has its own file — here it only needs to
// not make a real request. See components/TeamQuestions.test.tsx.
vi.mock('../components/TeamQuestions', () => ({ default: () => <div data-testid="team-questions" /> }));

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

  it('gives a lead both points tables, with every row', () => {
    renderFor('lead');
    expect(screen.getByText(/Баг-коины: за что начисляет сервис/)).toBeInTheDocument();
    expect(screen.getByText(/Премиальные баллы: сколько начислять/)).toBeInTheDocument();
    for (const row of COIN_REWARDS) expect(screen.getByText(row.action)).toBeInTheDocument();
    for (const row of PREMIUM_POINT_GUIDE) expect(screen.getByText(row.action)).toBeInTheDocument();
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
