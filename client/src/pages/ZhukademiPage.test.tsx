import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ZhukademiPage from './ZhukademiPage';
import { testerApi } from '../api';
import { authFetch } from '../auth';

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => vi.fn() };
});

// Navigation pulls in TelegramLinkWidget/ChangePasswordModal, which make
// their own API calls unrelated to what this file tests.
vi.mock('../components/Navigation', () => ({ default: () => <div data-testid="nav" /> }));

vi.mock('../api', () => ({
  testerApi: { getLectures: vi.fn() },
  leadApi: { getLectureStats: vi.fn() },
}));

vi.mock('../auth', () => ({ authFetch: vi.fn() }));

const tester = { id: 1, name: 'Tester', role: 'tester' };

function customCourse(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 1, title: 'Курс', tag: 'Custom', color: '#66FCF1', is_published: true,
    is_onboarding: false, proposal_status: null, created_by: 9, author_name: 'Lead',
    created_at: '2020-01-01T00:00:00Z', viewed: true,
    ...overrides,
  };
}

function mockCustomCourses(rows: any[]) {
  vi.mocked(authFetch).mockResolvedValue({ ok: true, json: async () => rows } as any);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(testerApi.getLectures).mockResolvedValue({ data: [] } as any);
});

function renderPage() {
  return render(<ZhukademiPage user={tester} onLogout={vi.fn()} />);
}

describe('ZhukademiPage — «Для новичков» section', () => {
  it('renders an onboarding course in its own section, separate from "Дополнительные курсы"', async () => {
    mockCustomCourses([
      customCourse({ id: 1, title: 'Курс для новичков', is_onboarding: true }),
      customCourse({ id: 2, title: 'Обычный курс', is_onboarding: false }),
    ]);
    renderPage();

    await screen.findByText('Для новичков');
    expect(screen.getByText('Курс для новичков')).toBeInTheDocument();
    expect(screen.getByText('Обычный курс')).toBeInTheDocument();
    expect(screen.getByText('Дополнительные курсы')).toBeInTheDocument();
  });

  it('does not show the section at all when there is no onboarding course', async () => {
    mockCustomCourses([customCourse({ id: 2, title: 'Обычный курс', is_onboarding: false })]);
    renderPage();

    await screen.findByText('Обычный курс');
    expect(screen.queryByText('Для новичков')).toBeNull();
  });

  it('an onboarding course stays visible even while a topic-tag filter is active', async () => {
    mockCustomCourses([
      customCourse({ id: 1, title: 'Курс для новичков', is_onboarding: true, tag: 'Custom' }),
      customCourse({ id: 2, title: 'HTML курс', is_onboarding: false, tag: 'HTML' }),
      customCourse({ id: 3, title: 'CSS курс', is_onboarding: false, tag: 'CSS' }),
    ]);
    renderPage();

    await screen.findByText('Курс для новичков');
    fireEvent.click(screen.getByRole('button', { name: 'HTML' }));

    // Filtering to "HTML" hides the non-matching regular course...
    await waitFor(() => expect(screen.queryByText('CSS курс')).toBeNull());
    // ...but the onboarding section is unaffected by the filter entirely —
    // it stays regardless of which (or whether any) tag is active.
    expect(screen.getByText('Курс для новичков')).toBeInTheDocument();
  });

  it('a draft onboarding course is hidden (display:none, not absent) from a plain tester who isn\'t its author', async () => {
    mockCustomCourses([
      customCourse({ id: 1, title: 'Черновик вводного', is_onboarding: true, is_published: false, created_by: 9 }),
    ]);
    renderPage();

    // Same soft-hide convention as the regular "Дополнительные курсы" grid
    // (the server already only sends rows this user may see; this is a
    // belt-and-suspenders client mirror, not the real access boundary) —
    // the row stays in the DOM with display:none rather than being absent.
    await waitFor(() => expect(testerApi.getLectures).toHaveBeenCalled());
    expect(screen.getByText('Черновик вводного')).not.toBeVisible();
  });
});
