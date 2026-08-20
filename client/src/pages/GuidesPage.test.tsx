import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import GuidesPage from './GuidesPage';
import { guidesApi, knowledgeApi } from '../api';

// Navigation pulls in TelegramLinkWidget/ChangePasswordModal, which make
// their own API calls unrelated to what this file tests.
vi.mock('../components/Navigation', () => ({ default: () => <div data-testid="nav" /> }));

vi.mock('../api', () => ({
  guidesApi: {
    list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), approve: vi.fn(), renameCategory: vi.fn(),
  },
  knowledgeApi: { getMyPermissions: vi.fn() },
}));

const tester = { id: 1, name: 'Tester', role: 'tester' };
const lead = { id: 9, name: 'Lead', role: 'lead' };

function guideListItem(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 1, title: 'Гайд', category: 'Общее', icon: null, updated_at: '2020-01-01T00:00:00Z',
    is_published: true, proposal_status: null, created_by: 9, author_name: 'Lead',
    ...overrides,
  };
}

const EMPTY_DOC = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Текст гайда' }] }] });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(knowledgeApi.getMyPermissions).mockResolvedValue({ data: [] } as any);
});

function renderPage(user: any = tester) {
  return render(<GuidesPage user={user} onLogout={vi.fn()} />);
}

describe('GuidesPage — list with icons', () => {
  it('renders a guide title with its icon badge in the sidebar list', async () => {
    vi.mocked(guidesApi.list).mockResolvedValue({ data: [guideListItem({ icon: 'wrench', title: 'Гайд про сплиты' })] } as any);
    renderPage();

    await screen.findByText('Гайд про сплиты');
  });

  it('does not put an emoji back on screen for a guide saved before the icon set', async () => {
    // The icon used to be any character at all, which is how emoji got into
    // a set of hand-drawn svgs in the first place. An unrecognised value
    // falls back to the default glyph rather than being rendered as text.
    vi.mocked(guidesApi.list).mockResolvedValue({ data: [guideListItem({ icon: '\u{1F4D8}', title: 'Старый гайд' })] } as any);
    renderPage();

    await screen.findByText('Старый гайд');
    expect(screen.queryByText('\u{1F4D8}')).not.toBeInTheDocument();
  });

  it('renders a fallback icon when none is set, without crashing', async () => {
    vi.mocked(guidesApi.list).mockResolvedValue({ data: [guideListItem({ icon: null, title: 'Гайд без иконки' })] } as any);
    renderPage();

    await screen.findByText('Гайд без иконки');
  });

  it('opening a guide renders its content via the read-only editor', async () => {
    vi.mocked(guidesApi.list).mockResolvedValue({ data: [guideListItem({ title: 'Открываемый гайд' })] } as any);
    vi.mocked(guidesApi.get).mockResolvedValue({ data: { ...guideListItem({ title: 'Открываемый гайд' }), content: EMPTY_DOC } } as any);
    renderPage();

    fireEvent.click(await screen.findByText('Открываемый гайд'));
    await waitFor(() => expect(guidesApi.get).toHaveBeenCalledWith(1));
    await screen.findByText('Текст гайда');
  });
});

describe('GuidesPage — category rename (lead only)', () => {
  it('a plain tester does not see the rename control next to a category', async () => {
    vi.mocked(guidesApi.list).mockResolvedValue({ data: [guideListItem({ category: 'Разработка' })] } as any);
    renderPage(tester);

    await screen.findByText('Разработка');
    expect(screen.queryByLabelText('Переименовать категорию Разработка')).toBeNull();
  });

  it('a lead can rename a category inline', async () => {
    vi.mocked(guidesApi.list).mockResolvedValue({ data: [guideListItem({ category: 'Разработка' })] } as any);
    vi.mocked(guidesApi.renameCategory).mockResolvedValue({ data: { ok: true } } as any);
    renderPage(lead);

    await screen.findByText('Разработка');
    fireEvent.click(screen.getByLabelText('Переименовать категорию Разработка'));

    const input = screen.getByDisplayValue('Разработка');
    fireEvent.change(input, { target: { value: 'QA' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(guidesApi.renameCategory).toHaveBeenCalledWith('Разработка', 'QA'));
  });
});

describe('GuidesPage — create form', () => {
  it('a lead sees the direct-create button and an icon picker in the form', async () => {
    vi.mocked(guidesApi.list).mockResolvedValue({ data: [] } as any);
    renderPage(lead);

    await waitFor(() => expect(guidesApi.list).toHaveBeenCalled());
    fireEvent.click(screen.getByText('+ Новый гайд'));

    expect(screen.getByPlaceholderText('Заголовок')).toBeInTheDocument();
    expect(screen.getByLabelText('Выбрать иконку')).toBeInTheDocument();
  });

  it('a plain tester sees "Предложить гайд" instead of a direct-create button', async () => {
    vi.mocked(guidesApi.list).mockResolvedValue({ data: [] } as any);
    renderPage(tester);

    await waitFor(() => expect(guidesApi.list).toHaveBeenCalled());
    expect(screen.getByText('Предложить гайд')).toBeInTheDocument();
    expect(screen.queryByText('+ Новый гайд')).toBeNull();
  });
});
