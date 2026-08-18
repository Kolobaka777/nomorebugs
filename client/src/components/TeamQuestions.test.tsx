// Asking the team, moved here from the Идеи board. The behaviour it took
// with it — anonymity, the lead-only reply box, the waiting state — is
// asserted here now; SuggestionsPage.test.tsx keeps only the checks that
// the board stopped dealing in questions at all.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TeamQuestions from './TeamQuestions';
import { suggestionsApi } from '../api';
import { Suggestion } from '../types';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../api', () => ({
  suggestionsApi: {
    list: vi.fn(), create: vi.fn(), answer: vi.fn(),
    remove: vi.fn(), like: vi.fn(), unlike: vi.fn(),
  },
}));

const tester = { id: 1, name: 'Tester', role: 'tester' };
const lead = { id: 9, name: 'Lead', role: 'lead' };

function question(overrides: Partial<Suggestion> = {}): Suggestion {
  return {
    id: 1, type: 'question', text: 'Как сбросить пароль?', status: 'new',
    created_at: new Date().toISOString(), is_anonymous: false,
    user_id: 1, author_name: 'Tester', likeCount: 0, likedByMe: false,
    answer: null, answered_at: null, answered_by_name: null,
    ...overrides,
  };
}

const listResponse = (rows: Suggestion[], hasMore = false) => ({ data: { rows, hasMore } }) as any;
const renderIt = (user = tester) => render(<TeamQuestions user={user} />);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('TeamQuestions', () => {
  it('asks the server for questions only — the ideas board is a separate slice of the same table', async () => {
    vi.mocked(suggestionsApi.list).mockResolvedValue(listResponse([]));
    renderIt();
    await waitFor(() => expect(suggestionsApi.list).toHaveBeenCalledWith({ type: 'question' }));
    expect(await screen.findByText('Вопросов пока никто не задавал.')).toBeInTheDocument();
  });

  it('sends a question with trimmed text and confirms it landed', async () => {
    vi.mocked(suggestionsApi.list).mockResolvedValue(listResponse([]));
    vi.mocked(suggestionsApi.create).mockResolvedValue({ data: {} } as any);

    renderIt();
    await waitFor(() => expect(suggestionsApi.list).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText('Текст вопроса'), { target: { value: '  Где посмотреть баг-коины?  ' } });
    fireEvent.click(screen.getByText('Спросить'));

    await waitFor(() => expect(suggestionsApi.create).toHaveBeenCalledWith({
      type: 'question', text: 'Где посмотреть баг-коины?', is_anonymous: false,
    }));
    expect(await screen.findByText(/Отправлено/)).toBeInTheDocument();
    await waitFor(() => expect(suggestionsApi.list).toHaveBeenCalledTimes(2)); // reloaded after success
  });

  it('carries the anonymous flag through to the API', async () => {
    vi.mocked(suggestionsApi.list).mockResolvedValue(listResponse([]));
    vi.mocked(suggestionsApi.create).mockResolvedValue({ data: {} } as any);

    renderIt();
    await waitFor(() => expect(suggestionsApi.list).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('Текст вопроса'), { target: { value: 'Неловкий вопрос' } });
    fireEvent.click(screen.getByText('Спросить анонимно'));
    fireEvent.click(screen.getByText('Спросить'));

    await waitFor(() => expect(suggestionsApi.create).toHaveBeenCalledWith(
      expect.objectContaining({ is_anonymous: true }),
    ));
  });

  it('refuses to send an empty question instead of posting a blank one', async () => {
    vi.mocked(suggestionsApi.list).mockResolvedValue(listResponse([]));
    renderIt();
    await waitFor(() => expect(suggestionsApi.list).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('Текст вопроса'), { target: { value: '   ' } });
    fireEvent.click(screen.getByText('Спросить'));

    expect(await screen.findByText('Напиши вопрос')).toBeInTheDocument();
    expect(suggestionsApi.create).not.toHaveBeenCalled();
  });

  it('an unanswered question shows a waiting message to a plain tester, not a reply box', async () => {
    vi.mocked(suggestionsApi.list).mockResolvedValue(listResponse([question()]));
    renderIt();
    await screen.findByText('Как сбросить пароль?');
    expect(screen.getByText('Ждём ответа тимлида')).toBeInTheDocument();
    expect(screen.queryByText('Ответить')).toBeNull();
  });

  it('an answered question shows the answer to everyone, with the answerer credited', async () => {
    vi.mocked(suggestionsApi.list).mockResolvedValue(listResponse(
      [question({ answer: 'Через «Забыли пароль» на странице входа', answered_by_name: 'Lead' })],
    ));
    renderIt();
    await screen.findByText('Через «Забыли пароль» на странице входа');
    expect(screen.getByText('Ответ от Lead')).toBeInTheDocument();
  });

  it('a lead can answer a pending question, and it appears immediately without a full reload', async () => {
    vi.mocked(suggestionsApi.list).mockResolvedValue(listResponse([question()]));
    vi.mocked(suggestionsApi.answer).mockResolvedValue({ data: {} } as any);

    renderIt(lead);
    await screen.findByText('Как сбросить пароль?');
    fireEvent.click(screen.getByText('Ответить'));

    fireEvent.change(screen.getByLabelText('Текст ответа'), { target: { value: '  Через «Забыли пароль»  ' } });
    fireEvent.click(screen.getByText('Ответить'));

    await waitFor(() => expect(suggestionsApi.answer).toHaveBeenCalledWith(1, 'Через «Забыли пароль»'));
    expect(await screen.findByText('Через «Забыли пароль»')).toBeInTheDocument();
    expect(suggestionsApi.list).toHaveBeenCalledTimes(1); // merged in place
  });

  // The list is what a lead works through, so what still needs them comes
  // first — otherwise a busy week buries the unanswered ones under answers.
  it('puts unanswered questions above answered ones', async () => {
    vi.mocked(suggestionsApi.list).mockResolvedValue(listResponse([
      question({ id: 1, text: 'Уже отвеченный', answer: 'Да', answered_by_name: 'Lead' }),
      question({ id: 2, text: 'Ещё без ответа' }),
    ]));

    renderIt();
    await screen.findByText('Ещё без ответа');
    const texts = screen.getAllByText(/Уже отвеченный|Ещё без ответа/).map(el => el.textContent);
    expect(texts).toEqual(['Ещё без ответа', 'Уже отвеченный']);
  });

  it('an anonymous asker is not clickable through to a profile, a named one is', async () => {
    vi.mocked(suggestionsApi.list).mockResolvedValue(listResponse([
      question({ id: 1, user_id: 42, author_name: 'Someone Else' }),
      question({ id: 2, user_id: 43, is_anonymous: true, text: 'Неловкий вопрос' }),
    ]));

    renderIt();
    await screen.findByText('Someone Else');
    fireEvent.click(screen.getByText('Someone Else'));
    expect(mockNavigate).toHaveBeenCalledWith('/profile/42');

    mockNavigate.mockClear();
    fireEvent.click(screen.getByText('Аноним'));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('lets the author delete their own fresh question and a lead delete any', async () => {
    const mine = question({ id: 1, user_id: tester.id, created_at: new Date().toISOString() });
    const old = question({ id: 2, user_id: tester.id, text: 'Старый вопрос', created_at: new Date(Date.now() - 25 * 3600 * 1000).toISOString() });
    vi.mocked(suggestionsApi.list).mockResolvedValue(listResponse([mine, old]));
    vi.mocked(suggestionsApi.remove).mockResolvedValue({ data: {} } as any);

    const { unmount } = renderIt();
    await screen.findByText('Старый вопрос');
    expect(screen.getAllByLabelText('Удалить вопрос')).toHaveLength(1); // only the fresh one

    fireEvent.click(screen.getByLabelText('Удалить вопрос'));
    await waitFor(() => expect(suggestionsApi.remove).toHaveBeenCalledWith(1));
    unmount();

    renderIt(lead);
    await screen.findByText('Старый вопрос');
    expect(screen.getAllByLabelText('Удалить вопрос')).toHaveLength(2); // a lead reaches both
  });

  it('shows a retry instead of an empty page when the fetch fails', async () => {
    vi.mocked(suggestionsApi.list).mockRejectedValueOnce({ response: { data: { error: 'Всё сломалось' } } });
    renderIt();

    expect(await screen.findByText('Всё сломалось')).toBeInTheDocument();
    vi.mocked(suggestionsApi.list).mockResolvedValue(listResponse([question()]));
    fireEvent.click(screen.getByText('Повторить'));
    expect(await screen.findByText('Как сбросить пароль?')).toBeInTheDocument();
  });
});
