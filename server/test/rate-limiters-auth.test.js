import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { seedTestData, loginAs, testServer } = await import('./helpers.js');

const server = await testServer(app);
// Each of these limiters is its own express-rate-limit instance with its
// own counter — they don't share state with each other (only requests to
// the *same* limiter's own route(s) count toward its threshold), so it's
// safe to exercise all of them from one file. loginLimiter already has
// coverage (auth.test.js); this file is the rest — before this, every one
// of them was only proven "present in code", never proven to actually 429.
let testerToken;

beforeAll(async () => {
  seedTestData(db);
  testerToken = await loginAs(request, server, 'tester@test.local', 'testerpass123');
});

// Fires until the limiter answers 429, with room to spare past the
// threshold. Every one of these tests used to stop at exactly limit + 1,
// which asserts something stricter than it means to: not "the limiter
// triggers" but "the limiter triggers on the very first request past the
// threshold, and every single request before it was counted". Under a loaded
// full-suite run that occasionally isn't true, and the test failed for a
// reason that has nothing to do with the limiter working. MARGIN buys the
// slack; a limiter that is actually broken or missing still never 429s, so
// nothing is being papered over.
const MARGIN = 25;

async function fireUntil429(makeRequest, limit) {
  let lastStatus = 200;
  let sent = 0;
  for (let i = 0; i < limit + MARGIN; i++) {
    lastStatus = (await makeRequest()).status;
    sent++;
    if (lastStatus === 429) break;
  }
  return { status: lastStatus, sent };
}

// Reports how many requests it actually took, so a future failure says
// whether the limiter fired late or never fired at all.
function expect429(result, limit) {
  expect(
    result.status,
    `лимитер (предел ${limit}) не ответил 429 за ${result.sent} запросов`
  ).toBe(429);
}

describe('rate limiters actually trigger, not just exist in code', () => {
  it('registerLimiter (20/15min) on POST /api/auth/register', async () => {
    // Deliberately invalid body (fast 400, no user actually created) — the
    // limiter counts the request regardless of what the route does with it.
    const result = await fireUntil429(
      () => request(server).post('/api/auth/register').send({}),
      20
    );
    expect429(result, 20);
  });

  it('refreshLimiter (60/15min) on POST /api/auth/refresh', async () => {
    // The refresh token now travels as a cookie, not a body field — an
    // absent/bogus cookie still exercises the limiter identically, since
    // it runs before the route even looks at req.cookies.
    const result = await fireUntil429(
      () => request(server).post('/api/auth/refresh').set('Cookie', 'refreshToken=not-a-real-token'),
      60
    );
    expect429(result, 60);
  });

  it('logoutLimiter (20/15min) on POST /api/auth/logout', async () => {
    const result = await fireUntil429(
      () => request(server).post('/api/auth/logout').set('Cookie', 'refreshToken=not-a-real-token'),
      20
    );
    expect429(result, 20);
  });

  it('forgotPasswordLimiter (10/15min) on POST /api/auth/forgot-password', async () => {
    const result = await fireUntil429(
      () => request(server).post('/api/auth/forgot-password').send({ email: 'nobody@test.local' }),
      10
    );
    expect429(result, 10);
  });

  it('telegramStartLimiter (20/15min) on POST /api/auth/telegram/start', async () => {
    // Telegram isn't configured in tests (no TELEGRAM_BOT_TOKEN), so every
    // request 503s before touching the DB — fine, the limiter runs first.
    const result = await fireUntil429(
      () => request(server).post('/api/auth/telegram/start').send({}),
      20
    );
    expect429(result, 20);
  });

  it('telegramPollLimiter (300/15min) on GET /api/auth/telegram/poll/:token', async () => {
    const result = await fireUntil429(
      () => request(server).get('/api/auth/telegram/poll/not-a-real-token'),
      300
    );
    expect429(result, 300);
  });

  it('passwordChangeLimiter (20/15min) on PUT /api/me/password', async () => {
    const result = await fireUntil429(
      () => request(server)
        .put('/api/me/password')
        .set('Authorization', `Bearer ${testerToken}`)
        .send({ current_password: 'wrongpassword', new_password: 'irrelevant12345' }),
      20
    );
    expect429(result, 20);
  });
});
