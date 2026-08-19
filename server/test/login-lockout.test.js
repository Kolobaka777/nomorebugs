// Per-account login lockout — the half of brute-force protection that the
// per-IP limiter can't do, since an attacker rotating IPs otherwise gets
// unlimited attempts at one specific account. See routes/auth.js.
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

const login = (email, password) => request(server).post('/api/auth/login').send({ email, password });

beforeAll(() => {
  seedTestData(db);
});

describe('login lockout', () => {
  it('locks one account after repeated failures, without touching another', async () => {
    for (let i = 0; i < 8; i++) {
      const res = await login('tester@test.local', 'wrong-password');
      expect(res.status).toBe(401);
    }

    const locked = await login('tester@test.local', 'testerpass123'); // now the *right* password
    expect(locked.status).toBe(429);

    // The lock is per account, not global — everyone else still gets in.
    const other = await login('lead@test.local', 'leadpass123');
    expect(other.status).toBe(200);
  });

  // The lockout must not become a new way to learn which addresses exist —
  // an unknown email and a wrong password have to look the same.
  it('answers identically for an unknown email and a wrong password', async () => {
    const unknown = await login('nobody-here@test.local', 'whatever');
    const wrong = await login('lead@test.local', 'definitely-wrong');
    expect(unknown.status).toBe(wrong.status);
    expect(unknown.body.error).toBe(wrong.body.error);
  });

  it('a successful login clears the count before it reaches the threshold', async () => {
    for (let i = 0; i < 5; i++) await login('admin@test.local', 'wrong');
    expect((await login('admin@test.local', 'adminpass123')).status).toBe(200);

    // The counter reset, so another five failures still don't lock it.
    for (let i = 0; i < 5; i++) await login('admin@test.local', 'wrong');
    expect((await login('admin@test.local', 'adminpass123')).status).toBe(200);
  });
});
