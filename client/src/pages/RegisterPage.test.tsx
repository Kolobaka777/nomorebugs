import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RegisterPage from './RegisterPage';
import { authApi } from '../api';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});
vi.mock('../components/TelegramLoginButton', () => ({ default: () => <div data-testid="tg" /> }));
vi.mock('../api', () => ({ authApi: { register: vi.fn() } }));

beforeEach(() => vi.clearAllMocks());

function fill({ password = 'longenough1', confirm = 'longenough1', birthday = '' } = {}) {
  fireEvent.change(screen.getByPlaceholderText('Как к тебе обращаться'), { target: { value: 'Новичок' } });
  fireEvent.change(screen.getByPlaceholderText('your@email.com'), { target: { value: 'new@qa.com' } });
  fireEvent.change(screen.getByPlaceholderText('Не короче 8 символов'), { target: { value: password } });
  fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: confirm } });
  if (birthday) fireEvent.change(screen.getByPlaceholderText(/ММ-ДД/), { target: { value: birthday } });
}

const submit = () => fireEvent.click(screen.getByRole('button', { name: /^регистрация$/i }));

describe('RegisterPage validation, before anything reaches the server', () => {
  it('refuses mismatched passwords', async () => {
    render(<RegisterPage onLogin={vi.fn()} />);
    fill({ confirm: 'somethingelse1' });
    submit();
    expect(await screen.findByText('Пароли не совпадают')).toBeInTheDocument();
    expect(authApi.register).not.toHaveBeenCalled();
  });

  it('refuses a password under 8 characters — the same floor the server enforces', async () => {
    render(<RegisterPage onLogin={vi.fn()} />);
    fill({ password: 'short1', confirm: 'short1' });
    submit();
    expect(await screen.findByText('Пароль слишком короткий')).toBeInTheDocument();
    expect(authApi.register).not.toHaveBeenCalled();
  });

  it('refuses a birthday that is not MM-DD', async () => {
    render(<RegisterPage onLogin={vi.fn()} />);
    fill({ birthday: '15 августа' });
    submit();
    expect(await screen.findByText(/ММ-ДД/)).toBeInTheDocument();
    expect(authApi.register).not.toHaveBeenCalled();
  });
});

describe('RegisterPage submission', () => {
  it('signs the new account straight in', async () => {
    const onLogin = vi.fn();
    vi.mocked(authApi.register).mockResolvedValue({
      data: { token: 't', user: { id: 7 }, needsBaselineSurvey: true },
    } as any);
    render(<RegisterPage onLogin={onLogin} />);
    fill();
    submit();
    await waitFor(() => expect(onLogin).toHaveBeenCalledWith('t', { id: 7 }, true));
  });

  it('sends an empty birthday as null rather than an empty string', async () => {
    vi.mocked(authApi.register).mockResolvedValue({ data: { token: 't', user: {}, needsBaselineSurvey: false } } as any);
    render(<RegisterPage onLogin={vi.fn()} />);
    fill();
    submit();
    await waitFor(() => expect(authApi.register).toHaveBeenCalled());
    expect(vi.mocked(authApi.register).mock.calls[0][4]).toBeNull();
  });

  it('surfaces the server\'s refusal — this is how a blocked email domain reaches the user', async () => {
    vi.mocked(authApi.register).mockRejectedValue({
      response: { data: { error: 'Регистрация доступна только по рабочей почте' } },
    });
    render(<RegisterPage onLogin={vi.fn()} />);
    fill();
    submit();
    expect(await screen.findByText('Регистрация доступна только по рабочей почте')).toBeInTheDocument();
  });

  it('falls back to its own message when the server sends none', async () => {
    vi.mocked(authApi.register).mockRejectedValue({ response: { status: 500, data: {} } });
    render(<RegisterPage onLogin={vi.fn()} />);
    fill();
    submit();
    expect(await screen.findByText(/Ошибка регистрации/)).toBeInTheDocument();
  });
});

// A validation problem and a server error are different things: one is the
// reader's to fix and one is not. They used to be the same red box.
describe('RegisterPage — telling the two failures apart', () => {
  it('shows what to do about it, not just what is wrong', async () => {
    render(<RegisterPage onLogin={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('Не короче 8 символов'), { target: { value: 'short' } });
    fireEvent.change(screen.getByPlaceholderText("••••••••"), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: /^регистрация$/i }));

    expect(await screen.findByText('Пароль слишком короткий')).toBeInTheDocument();
    expect(screen.getByText('Нужно не меньше 8 символов.')).toBeInTheDocument();
    // ...and it is announced, because a form error nobody hears is a form
    // that silently does nothing.
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('clears the validation callout once the form is resubmitted', async () => {
    vi.mocked(authApi.register).mockResolvedValue({ data: { token: 't', user: { id: 1 }, needsBaselineSurvey: false } } as any);
    render(<RegisterPage onLogin={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('Не короче 8 символов'), { target: { value: 'short' } });
    fireEvent.change(screen.getByPlaceholderText("••••••••"), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: /^регистрация$/i }));
    await screen.findByText('Пароль слишком короткий');

    fireEvent.change(screen.getByPlaceholderText('Не короче 8 символов'), { target: { value: 'longenough' } });
    fireEvent.change(screen.getByPlaceholderText("••••••••"), { target: { value: 'longenough' } });
    fireEvent.click(screen.getByRole('button', { name: /^регистрация$/i }));

    await waitFor(() => expect(screen.queryByText('Пароль слишком короткий')).not.toBeInTheDocument());
  });
});
