import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ZhukademiPage from './ZhukademiPage';
import { testerApi, leadApi, coursesApi } from '../api';

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => vi.fn() };
});

// Navigation pulls in TelegramLinkWidget/ChangePasswordModal, which make
// their own API calls unrelated to what this file tests.
vi.mock('../components/Navigation', () => ({ default: () => <div data-testid="nav" /> }));

vi.mock('../api', () => ({
  testerApi: { getLectures: vi.fn(), getFavorites: vi.fn(), addFavorite: vi.fn(), removeFavorite: vi.fn() },
  leadApi: { getLectureStats: vi.fn() },
  coursesApi: {
    list: vi.fn(), remove: vi.fn(), update: vi.fn(),
    getSections: vi.fn(), createSection: vi.fn(), renameSection: vi.fn(), removeSection: vi.fn(),
  },
}));

const tester = { id: 1, name: 'Tester', role: 'tester' };
const lead = { id: 9, name: 'Lead', role: 'lead' };

function customCourse(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 1, title: 'Курс', tag: 'Custom', color: '#66FCF1', is_published: true,
    is_onboarding: false, section_id: null, section_name: null,
    proposal_status: null, created_by: 9, author_name: 'Lead',
    created_at: '2020-01-01T00:00:00Z', viewed: true,
    ...overrides,
  };
}

// The courses list and the sections list are separate calls now, so they
// are stubbed separately instead of being told apart by URL.
function mockRoutes({ courses = [], sections = [] }: { courses?: any[]; sections?: any[] }) {
  vi.mocked(coursesApi.list).mockResolvedValue({ data: courses } as any);
  vi.mocked(coursesApi.getSections).mockResolvedValue({ data: sections } as any);
  for (const fn of [coursesApi.remove, coursesApi.update, coursesApi.createSection, coursesApi.renameSection, coursesApi.removeSection]) {
    vi.mocked(fn).mockResolvedValue({ data: { ok: true } } as any);
  }
}

function mockCustomCourses(rows: any[]) {
  mockRoutes({ courses: rows, sections: [] });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(testerApi.getLectures).mockResolvedValue({ data: [] } as any);
  vi.mocked(testerApi.getFavorites).mockResolvedValue({ data: [] } as any);
  vi.mocked(leadApi.getLectureStats).mockResolvedValue({ data: [] } as any);
});

function renderPage(user: any = tester) {
  return render(<ZhukademiPage user={user} onLogout={vi.fn()} />);
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

describe('ZhukademiPage — course sections (public catalog grouping)', () => {
  it('shows a flat grid with no section headings when no sections exist yet', async () => {
    mockRoutes({ courses: [customCourse({ id: 1, title: 'Курс без разделов' })], sections: [] });
    renderPage();

    await screen.findByText('Курс без разделов');
    expect(screen.queryByText('БЕЗ РАЗДЕЛА')).toBeNull();
  });

  it('groups courses under their section heading, with an unfiled bucket last', async () => {
    mockRoutes({
      courses: [
        customCourse({ id: 1, title: 'Курс основ', section_id: 1, section_name: 'Основы' }),
        customCourse({ id: 2, title: 'Курс продвинутого', section_id: 2, section_name: 'Продвинутое' }),
        customCourse({ id: 3, title: 'Курс без раздела' }),
      ],
      sections: [{ id: 1, name: 'Основы' }, { id: 2, name: 'Продвинутое' }],
    });
    renderPage();

    await screen.findByText('Курс основ');
    expect(screen.getByText('ОСНОВЫ')).toBeInTheDocument();
    expect(screen.getByText('ПРОДВИНУТОЕ')).toBeInTheDocument();
    expect(screen.getByText('БЕЗ РАЗДЕЛА')).toBeInTheDocument();
    expect(screen.getByText('Курс продвинутого')).toBeInTheDocument();
    expect(screen.getByText('Курс без раздела')).toBeInTheDocument();
  });

  it('a plain tester never sees the section-management panel', async () => {
    mockRoutes({ courses: [customCourse({ id: 1, title: 'Курс' })], sections: [{ id: 1, name: 'Основы' }] });
    renderPage();

    await screen.findByText('Курс');
    expect(screen.queryByPlaceholderText('Например: Основы')).toBeNull();
  });

  it('a lead sees the section-management panel and can create a new section', async () => {
    mockRoutes({ courses: [customCourse({ id: 1, title: 'Курс', created_by: lead.id })], sections: [] });
    renderPage(lead);

    const input = await screen.findByPlaceholderText('Например: Основы');
    fireEvent.change(input, { target: { value: 'Новый раздел' } });
    fireEvent.click(screen.getByText('+ Раздел'));

    await waitFor(() => expect(coursesApi.createSection).toHaveBeenCalledWith('Новый раздел'));
  });

  it('a lead can reassign a course to a section from its card', async () => {
    mockRoutes({
      courses: [customCourse({ id: 5, title: 'Курс для переноса', created_by: lead.id })],
      sections: [{ id: 1, name: 'Основы' }],
    });
    renderPage(lead);

    const select = await screen.findByLabelText('Раздел для курса Курс для переноса');
    fireEvent.change(select, { target: { value: '1' } });

    // Only section_id goes in the body — the route treats every field as
    // optional, so the course's modules are never at risk from this.
    await waitFor(() => expect(coursesApi.update).toHaveBeenCalledWith(5, { section_id: 1 }));
  });
});
