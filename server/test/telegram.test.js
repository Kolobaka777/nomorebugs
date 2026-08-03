import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';
// Deliberately left unset: TELEGRAM_BOT_TOKEN. The suite verifies both the
// "not configured" behavior (HTTP endpoints) and the underlying token/
// notification logic directly, which doesn't need a real bot connection.

vi.mock('../src/email.js', () => ({
  isEmailConfigured: vi.fn(() => false),
  sendEmail: vi.fn(async () => false),
}));

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { seedTestData, loginAs } = await import('./helpers.js');
const emailModule = await import('../src/email.js');
const {
  createTelegramToken, pollTelegramToken, handleTelegramStart,
  notifyUser, notifyUserConfirmed, isTelegramConfigured, _setBotForTest,
} = await import('../src/telegram.js');

let leadId, testerId;

beforeAll(() => {
  const ids = seedTestData(db);
  leadId = ids.leadId;
  testerId = ids.testerId;
});

describe('isTelegramConfigured', () => {
  it('is false with no TELEGRAM_BOT_TOKEN set (the default test/dev-without-bot state)', () => {
    expect(isTelegramConfigured()).toBe(false);
  });
});

describe('Telegram HTTP endpoints without a configured bot', () => {
  it('POST /api/auth/telegram/start returns 503 rather than a broken deep link', async () => {
    const res = await request(app).post('/api/auth/telegram/start');
    expect(res.status).toBe(503);
  });

  it('POST /api/auth/telegram/link/start requires auth, then 503s the same way', async () => {
    const unauth = await request(app).post('/api/auth/telegram/link/start');
    expect(unauth.status).toBe(401);

    const token = await loginAs(request, app, 'tester@test.local', 'testerpass123');
    const res = await request(app).post('/api/auth/telegram/link/start').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(503);
  });
});

describe('pollTelegramToken', () => {
  it('reports expired for a token that never existed', () => {
    expect(pollTelegramToken('does-not-exist')).toEqual({ status: 'expired' });
  });

  it('reports pending for a freshly created token', () => {
    const { token } = createTelegramToken();
    expect(pollTelegramToken(token)).toEqual({ status: 'pending' });
  });

  it('reports expired (and deletes the row) once past its TTL', () => {
    const token = 'manually-inserted-expired-token';
    db.prepare('INSERT INTO telegram_login_tokens (token, expires_at) VALUES (?, ?)')
      .run(token, new Date(Date.now() - 1000).toISOString());
    expect(pollTelegramToken(token)).toEqual({ status: 'expired' });
    expect(db.prepare('SELECT 1 FROM telegram_login_tokens WHERE token = ?').get(token)).toBeUndefined();
  });

  it('is single-use — a second poll after a ready pickup reports expired, not a replayed session', () => {
    const { token } = createTelegramToken();
    handleTelegramStart(token, { id: 555001, username: 'newbug', first_name: 'New', last_name: 'Bug' }, () => {});

    const first = pollTelegramToken(token);
    expect(first.status).toBe('ready');

    const second = pollTelegramToken(token);
    expect(second).toEqual({ status: 'expired' });
  });

  it('reaches the poll endpoint over HTTP too, not just the direct function', async () => {
    const { token } = createTelegramToken();
    const res = await request(app).get(`/api/auth/telegram/poll/${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'pending' });
  });
});

describe('handleTelegramStart — login/register flow', () => {
  it('auto-registers a new tester on first contact, capturing the Telegram username', () => {
    const { token } = createTelegramToken();
    const replies = [];
    handleTelegramStart(token, { id: 700001, username: 'freshbug', first_name: 'Fresh', last_name: 'Bug' }, (t) => replies.push(t));

    const user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get('700001');
    expect(user).toBeTruthy();
    expect(user.role).toBe('tester');
    expect(user.telegram_username).toBe('freshbug');
    expect(user.name).toBe('Fresh Bug');
    expect(replies[0]).toMatch(/Добро пожаловать/);

    const result = pollTelegramToken(token);
    expect(result.status).toBe('ready');
    expect(result.user.id).toBe(user.id);
    expect(result.needsBaselineSurvey).toBe(true);
    expect(typeof result.token).toBe('string');
    expect(typeof result.refreshToken).toBe('string');
  });

  it('logs an existing Telegram-linked user back in and refreshes a changed @username', () => {
    const { token: t1 } = createTelegramToken();
    handleTelegramStart(t1, { id: 700002, username: 'oldname', first_name: 'Returning' }, () => {});
    pollTelegramToken(t1); // consume the first session

    const { token: t2 } = createTelegramToken();
    const replies = [];
    handleTelegramStart(t2, { id: 700002, username: 'newname', first_name: 'Returning' }, (t) => replies.push(t));

    const user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get('700002');
    expect(user.telegram_username).toBe('newname');
    expect(replies[0]).toMatch(/С возвращением/);

    const result = pollTelegramToken(t2);
    expect(result.status).toBe('ready');
    expect(result.user.id).toBe(user.id);
  });

  it('replies with an error and issues no session for an unknown/already-consumed token', () => {
    const replies = [];
    handleTelegramStart('totally-made-up-token', { id: 700003, username: 'x' }, (t) => replies.push(t));
    expect(replies[0]).toMatch(/устарела/);
    expect(db.prepare('SELECT * FROM users WHERE telegram_id = ?').get('700003')).toBeUndefined();
  });
});

describe('handleTelegramStart — link flow (attaching Telegram to an already-logged-in account)', () => {
  it('links Telegram to an existing account without issuing a new session', () => {
    const { token } = createTelegramToken(testerId);
    const replies = [];
    handleTelegramStart(token, { id: 800001, username: 'linkedbug', first_name: 'Linked' }, (t) => replies.push(t));

    const user = db.prepare('SELECT telegram_id, telegram_username FROM users WHERE id = ?').get(testerId);
    expect(user.telegram_id).toBe('800001');
    expect(user.telegram_username).toBe('linkedbug');
    expect(replies[0]).toMatch(/привязан/);

    const result = pollTelegramToken(token);
    expect(result.status).toBe('linked');
    expect(result.telegramUsername).toBe('linkedbug');
  });

  it('refuses to link a Telegram account already linked to a different user', () => {
    // 800001 is already linked to testerId from the previous test.
    const { token } = createTelegramToken(leadId);
    const replies = [];
    handleTelegramStart(token, { id: 800001, username: 'linkedbug', first_name: 'Linked' }, (t) => replies.push(t));

    expect(replies[0]).toMatch(/уже привязан/);
    const lead = db.prepare('SELECT telegram_id FROM users WHERE id = ?').get(leadId);
    expect(lead.telegram_id).toBeNull();

    expect(pollTelegramToken(token).status).toBe('error');
  });
});

describe('DB constraint: telegram_id uniqueness', () => {
  it('rejects a second user claiming a telegram_id already in use, at the DB layer', async () => {
    const res1 = await request(app).post('/api/auth/register').send({
      email: 'dupetg1@test.local', password: 'a-real-password', name: 'Dupe One',
    });
    const res2 = await request(app).post('/api/auth/register').send({
      email: 'dupetg2@test.local', password: 'a-real-password', name: 'Dupe Two',
    });

    db.prepare('UPDATE users SET telegram_id = ? WHERE id = ?').run('555555', res1.body.user.id);
    expect(() => {
      db.prepare('UPDATE users SET telegram_id = ? WHERE id = ?').run('555555', res2.body.user.id);
    }).toThrow();
  });
});

describe('GET/POST /api/auth/telegram/status & unlink', () => {
  it('reports linked:false by default, true once linked, false again after unlink', async () => {
    const token = await loginAs(request, app, 'lead@test.local', 'leadpass123');
    db.prepare('UPDATE users SET telegram_id = NULL, telegram_username = NULL WHERE id = ?').run(leadId);

    let res = await request(app).get('/api/auth/telegram/status').set('Authorization', `Bearer ${token}`);
    expect(res.body).toEqual({ linked: false, telegramUsername: null });

    db.prepare('UPDATE users SET telegram_id = ?, telegram_username = ? WHERE id = ?').run('999999', 'statustest', leadId);
    res = await request(app).get('/api/auth/telegram/status').set('Authorization', `Bearer ${token}`);
    expect(res.body).toEqual({ linked: true, telegramUsername: 'statustest' });

    const unlinkRes = await request(app).post('/api/auth/telegram/unlink').set('Authorization', `Bearer ${token}`);
    expect(unlinkRes.status).toBe(200);

    res = await request(app).get('/api/auth/telegram/status').set('Authorization', `Bearer ${token}`);
    expect(res.body).toEqual({ linked: false, telegramUsername: null });
  });

  it('refuses to unlink for an account that registered *through* Telegram — it has no other way to log in', async () => {
    // Auto-registers a fresh @telegram.local account, same as a real user
    // tapping the bot's deep link cold (see "auto-registers a new tester"
    // above) — this account has no real email and an unknowable random
    // password, so Telegram is its only login method.
    const { token: startToken } = createTelegramToken();
    handleTelegramStart(startToken, { id: 700099, username: 'onlytelegram', first_name: 'Only' }, () => {});
    const polled = pollTelegramToken(startToken);
    expect(polled.status).toBe('ready');

    const unlinkRes = await request(app).post('/api/auth/telegram/unlink').set('Authorization', `Bearer ${polled.token}`);
    expect(unlinkRes.status).toBe(400);

    const user = db.prepare('SELECT telegram_id FROM users WHERE id = ?').get(polled.user.id);
    expect(user.telegram_id).toBe('700099'); // untouched
  });
});

describe('notifyUser', () => {
  it('sends via Telegram when the user has a linked telegram_id', () => {
    const sendMessage = vi.fn(() => Promise.resolve());
    _setBotForTest({ sendMessage }, 'test_bot');
    const channel = notifyUser({ id: 1, telegram_id: '12345', email: 'x@test.local' }, 'Subject', 'Body');
    expect(channel).toBe('telegram');
    expect(sendMessage).toHaveBeenCalledWith('12345', 'Body');
    _setBotForTest(null, null);
  });

  it('falls back to email when no Telegram is linked but SMTP is configured', () => {
    emailModule.isEmailConfigured.mockReturnValue(true);
    const channel = notifyUser({ id: 2, telegram_id: null, email: 'real@test.local' }, 'Subject', 'Body');
    expect(channel).toBe('email');
    expect(emailModule.sendEmail).toHaveBeenCalledWith('real@test.local', 'Subject', 'Body');
    emailModule.isEmailConfigured.mockReturnValue(false);
  });

  it('skips the @telegram.local placeholder address even if SMTP is configured', () => {
    emailModule.isEmailConfigured.mockReturnValue(true);
    const channel = notifyUser({ id: 3, telegram_id: null, email: 'tg700001@telegram.local' }, 'Subject', 'Body');
    expect(channel).toBe('none');
    emailModule.isEmailConfigured.mockReturnValue(false);
  });

  it('is a no-op when neither Telegram nor email is available', () => {
    const channel = notifyUser({ id: 4, telegram_id: null, email: 'nobody@test.local' }, 'Subject', 'Body');
    expect(channel).toBe('none');
  });
});

// Production-readiness audit (deferred item resolved): notifyUser() reports
// 'telegram' the instant a telegram_id exists, without waiting to see if the
// send actually succeeded — fine for fire-and-forget notifications, but
// wrong for the one caller (reset-password) that uses the result to decide
// whether to show a human the raw temp password. notifyUserConfirmed awaits
// the real API call and only claims 'telegram' once it's actually confirmed.
describe('notifyUserConfirmed', () => {
  it('reports telegram only once bot.sendMessage actually resolves', async () => {
    const sendMessage = vi.fn(() => Promise.resolve());
    _setBotForTest({ sendMessage }, 'test_bot');
    const channel = await notifyUserConfirmed({ id: 1, telegram_id: '12345', email: 'x@test.local' }, 'Subject', 'Body');
    expect(channel).toBe('telegram');
    expect(sendMessage).toHaveBeenCalledWith('12345', 'Body');
    _setBotForTest(null, null);
  });

  it('falls back to email (not a false "telegram") when the bot send actually fails — e.g. the user blocked the bot', async () => {
    const sendMessage = vi.fn(() => Promise.reject(new Error('Forbidden: bot was blocked by the user')));
    _setBotForTest({ sendMessage }, 'test_bot');
    emailModule.isEmailConfigured.mockReturnValue(true);
    const channel = await notifyUserConfirmed({ id: 5, telegram_id: '999', email: 'fallback@test.local' }, 'Subject', 'Body');
    expect(channel).toBe('email');
    expect(emailModule.sendEmail).toHaveBeenCalledWith('fallback@test.local', 'Subject', 'Body');
    emailModule.isEmailConfigured.mockReturnValue(false);
    _setBotForTest(null, null);
  });

  it('reports none (not a false "telegram") when the send fails and there is no email to fall back to', async () => {
    const sendMessage = vi.fn(() => Promise.reject(new Error('Forbidden: bot was blocked by the user')));
    _setBotForTest({ sendMessage }, 'test_bot');
    const channel = await notifyUserConfirmed({ id: 6, telegram_id: '888', email: 'tg700002@telegram.local' }, 'Subject', 'Body');
    expect(channel).toBe('none');
    _setBotForTest(null, null);
  });
});

describe('integration: requests that trigger notifyUser still succeed with no channel configured', () => {
  it('registration succeeds (notifyUser silently no-ops)', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'notifytest@test.local', password: 'a-real-password', name: 'Notify Test',
    });
    expect(res.status).toBe(201);
  });

  it('login succeeds for a Telegram-linked account (Telegram security-alert branch)', async () => {
    const { token } = createTelegramToken();
    handleTelegramStart(token, { id: 900001, username: 'loginalert', first_name: 'Login', last_name: 'Alert' }, () => {});
    const result = pollTelegramToken(token);
    expect(result.status).toBe('ready');
    // The Telegram-created account has an unusable random password, so this
    // exercises the login endpoint's notifyUser call via a direct password
    // reset instead of trying to log in with it.
    const bcryptjs = (await import('bcryptjs')).default;
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(bcryptjs.hashSync('resetpass123', 4), result.user.id);

    const res = await request(app).post('/api/auth/login').send({ email: result.user.email, password: 'resetpass123' });
    expect(res.status).toBe(200);
  });
});
