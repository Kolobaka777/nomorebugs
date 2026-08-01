import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { seedTestData, loginAs } = await import('./helpers.js');

// Each of these limiters is its own express-rate-limit instance with its
// own counter — they don't share state with each other (only requests to
// the *same* limiter's own route(s) count toward its threshold), so it's
// safe to exercise all of them from one file. loginLimiter already has
// coverage (auth.test.js); this file is the rest — before this, every one
// of them was only proven "present in code", never proven to actually 429.
let testerToken;

beforeAll(async () => {
  seedTestData(db);
  testerToken = await loginAs(request, app, 'tester@test.local', 'testerpass123');
});

async function fireUntil429(makeRequest, max) {
  let lastStatus = 200;
  for (let i = 0; i < max; i++) {
    lastStatus = (await makeRequest()).status;
    if (lastStatus === 429) break;
  }
  return lastStatus;
}

describe('rate limiters actually trigger, not just exist in code', () => {
  it('registerLimiter (20/15min) on POST /api/auth/register', async () => {
    // Deliberately invalid body (fast 400, no user actually created) — the
    // limiter counts the request regardless of what the route does with it.
    const status = await fireUntil429(
      () => request(app).post('/api/auth/register').send({}),
      21
    );
    expect(status).toBe(429);
  });

  it('refreshLimiter (60/15min) on POST /api/auth/refresh', async () => {
    const status = await fireUntil429(
      () => request(app).post('/api/auth/refresh').send({ refreshToken: 'not-a-real-token' }),
      61
    );
    expect(status).toBe(429);
  });

  it('logoutLimiter (20/15min) on POST /api/auth/logout', async () => {
    const status = await fireUntil429(
      () => request(app).post('/api/auth/logout').send({ refreshToken: 'not-a-real-token' }),
      21
    );
    expect(status).toBe(429);
  });

  it('forgotPasswordLimiter (10/15min) on POST /api/auth/forgot-password', async () => {
    const status = await fireUntil429(
      () => request(app).post('/api/auth/forgot-password').send({ email: 'nobody@test.local' }),
      11
    );
    expect(status).toBe(429);
  });

  it('telegramStartLimiter (20/15min) on POST /api/auth/telegram/start', async () => {
    // Telegram isn't configured in tests (no TELEGRAM_BOT_TOKEN), so every
    // request 503s before touching the DB — fine, the limiter runs first.
    const status = await fireUntil429(
      () => request(app).post('/api/auth/telegram/start').send({}),
      21
    );
    expect(status).toBe(429);
  });

  it('telegramPollLimiter (300/15min) on GET /api/auth/telegram/poll/:token', async () => {
    const status = await fireUntil429(
      () => request(app).get('/api/auth/telegram/poll/not-a-real-token'),
      301
    );
    expect(status).toBe(429);
  });

  it('passwordChangeLimiter (20/15min) on PUT /api/me/password', async () => {
    const status = await fireUntil429(
      () => request(app)
        .put('/api/me/password')
        .set('Authorization', `Bearer ${testerToken}`)
        .send({ current_password: 'wrongpassword', new_password: 'irrelevant12345' }),
      21
    );
    expect(status).toBe(429);
  });
});
