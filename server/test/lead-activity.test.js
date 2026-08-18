import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { seedTestData, loginAs, testServer } = await import('./helpers.js');

const server = await testServer(app);
let fixtures, leadToken, testerToken;

beforeAll(async () => {
  fixtures = seedTestData(db);
  // Each login itself inserts an activity_log 'login' row (see the login
  // route) — real fixture data instead of hand-inserting rows, so this also
  // incidentally proves login activity actually gets logged.
  leadToken = await loginAs(request, server, 'lead@test.local', 'leadpass123');
  testerToken = await loginAs(request, server, 'tester@test.local', 'testerpass123');
});

describe('GET /api/lead/activity', () => {
  it('is lead/admin-only', async () => {
    const res = await request(server).get('/api/lead/activity').set('Authorization', `Bearer ${testerToken}`);
    expect(res.status).toBe(403);
  });

  it('returns a {rows, hasMore} shaped feed for a lead', async () => {
    const res = await request(server).get('/api/lead/activity').set('Authorization', `Bearer ${leadToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.rows)).toBe(true);
    expect(typeof res.body.hasMore).toBe('boolean');
    expect(res.body.rows.length).toBeGreaterThan(0);
    // Newest first.
    const actions = res.body.rows.map(r => r.action);
    expect(actions).toContain('login');
  });

  it('filters to a single user via user_id', async () => {
    const res = await request(server)
      .get(`/api/lead/activity?user_id=${fixtures.testerId}`)
      .set('Authorization', `Bearer ${leadToken}`);
    expect(res.status).toBe(200);
    expect(res.body.rows.every(r => r.user_id === fixtures.testerId)).toBe(true);
    expect(res.body.rows.some(r => r.user_id === fixtures.leadId)).toBe(false);
  });

  it('rejects an unauthenticated request', async () => {
    const res = await request(server).get('/api/lead/activity');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/me/activity', () => {
  it('returns a {rows, hasMore} shaped feed scoped to the caller', async () => {
    const res = await request(server).get('/api/me/activity').set('Authorization', `Bearer ${testerToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.rows)).toBe(true);
    expect(typeof res.body.hasMore).toBe('boolean');
    expect(res.body.rows.every(r => r.user_id === fixtures.testerId)).toBe(true);
  });

  it('honors offset for pagination', async () => {
    const page1 = await request(server).get('/api/me/activity?offset=0').set('Authorization', `Bearer ${testerToken}`);
    const page2 = await request(server).get('/api/me/activity?offset=1').set('Authorization', `Bearer ${testerToken}`);
    expect(page1.body.rows[0]?.id).not.toBe(page2.body.rows[0]?.id);
  });

  it('rejects an unauthenticated request', async () => {
    const res = await request(server).get('/api/me/activity');
    expect(res.status).toBe(401);
  });
});

// course_completed reuses activity_log's lecture_id column to stash a
// custom_courses id (a separate id space from lectures — see
// POST /api/courses/time-track) — this checks the route resolves it
// against custom_courses, not lectures, so "Прошла курс «X»" actually
// names the right course instead of silently mismatching or showing none.
describe('course_completed activity rows resolve a course_title from custom_courses', () => {
  it('names the completed course, not a same-numbered lecture', async () => {
    const created = await request(server)
      .post('/api/custom-courses')
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ title: 'Playwright Prereqs', modules: [] });
    expect(created.status).toBe(200);
    const courseId = created.body.id;

    const tracked = await request(server)
      .post('/api/courses/time-track')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ course_id: courseId, seconds_spent: 120 });
    expect(tracked.status).toBe(200);

    const res = await request(server).get('/api/me/activity').set('Authorization', `Bearer ${testerToken}`);
    const row = res.body.rows.find(r => r.action === 'course_completed');
    expect(row).toBeTruthy();
    expect(row.course_title).toBe('Playwright Prereqs');
    expect(row.lecture_title).toBeFalsy();
  });
});
