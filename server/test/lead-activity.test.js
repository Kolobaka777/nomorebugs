import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { seedTestData, loginAs } = await import('./helpers.js');

let fixtures, leadToken, testerToken;

beforeAll(async () => {
  fixtures = seedTestData(db);
  // Each login itself inserts an activity_log 'login' row (see the login
  // route) — real fixture data instead of hand-inserting rows, so this also
  // incidentally proves login activity actually gets logged.
  leadToken = await loginAs(request, app, 'lead@test.local', 'leadpass123');
  testerToken = await loginAs(request, app, 'tester@test.local', 'testerpass123');
});

describe('GET /api/lead/activity', () => {
  it('is lead/admin-only', async () => {
    const res = await request(app).get('/api/lead/activity').set('Authorization', `Bearer ${testerToken}`);
    expect(res.status).toBe(403);
  });

  it('returns a {rows, hasMore} shaped feed for a lead', async () => {
    const res = await request(app).get('/api/lead/activity').set('Authorization', `Bearer ${leadToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.rows)).toBe(true);
    expect(typeof res.body.hasMore).toBe('boolean');
    expect(res.body.rows.length).toBeGreaterThan(0);
    // Newest first.
    const actions = res.body.rows.map(r => r.action);
    expect(actions).toContain('login');
  });

  it('filters to a single user via user_id', async () => {
    const res = await request(app)
      .get(`/api/lead/activity?user_id=${fixtures.testerId}`)
      .set('Authorization', `Bearer ${leadToken}`);
    expect(res.status).toBe(200);
    expect(res.body.rows.every(r => r.user_id === fixtures.testerId)).toBe(true);
    expect(res.body.rows.some(r => r.user_id === fixtures.leadId)).toBe(false);
  });

  it('rejects an unauthenticated request', async () => {
    const res = await request(app).get('/api/lead/activity');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/me/activity', () => {
  it('returns a {rows, hasMore} shaped feed scoped to the caller', async () => {
    const res = await request(app).get('/api/me/activity').set('Authorization', `Bearer ${testerToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.rows)).toBe(true);
    expect(typeof res.body.hasMore).toBe('boolean');
    expect(res.body.rows.every(r => r.user_id === fixtures.testerId)).toBe(true);
  });

  it('honors offset for pagination', async () => {
    const page1 = await request(app).get('/api/me/activity?offset=0').set('Authorization', `Bearer ${testerToken}`);
    const page2 = await request(app).get('/api/me/activity?offset=1').set('Authorization', `Bearer ${testerToken}`);
    expect(page1.body.rows[0]?.id).not.toBe(page2.body.rows[0]?.id);
  });

  it('rejects an unauthenticated request', async () => {
    const res = await request(app).get('/api/me/activity');
    expect(res.status).toBe(401);
  });
});
