import { describe, it, expect } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const { default: app } = await import('../src/app.js');

// Own file — writeLimiter is a single global instance (app.use) covering
// every mutating, non-/api/auth/ route, so testing it alongside the other
// limiters (rate-limiters-auth.test.js) risks it tripping mid-way through
// an unrelated test and making that one pass for the wrong reason.
describe('writeLimiter (300/15min, global backstop for mutating routes)', () => {
  it('actually triggers a 429 after the threshold, not just present in code', async () => {
    // writeLimiter runs before route-specific auth, so no token/valid body
    // is needed — any non-GET, non-/api/auth/ path counts toward it
    // regardless of what the route itself does with the request.
    let lastStatus = 200;
    for (let i = 0; i < 301; i++) {
      const res = await request(app).post('/api/lead/permissions').send({});
      lastStatus = res.status;
      if (lastStatus === 429) break;
    }
    expect(lastStatus).toBe(429);
  }, 20000);
});
