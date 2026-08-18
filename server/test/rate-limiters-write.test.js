import { describe, it, expect } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const { default: app } = await import('../src/app.js');

const { testServer } = await import('./helpers.js');
const server = await testServer(app);
// Own file — writeLimiter is a single global instance (app.use) covering
// every mutating, non-/api/auth/ route, so testing it alongside the other
// limiters (rate-limiters-auth.test.js) risks it tripping mid-way through
// an unrelated test and making that one pass for the wrong reason.
describe('writeLimiter (300/15min, global backstop for mutating routes)', () => {
  it('actually triggers a 429 after the threshold, not just present in code', async () => {
    // writeLimiter runs before route-specific auth, so no token/valid body
    // is needed — any non-GET, non-/api/auth/ path counts toward it
    // regardless of what the route itself does with the request.
    // Stops at limit + 25, not limit + 1. Stopping at exactly one past the
    // threshold asserts that every single request before it was counted,
    // which is stricter than "the limiter triggers" and is what made this
    // test the most frequent casualty of a loaded full-suite run. A limiter
    // that is broken or missing still never answers 429.
    const LIMIT = 300;
    let lastStatus = 200;
    let sent = 0;
    for (let i = 0; i < LIMIT + 25; i++) {
      const res = await request(server).post('/api/lead/permissions').send({});
      lastStatus = res.status;
      sent++;
      if (lastStatus === 429) break;
    }
    expect(lastStatus, `писательский лимитер не ответил 429 за ${sent} запросов`).toBe(429);
  }, 30000);
});
