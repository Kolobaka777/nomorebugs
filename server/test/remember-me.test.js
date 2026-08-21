// "Запомнить меня" decides how long the *browser* keeps its refresh cookie,
// not how long the session is valid. Unchecked, it becomes a session cookie,
// so a borrowed machine does not stay signed in after the browser closes.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

vi.mock('../src/telegram.js', () => ({
  notifyUser: () => {},
  notifyUserConfirmed: async () => 'none',
}));

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { seedTestData, testServer } = await import('./helpers.js');

const server = await testServer(app);

const login = (remember) => {
  const body = { email: 'tester@test.local', password: 'testerpass123' };
  if (remember !== undefined) body.remember = remember;
  return request(server).post('/api/auth/login').send(body);
};

const refreshCookie = res =>
  (res.headers['set-cookie'] || []).find(c => c.startsWith('refreshToken='));

beforeAll(() => { seedTestData(db); });

describe('remember me', () => {
  it('gives the browser an expiring cookie when asked to remember', async () => {
    const cookie = refreshCookie(await login(true));
    expect(cookie).toBeTruthy();
    expect(cookie).toMatch(/Max-Age=\d+/);
  });

  it('gives it a session cookie when not asked', async () => {
    // No Max-Age and no Expires is what makes a cookie die with the browser.
    const cookie = refreshCookie(await login(false));
    expect(cookie).toBeTruthy();
    expect(cookie).not.toMatch(/Max-Age=/i);
    expect(cookie).not.toMatch(/Expires=/i);
  });

  it('remembers by default, so an older client that sends no flag is unaffected', async () => {
    const cookie = refreshCookie(await login(undefined));
    expect(cookie).toMatch(/Max-Age=\d+/);
  });

  it('still issues a revocable server-side token either way', async () => {
    // The flag is about the browser's copy. The record the server can revoke
    // has to exist regardless, or "log out everywhere" would miss a session.
    const before = db.prepare('SELECT COUNT(*) c FROM refresh_tokens').get().c;
    await login(false);
    expect(db.prepare('SELECT COUNT(*) c FROM refresh_tokens').get().c).toBe(before + 1);
  });

  it('keeps the session working across a refresh when not remembered', async () => {
    const res = await login(false);
    const cookie = refreshCookie(res);
    const refreshed = await request(server).post('/api/auth/refresh').set('Cookie', cookie.split(';')[0]);
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.token).toBeTruthy();
  });
});
