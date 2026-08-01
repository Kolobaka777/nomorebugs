import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { seedTestData } = await import('./helpers.js');

// Own file so this gets a fresh module load — a fresh in-memory failed-login
// map, and a fresh per-IP loginLimiter budget (20 requests/15min, shared by
// every request in this file — kept deliberately under that throughout, so
// what trips is always the per-account lockout, not the pre-existing IP one
// from a different test file).
beforeAll(() => {
  seedTestData(db);
});

describe('per-account login lockout', () => {
  it('locks a specific account out after repeated wrong passwords, and rejects even the correct password while locked', async () => {
    const email = 'tester@test.local';
    let lastStatus = 200;
    // The lockout trips at 8 failed attempts (well under the IP limiter's
    // 20) — looping one past that confirms the lock is actually in effect,
    // not just that the 8th guess itself was wrong.
    for (let i = 0; i < 9; i++) {
      const res = await request(app).post('/api/auth/login').send({ email, password: 'wrongpassword' });
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);

    const withCorrectPassword = await request(app).post('/api/auth/login').send({ email, password: 'testerpass123' });
    expect(withCorrectPassword.status).toBe(429);
  });

  it('a successful login resets the counter, so a handful of typos afterward does not carry over toward a lockout', async () => {
    const email = 'lead@test.local';
    for (let i = 0; i < 3; i++) {
      await request(app).post('/api/auth/login').send({ email, password: 'wrong' });
    }
    const good = await request(app).post('/api/auth/login').send({ email, password: 'leadpass123' });
    expect(good.status).toBe(200);

    for (let i = 0; i < 3; i++) {
      await request(app).post('/api/auth/login').send({ email, password: 'wrong' });
    }
    const stillOk = await request(app).post('/api/auth/login').send({ email, password: 'leadpass123' });
    expect(stillOk.status).toBe(200);
  });
});
