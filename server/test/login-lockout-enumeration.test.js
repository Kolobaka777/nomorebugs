import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { seedTestData, testServer } = await import('./helpers.js');

const server = await testServer(app);
// Own file — see login-lockout.test.js for why (fresh IP-limiter budget).
beforeAll(() => {
  seedTestData(db);
});

describe('per-account login lockout — enumeration safety', () => {
  it('locks out a nonexistent email exactly like a real one, so the lockout cannot be used to tell which accounts exist', async () => {
    let lastStatus = 200;
    for (let i = 0; i < 9; i++) {
      const res = await request(server)
        .post('/api/auth/login')
        .send({ email: 'nobody-in-particular@test.local', password: 'whatever' });
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
