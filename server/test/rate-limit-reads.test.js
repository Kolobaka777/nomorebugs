// Reads are not free here. A GET can serve image bytes out of the database
// or run correlated subqueries per catalog row, over a synchronous
// better-sqlite3 handle that holds the event loop while it does. Before
// this limiter existed, 350 consecutive reads drew zero 429s.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';
process.env.RATE_LIMIT_READ = '25';

vi.mock('../src/telegram.js', () => ({ notifyUser: () => {}, notifyUserConfirmed: async () => 'none' }));

const { default: app, resetHealthProbeCache } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { seedTestData, loginAs, testServer } = await import('./helpers.js');

const server = await testServer(app);
let token;

beforeAll(async () => {
  seedTestData(db);
  token = await loginAs(request, server, 'tester@test.local', 'testerpass123');
});

afterAll(() => { delete process.env.RATE_LIMIT_READ; });

const hammer = async (url, times, auth = true) => {
  const codes = [];
  for (let i = 0; i < times; i++) {
    const req = request(server).get(url);
    if (auth) req.set('Authorization', `Bearer ${token}`);
    codes.push((await req).status);
  }
  return codes;
};

describe('reads are throttled', () => {
  it('a flood of GETs eventually gets 429 instead of being served forever', async () => {
    const codes = await hammer('/api/stats', 40, false);
    expect(codes).toContain(429);
  });

  it('the refusal explains itself rather than returning a bare status', async () => {
    await hammer('/api/stats', 40, false);
    const res = await request(server).get('/api/stats');
    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/Слишком много запросов/);
  });
});

describe('the health check is never throttled', () => {
  it('keeps answering after the read limit is long past', async () => {
    // The platform polls this on a schedule. Rate-limiting it out means the
    // orchestrator stops being able to tell a busy service from a dead one,
    // and restarts a healthy container.
    const codes = await hammer('/api/health', 60, false);
    expect(codes).not.toContain(429);
    expect(codes.every(c => c === 200)).toBe(true);
  });

  it('does not write to the database on every request', async () => {
    resetHealthProbeCache();
    const stampOf = () => db.prepare('SELECT checked_at FROM _health_check WHERE id = 1').get()?.checked_at;

    await request(server).get('/api/health');
    const first = stampOf();
    expect(first).toBeTruthy();

    // Fifty more inside the probe interval: the answer is still served, but
    // the disk is not touched again. This is what stops an unauthenticated
    // flood from holding SQLite's single writer against real traffic.
    const writesBefore = db.prepare('SELECT COUNT(*) c FROM _health_check').get().c;
    for (let i = 0; i < 50; i++) {
      expect((await request(server).get('/api/health')).status).toBe(200);
    }
    expect(stampOf()).toBe(first);
    expect(db.prepare('SELECT COUNT(*) c FROM _health_check').get().c).toBe(writesBefore);
  });

  it('probes again once the interval has passed', async () => {
    resetHealthProbeCache();
    const res = await request(server).get('/api/health');
    expect(res.status).toBe(200);
    expect(db.prepare('SELECT checked_at FROM _health_check WHERE id = 1').get()).toBeTruthy();
  });
});
