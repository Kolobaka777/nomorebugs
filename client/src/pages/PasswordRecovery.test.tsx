// The two password-recovery screens. Both are short, both are the only way
// back in for someone locked out, and neither had a test.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ForgotPasswordPage from './ForgotPasswordPage';
import ResetPasswordPage from './ResetPasswordPage';
import { authApi } from '../api';

const mockNavigate = vi.fn();
let searchParams = new URLSearchParams();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate, useSearchParams: () => [searchParams, vi.fn()] };
});
vi.mock('../api', () => ({ authApi: { forgotPassword: vi.fn(), resetPassword: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  searchParams = new URLSearchParams();
});

describe('ForgotPasswordPage', () => {
  it('confirms the request instead of leaving the user staring at the form', async () => {
    vi.mocked(authApi.forgotPassword).mockResolvedValue({ data: { ok: true } } as any);
    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'me@qa.com' } });
    fireEvent.click(screen.getByRole('button', { name: /отправить ссылку/i }));
    await waitFor(() => expect(authApi.forgotPassword).toHaveBeenCalledWith('me@qa.com'));
    // The form is replaced by the confirmation, so there is nothing left to resubmit.
    await waitFor(() => expect(screen.queryByPlaceholderText('Email')).not.toBeInTheDocument());
  });

  it('reports a failure rather than falsely claiming the mail went out', async () => {
    vi.mocked(authApi.forgotPassword).mockRejectedValue({ response: { status: 500, data: {} } });
    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'me@qa.com' } });
    fireEvent.click(screen.getByRole('button', { name: /отправить ссылку/i }));
    expect(await screen.findByText(/Ошибка\. Попробуйте позже\./)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Email')).toBeInTheDocument();
  });
});

describe('ResetPasswordPage', () => {
  const fill = (pw: string, confirm = pw) => {
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: pw } });
    fireEvent.change(screen.getByPlaceholderText('Repeat Password'), { target: { value: confirm } });
  };
  const submit = () => fireEvent.click(screen.getByRole('button', { name: /сменить пароль/i }));

  it('shows nothing to fill in when the link carries no token', () => {
    render(<ResetPasswordPage />);
    expect(screen.queryByPlaceholderText('Password')).not.toBeInTheDocument();
  });

  it('refuses a short password and a mismatch without calling the server', async () => {
    searchParams = new URLSearchParams('token=abc');
    render(<ResetPasswordPage />);
    fill('short1');
    submit();
    expect(await screen.findByText('Пароль должен быть не короче 8 символов')).toBeInTheDocument();

    fill('longenough1', 'different111');
    submit();
    expect(await screen.findByText('Пароли не совпадают')).toBeInTheDocument();
    expect(authApi.resetPassword).not.toHaveBeenCalled();
  });

  it('sends the token from the link together with the new password', async () => {
    searchParams = new URLSearchParams('token=reset-token-123');
    vi.mocked(authApi.resetPassword).mockResolvedValue({ data: { ok: true } } as any);
    render(<ResetPasswordPage />);
    fill('longenough1');
    submit();
    await waitFor(() => expect(authApi.resetPassword).toHaveBeenCalledWith('reset-token-123', 'longenough1'));
  });

  it('says the link is dead rather than failing silently', async () => {
    searchParams = new URLSearchParams('token=expired');
    vi.mocked(authApi.resetPassword).mockRejectedValue({ response: { status: 410, data: {} } });
    render(<ResetPasswordPage />);
    fill('longenough1');
    submit();
    expect(await screen.findByText('Ссылка недействительна или устарела')).toBeInTheDocument();
  });
});
