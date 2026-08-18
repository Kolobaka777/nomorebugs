import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { seedTestData, testServer } = await import('./helpers.js');

const server = await testServer(app);
beforeAll(() => {
  seedTestData(db);
});

describe('POST /api/auth/login', () => {
  it('returns a token and user info for valid tester credentials', async () => {
    const res = await request(server)
      .post('/api/auth/login')
      .send({ email: 'tester@test.local', password: 'testerpass123' });

    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.token.length).toBeGreaterThan(10);
    expect(res.body.user.role).toBe('tester');
    expect(res.body.user.password).toBeUndefined();
  });

  it('reports needsBaselineSurvey correctly based on existing survey data', async () => {
    // The tester fixture already has a baseline_survey row.
    const res = await request(server)
      .post('/api/auth/login')
      .send({ email: 'tester@test.local', password: 'testerpass123' });
    expect(res.body.needsBaselineSurvey).toBe(false);
  });

  it('rejects an invalid password', async () => {
    const res = await request(server)
      .post('/api/auth/login')
      .send({ email: 'tester@test.local', password: 'wrong-password' });
    expect(res.status).toBe(401);
  });

  it('rejects an unknown email', async () => {
    const res = await request(server)
      .post('/api/auth/login')
      .send({ email: 'nobody@test.local', password: 'whatever123' });
    expect(res.status).toBe(401);
  });

  it('requires both email and password', async () => {
    const res = await request(server).post('/api/auth/login').send({ email: 'tester@test.local' });
    expect(res.status).toBe(400);
  });
});

describe('authMiddleware', () => {
  it('rejects requests with no Authorization header', async () => {
    const res = await request(server).get('/api/tester/lectures');
    expect(res.status).toBe(401);
  });

  it('rejects requests with a garbage token', async () => {
    const res = await request(server)
      .get('/api/tester/lectures')
      .set('Authorization', 'Bearer this-is-not-a-valid-jwt');
    expect(res.status).toBe(401);
  });
});

// Must run last in this file: the rate limiter's counter is per-app-instance
// and doesn't reset between tests, so tripping it here would make any later
// login-dependent test in this file fail.
describe('login rate limiting', () => {
  it('blocks further login attempts from the same IP after the threshold', async () => {
    let lastStatus = 200;
    // 5 requests already happened in the describe block above; keep going
    // well past the limit (20) to be sure we trip it regardless.
    for (let i = 0; i < 20; i++) {
      const res = await request(server)
        .post('/api/auth/login')
        .send({ email: 'nobody@test.local', password: 'x' });
      lastStatus = res.status;
      if (lastStatus === 429) break;
    }
    expect(lastStatus).toBe(429);
  });
});
