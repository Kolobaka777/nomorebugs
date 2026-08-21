import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LoginPage from './LoginPage';
import { authApi } from '../api';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

// The Telegram button probes the server for whether a bot is configured —
// unrelated to what the email/password form does.
vi.mock('../components/TelegramLoginButton', () => ({ default: () => <div data-testid="tg" /> }));

vi.mock('../api', () => ({ authApi: { login: vi.fn() } }));

beforeEach(() => vi.clearAllMocks());

const fill = (email = 'tester@qa.com', password = 'testerpass') => {
  fireEvent.change(screen.getByPlaceholderText('your@email.com'), { target: { value: email } });
  fireEvent.change(screen.getByPlaceholderText('••••••'), { target: { value: password } });
};

describe('LoginPage', () => {
  it('hands the whole session up to the app, including the two flags that decide where the user lands', async () => {
    const onLogin = vi.fn();
    vi.mocked(authApi.login).mockResolvedValue({
      data: { token: 't', user: { id: 1 }, needsBaselineSurvey: true, mustChangePassword: true },
    } as any);

    render(<LoginPage onLogin={onLogin} />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: /войти/i }));

    // Dropping either flag sends a new tester past the survey, or lets a
    // temporary password stand forever.
    await waitFor(() => expect(onLogin).toHaveBeenCalledWith('t', { id: 1 }, true, true));
  });

  it('shows the server\'s own message when login fails, not a generic one', async () => {
    vi.mocked(authApi.login).mockRejectedValue({ response: { data: { error: 'Аккаунт заблокирован' } } });
    render(<LoginPage onLogin={vi.fn()} />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: /войти/i }));
    expect(await screen.findByText('Аккаунт заблокирован')).toBeInTheDocument();
  });

  it('names a network failure as one, instead of blaming the login', async () => {
    // An error with no `response` never reached the server. Saying «Ошибка
    // входа» here sends someone checking their password when the problem is
    // that nothing is listening.
    vi.mocked(authApi.login).mockRejectedValue(new Error('network'));
    render(<LoginPage onLogin={vi.fn()} />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: /войти/i }));
    expect(await screen.findByText(/нет связи с сервером/i)).toBeInTheDocument();
  });

  it('falls back to its own message when the server answers without one', async () => {
    vi.mocked(authApi.login).mockRejectedValue({ response: { status: 400, data: {} } });
    render(<LoginPage onLogin={vi.fn()} />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: /войти/i }));
    expect(await screen.findByText('Ошибка входа')).toBeInTheDocument();
  });

  it('does not call onLogin when the request fails', async () => {
    const onLogin = vi.fn();
    vi.mocked(authApi.login).mockRejectedValue(new Error('nope'));
    render(<LoginPage onLogin={onLogin} />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: /войти/i }));
    await screen.findByText(/нет связи с сервером/i);
    expect(onLogin).not.toHaveBeenCalled();
  });

  it('tells the user why they were bounced back here when the session expired', () => {
    render(<LoginPage onLogin={vi.fn()} sessionExpired />);
    expect(screen.getByText(/сесси/i)).toBeInTheDocument();
  });

  it('replaces the expiry notice with the real error once a login is actually attempted', async () => {
    vi.mocked(authApi.login).mockRejectedValue({ response: { data: { error: 'Неверный пароль' } } });
    render(<LoginPage onLogin={vi.fn()} sessionExpired />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: /войти/i }));
    expect(await screen.findByText('Неверный пароль')).toBeInTheDocument();
  });
});

// Per the kit. The flag travels with the login so the server knows whether
// the browser should keep its refresh cookie past this session.
describe('LoginPage — «Запомнить меня»', () => {
  it('is on by default, and says so to a screen reader', async () => {
    render(<LoginPage onLogin={vi.fn()} />);
    expect(screen.getByLabelText('Запомнить меня')).toBeChecked();
  });

  it('sends what the box says', async () => {
    vi.mocked(authApi.login).mockResolvedValue({ data: { token: 't', user: { id: 1 }, needsBaselineSurvey: false } } as any);
    render(<LoginPage onLogin={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('your@email.com'), { target: { value: 'a@b.c' } });
    fireEvent.change(screen.getByPlaceholderText('••••••'), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByLabelText('Запомнить меня'));
    fireEvent.click(screen.getByRole('button', { name: 'ВОЙТИ' }));

    await waitFor(() => expect(authApi.login).toHaveBeenCalledWith('a@b.c', 'secret123', false));
  });
});
