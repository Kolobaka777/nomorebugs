// The fallback notification channel, and the only way back into an account
// when Telegram is not linked. Coverage was 18%: everything known about
// sending a password-reset mail was that the module imports.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const sendMail = vi.fn();
const createTransport = vi.fn(() => ({ sendMail }));
vi.mock('nodemailer', () => ({ default: { createTransport } }));

const ORIGINAL_ENV = { ...process.env };

// The transporter is built once, at import, so each case re-imports the
// module with the environment it needs.
async function loadWith(env) {
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV, ...env };
  return import('../src/email.js');
}

beforeEach(() => {
  sendMail.mockReset().mockResolvedValue({ messageId: 'x' });
  createTransport.mockClear();
});
afterEach(() => { process.env = { ...ORIGINAL_ENV }; });

describe('with no SMTP configured', () => {
  it('does not report itself as configured', async () => {
    const { isEmailConfigured } = await loadWith({ SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '' });
    expect(isEmailConfigured()).toBe(false);
  });

  it('sends nothing and says so, rather than pretending', async () => {
    // false specifically: the caller uses it to decide whether the
    // notification reached anyone by any channel at all.
    const { sendEmail } = await loadWith({ SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '' });
    await expect(sendEmail('a@b.c', 'Тема', 'Текст')).resolves.toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('treats half the settings as no settings', async () => {
    const { isEmailConfigured } = await loadWith({ SMTP_HOST: 'smtp.test', SMTP_USER: 'u', SMTP_PASS: '' });
    expect(isEmailConfigured()).toBe(false);
  });
});

describe('with SMTP configured', () => {
  const CONFIGURED = { SMTP_HOST: 'smtp.test', SMTP_USER: 'user@test', SMTP_PASS: 'secret' };

  it('reports itself as configured', async () => {
    const { isEmailConfigured } = await loadWith(CONFIGURED);
    expect(isEmailConfigured()).toBe(true);
  });

  it('sends the mail where it was addressed', async () => {
    const { sendEmail } = await loadWith(CONFIGURED);
    await expect(sendEmail('кому@test', 'Сброс пароля', 'Ссылка')).resolves.toBe(true);
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'кому@test', subject: 'Сброс пароля', text: 'Ссылка',
    }));
  });

  it('uses SMTP_FROM when one is set', async () => {
    const { sendEmail } = await loadWith({ ...CONFIGURED, SMTP_FROM: 'noreply@baga.net' });
    await sendEmail('к@test', 'Т', 'Т');
    expect(sendMail.mock.calls[0][0].from).toBe('noreply@baga.net');
  });

  it('otherwise sends from the account it authenticated with', async () => {
    const { sendEmail } = await loadWith(CONFIGURED);
    await sendEmail('к@test', 'Т', 'Т');
    expect(sendMail.mock.calls[0][0].from).toBe('user@test');
  });

  it('takes the port and TLS mode from the environment', async () => {
    await loadWith({ ...CONFIGURED, SMTP_PORT: '465', SMTP_SECURE: 'true' });
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ port: 465, secure: true }));
  });

  it('falls back to 587 and no TLS when the port is unset', async () => {
    await loadWith(CONFIGURED);
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ port: 587, secure: false }));
  });
});

describe('when sending fails', () => {
  it('returns false instead of throwing outward', async () => {
    // A notification is a side effect of somebody else's operation. A failed
    // mail must not turn a successful password reset into a 500.
    const { sendEmail } = await loadWith({ SMTP_HOST: 'smtp.test', SMTP_USER: 'u', SMTP_PASS: 'p' });
    sendMail.mockRejectedValue(new Error('mailbox full'));
    await expect(sendEmail('к@test', 'Т', 'Т')).resolves.toBe(false);
  });
});
