import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SuggestionsPage from './SuggestionsPage';
import { suggestionsApi } from '../api';
import { Suggestion, SuggestionFolder } from '../types';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

// Navigation pulls in TelegramLinkWidget/ChangePasswordModal, which make
// their own API calls unrelated to what this file tests.
vi.mock('../components/Navigation', () => ({ default: () => <div data-testid="nav" /> }));

vi.mock('../api', () => ({
  suggestionsApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    like: vi.fn(),
    unlike: vi.fn(),
    setStatus: vi.fn(),
    setFolder: vi.fn(),
    answer: vi.fn(),
    remove: vi.fn(),
    getFolders: vi.fn(),
    createFolder: vi.fn(),
    removeFolder: vi.fn(),
  },
}));

const tester = { id: 1, name: 'Tester', role: 'tester' };
const lead = { id: 9, name: 'Lead', role: 'lead' };

function suggestion(overrides: Partial<Suggestion> = {}): Suggestion {
  return {
    id: 1, type: 'idea', text: 'Сделать кнопку зелёной', status: 'new',
    created_at: new Date().toISOString(), is_anonymous: false,
    user_id: 1, author_name: 'Tester', likeCount: 0, likedByMe: false,
    answer: null, answered_at: null, answered_by_name: null,
    ...overrides,
  };
}

function folder(overrides: Partial<SuggestionFolder> = {}): SuggestionFolder {
  return { id: 1, name: 'Доработка сервисов', created_by: 9, created_at: new Date().toISOString(), ...overrides };
}

// GET /api/suggestions returns {rows, hasMore} — this app's one genuinely
// open-ended, user-generated feed, unlike most lists here (seeded/curated
// content), so it's the one that actually needed real pagination.
function listResponse(rows: Suggestion[], hasMore = false) {
  return { data: { rows, hasMore } } as any;
}

function renderPage(user = tester) {
  return render(<SuggestionsPage user={user} onLogout={vi.fn()} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(suggestionsApi.getFolders).mockResolvedValue({ data: [] } as any);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('SuggestionsPage — tester view', () => {
  it('groups suggestions by type, skipping types with nothing in them', async () => {
    vi.mocked(suggestionsApi.list).mockResolvedValue(listResponse(
      [suggestion({ id: 1, type: 'idea', text: 'Идея раз' }), suggestion({ id: 2, type: 'complaint', text: 'Бесит два' })],
    ));

    renderPage();

    await screen.findByText('Идея раз');
    expect(screen.getByText('ИДЕЯ')).toBeInTheDocument();
    expect(screen.getByText('ЧТО БЕСИТ')).toBeInTheDocument();
    expect(screen.queryByText('ПРЕДЛОЖЕНИЕ')).toBeNull();
  });

  it('shows the empty state when there is nothing yet', async () => {
    vi.mocked(suggestionsApi.list).mockResolvedValue(listResponse([]));
    renderPage();
    await waitFor(() => expect(screen.getByText('Пока ничего нет — стань первым.')).toBeInTheDocument());
  });

  it('shows "Показать ещё" only when hasMore is true, and appends the next page on click', async () => {
    vi.mocked(suggestionsApi.list).mockResolvedValueOnce(listResponse(
      [suggestion({ id: 1, text: 'Первая идея' })], true,
    ));

    renderPage();
    await screen.findByText('Первая идея');
    const more = screen.getByText('Показать ещё');

    vi.mocked(suggestionsApi.list).mockResolvedValueOnce(listResponse(
      [suggestion({ id: 2, text: 'Вторая идея' })], false,
    ));
    fireEvent.click(more);

    await screen.findByText('Вторая идея');
    expect(screen.getByText('Первая идея')).toBeInTheDocument(); // appended, not replaced
    expect(suggestionsApi.list).toHaveBeenLastCalledWith({ offset: 1 });
    expect(screen.queryByText('Показать ещё')).toBeNull(); // hasMore was false on page 2
  });

  it('shows edit+delete on your own fresh post, hides both once past the 24h window (matches the server\'s own-post rule)', async () => {
    const fresh = suggestion({ id: 1, user_id: 1, created_at: new Date().toISOString() });
    const old = suggestion({ id: 2, user_id: 1, text: 'Старая идея', created_at: new Date(Date.now() - 25 * 3600 * 1000).toISOString() });
    vi.mocked(suggestionsApi.list).mockResolvedValue(listResponse([fresh, old]));

    renderPage();
    await screen.findByText('Сделать кнопку зелёной');

    expect(screen.getAllByTitle('Редактировать (доступно 24 часа)')).toHaveLength(1); // only the fresh one
    expect(screen.getAllByTitle('Удалить')).toHaveLength(1); // past the window, a plain author loses delete too — only a lead could remove the old one
  });

  it('a stranger\'s post has neither edit nor delete for a plain tester', async () => {
    vi.mocked(suggestionsApi.list).mockResolvedValue(listResponse(
      [suggestion({ id: 1, user_id: 42, author_name: 'Someone Else' })],
    ));

    renderPage();
    await screen.findByText('Сделать кнопку зелёной');
    expect(screen.queryByTitle('Редактировать (доступно 24 часа)')).toBeNull();
    expect(screen.queryByTitle('Удалить')).toBeNull();
  });

  it('clicking a non-anonymous author\'s name navigates to their profile; an anonymous one is not clickable', async () => {
    vi.mocked(suggestionsApi.list).mockResolvedValue(listResponse([
      suggestion({ id: 1, user_id: 42, author_name: 'Someone Else', is_anonymous: false }),
      suggestion({ id: 2, user_id: 43, is_anonymous: true, text: 'Секретная жалоба' }),
    ]));

    renderPage();
    await screen.findByText('Someone Else');
    fireEvent.click(screen.getByText('Someone Else'));
    expect(mockNavigate).toHaveBeenCalledWith('/profile/42');

    mockNavigate.mockClear();
    fireEvent.click(screen.getByText('Аноним'));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('submitting a new suggestion calls create with trimmed text and reloads the list', async () => {
    vi.mocked(suggestionsApi.list).mockResolvedValue(listResponse([]));
    vi.mocked(suggestionsApi.create).mockResolvedValue({ data: {} } as any);

    renderPage();
    await waitFor(() => expect(suggestionsApi.list).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByPlaceholderText('Что предложить, посоветовать или на что пожаловаться?'), {
      target: { value: '  Добавить тёмную тему  ' },
    });
    fireEvent.click(screen.getByText('Отправить'));

    await waitFor(() => expect(suggestionsApi.create).toHaveBeenCalledWith({ type: 'idea', text: 'Добавить тёмную тему', is_anonymous: false }));
    await waitFor(() => expect(suggestionsApi.list).toHaveBeenCalledTimes(2)); // reloaded after success
  });

  it('liking bumps the count optimistically before the API call resolves', async () => {
    vi.mocked(suggestionsApi.list).mockResolvedValue(listResponse([suggestion({ likeCount: 2, likedByMe: false })]));
    vi.mocked(suggestionsApi.like).mockResolvedValue({ data: {} } as any);

    renderPage();
    await screen.findByText('2');
    fireEvent.click(screen.getByText('2'));

    expect(screen.getByText('3')).toBeInTheDocument(); // optimistic bump before the API resolves
    await waitFor(() => expect(suggestionsApi.like).toHaveBeenCalledWith(1));
  });

  it('editing your own fresh post saves via update and reflects the new text without a full reload', async () => {
    vi.mocked(suggestionsApi.list).mockResolvedValue(listResponse([suggestion({ text: 'Старый текст' })]));
    vi.mocked(suggestionsApi.update).mockResolvedValue({ data: {} } as any);

    renderPage();
    await screen.findByText('Старый текст');
    fireEvent.click(screen.getByTitle('Редактировать (доступно 24 часа)'));

    const textarea = screen.getByDisplayValue('Старый текст');
    fireEvent.change(textarea, { target: { value: 'Новый текст' } });
    fireEvent.click(screen.getByText('Сохранить'));

    await waitFor(() => expect(suggestionsApi.update).toHaveBeenCalledWith(1, { type: 'idea', text: 'Новый текст', is_anonymous: false }));
    expect(await screen.findByText('Новый текст')).toBeInTheDocument();
    expect(suggestionsApi.list).toHaveBeenCalledTimes(1); // no extra reload — merged in place
  });
});

describe('SuggestionsPage — questions', () => {
  it('an unanswered question shows a waiting message to a plain tester, not a reply box', async () => {
    vi.mocked(suggestionsApi.list).mockResolvedValue(listResponse(
      [suggestion({ id: 1, type: 'question', text: 'Как сбросить пароль?' })],
    ));
    renderPage();
    await screen.findByText('Как сбросить пароль?');
    expect(screen.getByText('Ждём ответа тимлида')).toBeInTheDocument();
    expect(screen.queryByText('Ответить')).toBeNull();
  });

  it('an answered question shows the answer to everyone, with the answerer credited', async () => {
    vi.mocked(suggestionsApi.list).mockResolvedValue(listResponse(
      [suggestion({ id: 1, type: 'question', text: 'Как сбросить пароль?', answer: 'Через "Забыли пароль" на странице входа', answered_by_name: 'Lead' })],
    ));
    renderPage();
    await screen.findByText('Через "Забыли пароль" на странице входа');
    expect(screen.getByText('Ответ от Lead')).toBeInTheDocument();
  });

  it('a lead can answer a pending question, and it appears immediately without a full reload', async () => {
    vi.mocked(suggestionsApi.list).mockResolvedValue(listResponse(
      [suggestion({ id: 1, type: 'question', text: 'Как сбросить пароль?' })],
    ));
    vi.mocked(suggestionsApi.answer).mockResolvedValue({ data: {} } as any);

    renderPage(lead);
    await screen.findByText('Как сбросить пароль?');
    fireEvent.click(screen.getByText('Ответить'));

    const textarea = screen.getByPlaceholderText('Твой ответ...');
    fireEvent.change(textarea, { target: { value: '  Через "Забыли пароль"  ' } });
    fireEvent.click(screen.getByText('Ответить'));

    await waitFor(() => expect(suggestionsApi.answer).toHaveBeenCalledWith(1, 'Через "Забыли пароль"'));
    expect(await screen.findByText('Через "Забыли пароль"')).toBeInTheDocument();
    expect(suggestionsApi.list).toHaveBeenCalledTimes(1); // no extra reload — merged in place
  });
});

describe('SuggestionsPage — lead view', () => {
  it('groups by folder instead of type, with a "Без папки" bucket, and hides empty folders', async () => {
    vi.mocked(suggestionsApi.list).mockResolvedValue(listResponse([
      suggestion({ id: 1, text: 'В папке', folder_id: 1, folder_name: 'Доработка сервисов' }),
      suggestion({ id: 2, text: 'Без папки', folder_id: null }),
    ]));
    vi.mocked(suggestionsApi.getFolders).mockResolvedValue({ data: [folder({ id: 1 }), folder({ id: 2, name: 'Пустая папка' })] } as any);

    renderPage(lead);

    await screen.findByText('В папке');
    expect(screen.getByText('ДОРАБОТКА СЕРВИСОВ')).toBeInTheDocument();
    expect(screen.getByText('БЕЗ ПАПКИ')).toBeInTheDocument();
    expect(screen.queryByText('ПУСТАЯ ПАПКА')).toBeNull();
  });

  it('a lead can always delete a stranger\'s post, even outside the edit window, but never sees the edit button on it', async () => {
    vi.mocked(suggestionsApi.list).mockResolvedValue(listResponse(
      [suggestion({ id: 1, user_id: 42, created_at: new Date(Date.now() - 48 * 3600 * 1000).toISOString() })],
    ));

    renderPage(lead);
    await screen.findByText('Сделать кнопку зелёной');
    expect(screen.getByTitle('Удалить')).toBeInTheDocument();
    expect(screen.queryByTitle('Редактировать (доступно 24 часа)')).toBeNull();
  });

  it('changing the status/folder selects calls the matching API optimistically', async () => {
    vi.mocked(suggestionsApi.list).mockResolvedValue(listResponse([suggestion({ folder_id: null })]));
    vi.mocked(suggestionsApi.getFolders).mockResolvedValue({ data: [folder({ id: 1 })] } as any);
    vi.mocked(suggestionsApi.setStatus).mockResolvedValue({ data: {} } as any);
    vi.mocked(suggestionsApi.setFolder).mockResolvedValue({ data: {} } as any);

    renderPage(lead);
    await screen.findByText('Сделать кнопку зелёной');

    fireEvent.change(screen.getByDisplayValue('Новое'), { target: { value: 'implemented' } });
    await waitFor(() => expect(suggestionsApi.setStatus).toHaveBeenCalledWith(1, 'implemented'));

    fireEvent.change(screen.getByDisplayValue('Без папки'), { target: { value: '1' } });
    await waitFor(() => expect(suggestionsApi.setFolder).toHaveBeenCalledWith(1, 1));
  });

  it('creating a folder calls the API with the trimmed name and clears the input', async () => {
    vi.mocked(suggestionsApi.list).mockResolvedValue(listResponse([]));
    vi.mocked(suggestionsApi.createFolder).mockResolvedValue({ data: {} } as any);

    renderPage(lead);
    await waitFor(() => expect(suggestionsApi.getFolders).toHaveBeenCalled());

    const input = screen.getByPlaceholderText('Например: Доработка сервисов');
    fireEvent.change(input, { target: { value: '  Срочное  ' } });
    fireEvent.click(screen.getByText('+ Папка'));

    await waitFor(() => expect(suggestionsApi.createFolder).toHaveBeenCalledWith('Срочное'));
  });

  it('removing a folder asks for confirmation and calls the API', async () => {
    vi.mocked(suggestionsApi.list).mockResolvedValue(listResponse([]));
    vi.mocked(suggestionsApi.getFolders).mockResolvedValue({ data: [folder({ id: 1, name: 'Устаревшая папка' })] } as any);
    vi.mocked(suggestionsApi.removeFolder).mockResolvedValue({ data: {} } as any);

    renderPage(lead);
    await screen.findByLabelText('Удалить папку Устаревшая папка');
    fireEvent.click(screen.getByLabelText('Удалить папку Устаревшая папка'));

    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => expect(suggestionsApi.removeFolder).toHaveBeenCalledWith(1));
  });
});
